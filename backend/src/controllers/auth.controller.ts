import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../middleware/error';
import { sanitizeUser } from '../utils/sanitize';

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const generateToken = (userId: string, email: string, role: UserRole): string => {
  return jwt.sign({ userId, email, role }, env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new AppError('Email already in use', 409);
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    // First user becomes admin
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? UserRole.ADMIN : UserRole.USER;

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    const token = generateToken(user.id, user.email, user.role);

    res.status(201).json({
      message: 'User registered successfully',
      user: sanitizeUser(user),
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const passwordValid = await bcrypt.compare(data.password, user.password);
    if (!passwordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    if (!user.isActive) {
      throw new AppError('Conta desativada', 403);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = generateToken(user.id, user.email, user.role);

    res.json({
      message: 'Login successful',
      user: sanitizeUser({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      }),
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    const schema = z.object({
      name: z.string().min(2).max(100).optional(),
      currentPassword: z.string().optional(),
      newPassword: z.string().min(8).optional(),
    });

    const data = schema.parse(req.body);

    const updateData: Record<string, string> = {};

    if (data.name) {
      updateData.name = data.name;
    }

    if (data.newPassword) {
      if (!data.currentPassword) {
        throw new AppError('Current password is required to change password', 400);
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) throw new AppError('User not found', 404);

      const valid = await bcrypt.compare(data.currentPassword, user.password);
      if (!valid) throw new AppError('Current password is incorrect', 400);

      updateData.password = await bcrypt.hash(data.newPassword, 12);
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        updatedAt: true,
      },
    });

    res.json({ message: 'Profile updated', user: updated });
  } catch (error) {
    next(error);
  }
};
