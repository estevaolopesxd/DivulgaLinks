import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error';
import { sanitizeUser } from '../utils/sanitize';

// ─── Schemas ────────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      return v === 'true';
    }),
  search: z.string().optional(),
});

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2).max(100),
  role: z.nativeEnum(UserRole).optional().default(UserRole.USER),
  isActive: z.boolean().optional().default(true),
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

const updateMeSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

// ─── Controllers ─────────────────────────────────────────────────────────────

export const listUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const query = listQuerySchema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: Record<string, unknown> = {};
    if (query.role !== undefined) where.role = query.role;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { campaigns: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users: users.map(sanitizeUser), total, page: query.page, limit: query.limit });
  } catch (error) {
    next(error);
  }
};

export const getUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new AppError('User not found', 404);

    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
};

export const createUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = createUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('Email already in use', 409);

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: data.role,
        isActive: data.isActive,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    res.status(201).json({ message: 'User created', user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = updateUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new AppError('User not found', 404);

    if (data.email && data.email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email: data.email } });
      if (emailTaken) throw new AppError('Email already in use', 409);
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.password !== undefined) {
      updateData.password = await bcrypt.hash(data.password, 12);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    res.json({ message: 'User updated', user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) throw new AppError('Not authenticated', 401);
    if (req.user.id === id) throw new AppError('Cannot delete your own account', 400);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new AppError('User not found', 404);

    await prisma.user.delete({ where: { id } });

    res.json({ message: 'User deleted' });
  } catch (error) {
    next(error);
  }
};

export const toggleActive = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) throw new AppError('Not authenticated', 401);
    if (req.user.id === id) throw new AppError('Cannot deactivate your own account', 400);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new AppError('User not found', 404);

    const user = await prisma.user.update({
      where: { id },
      data: { isActive: !existing.isActive },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        updatedAt: true,
      },
    });

    res.json({ message: `User ${user.isActive ? 'activated' : 'deactivated'}`, user });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new AppError('User not found', 404);

    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
};

export const updateMe = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authenticated', 401);

    const data = updateMeSchema.parse(req.body);

    const updateData: Record<string, unknown> = {};

    if (data.name) updateData.name = data.name;

    if (data.newPassword) {
      if (!data.currentPassword) {
        throw new AppError('Current password is required to change password', 400);
      }

      const dbUser = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!dbUser) throw new AppError('User not found', 404);

      const valid = await bcrypt.compare(data.currentPassword, dbUser.password);
      if (!valid) throw new AppError('Current password is incorrect', 400);

      updateData.password = await bcrypt.hash(data.newPassword, 12);
    }

    if (Object.keys(updateData).length === 0) {
      throw new AppError('No fields to update', 400);
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    res.json({ message: 'Profile updated', user });
  } catch (error) {
    next(error);
  }
};
