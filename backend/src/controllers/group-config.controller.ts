import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { DestinationType } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error';

// ─── Validation helpers ───────────────────────────────────────────────────────

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const timeSchema = z
  .string()
  .regex(timeRegex, 'Must be in HH:mm format (24h)')
  .optional();

const configBodySchema = z.object({
  destinationId: z.string().min(1),
  destinationType: z.nativeEnum(DestinationType),
  accountId: z.string().min(1),
  displayName: z.string().min(1),
  allowedStartTime: timeSchema,
  allowedEndTime: timeSchema,
  allowedWeekdays: z
    .array(z.number().int().min(0).max(6))
    .optional()
    .default([]),
  maxMessagesPerDay: z.number().int().positive().optional(),
  minIntervalMinutes: z.number().int().positive().optional(),
  allowedPlatformIds: z.array(z.string()).optional().default([]),
  customTemplate: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

const updateBodySchema = configBodySchema.partial().omit({ destinationId: true, accountId: true });

// ─── Controllers ─────────────────────────────────────────────────────────────

export const listConfigs = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = z.object({
      accountId: z.string().optional(),
    });
    const query = schema.parse(req.query);

    const where: Record<string, unknown> = {};
    if (query.accountId) where.accountId = query.accountId;

    const configs = await prisma.destinationConfig.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ configs });
  } catch (error) {
    next(error);
  }
};

export const getConfig = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const config = await prisma.destinationConfig.findUnique({ where: { id } });
    if (!config) throw new AppError('Config not found', 404);

    res.json({ config });
  } catch (error) {
    next(error);
  }
};

export const upsertConfig = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = configBodySchema.parse(req.body);

    // Validate time pair consistency
    if (
      (data.allowedStartTime && !data.allowedEndTime) ||
      (!data.allowedStartTime && data.allowedEndTime)
    ) {
      throw new AppError('Both allowedStartTime and allowedEndTime must be provided together', 400);
    }

    const config = await prisma.destinationConfig.upsert({
      where: {
        destinationId_accountId: {
          destinationId: data.destinationId,
          accountId: data.accountId,
        },
      },
      create: {
        destinationId: data.destinationId,
        destinationType: data.destinationType,
        accountId: data.accountId,
        displayName: data.displayName,
        allowedStartTime: data.allowedStartTime ?? null,
        allowedEndTime: data.allowedEndTime ?? null,
        allowedWeekdays: data.allowedWeekdays,
        maxMessagesPerDay: data.maxMessagesPerDay ?? null,
        minIntervalMinutes: data.minIntervalMinutes ?? null,
        allowedPlatformIds: data.allowedPlatformIds,
        customTemplate: data.customTemplate ?? null,
        isActive: data.isActive,
      },
      update: {
        destinationType: data.destinationType,
        displayName: data.displayName,
        allowedStartTime: data.allowedStartTime ?? null,
        allowedEndTime: data.allowedEndTime ?? null,
        allowedWeekdays: data.allowedWeekdays,
        maxMessagesPerDay: data.maxMessagesPerDay ?? null,
        minIntervalMinutes: data.minIntervalMinutes ?? null,
        allowedPlatformIds: data.allowedPlatformIds,
        customTemplate: data.customTemplate ?? null,
        isActive: data.isActive,
      },
    });

    res.json({ message: 'Config upserted', config });
  } catch (error) {
    next(error);
  }
};

export const updateConfig = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = updateBodySchema.parse(req.body);

    const existing = await prisma.destinationConfig.findUnique({ where: { id } });
    if (!existing) throw new AppError('Config not found', 404);

    // Validate time pair consistency considering existing values
    const startTime = data.allowedStartTime !== undefined ? data.allowedStartTime : existing.allowedStartTime;
    const endTime = data.allowedEndTime !== undefined ? data.allowedEndTime : existing.allowedEndTime;

    if ((startTime && !endTime) || (!startTime && endTime)) {
      throw new AppError('Both allowedStartTime and allowedEndTime must be provided together', 400);
    }

    const updateData: Record<string, unknown> = {};
    if (data.destinationType !== undefined) updateData.destinationType = data.destinationType;
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.allowedStartTime !== undefined) updateData.allowedStartTime = data.allowedStartTime ?? null;
    if (data.allowedEndTime !== undefined) updateData.allowedEndTime = data.allowedEndTime ?? null;
    if (data.allowedWeekdays !== undefined) updateData.allowedWeekdays = data.allowedWeekdays;
    if (data.maxMessagesPerDay !== undefined) updateData.maxMessagesPerDay = data.maxMessagesPerDay ?? null;
    if (data.minIntervalMinutes !== undefined) updateData.minIntervalMinutes = data.minIntervalMinutes ?? null;
    if (data.allowedPlatformIds !== undefined) updateData.allowedPlatformIds = data.allowedPlatformIds;
    if (data.customTemplate !== undefined) updateData.customTemplate = data.customTemplate ?? null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const config = await prisma.destinationConfig.update({
      where: { id },
      data: updateData,
    });

    res.json({ message: 'Config updated', config });
  } catch (error) {
    next(error);
  }
};

export const deleteConfig = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await prisma.destinationConfig.findUnique({ where: { id } });
    if (!existing) throw new AppError('Config not found', 404);

    await prisma.destinationConfig.delete({ where: { id } });

    res.json({ message: 'Config deleted' });
  } catch (error) {
    next(error);
  }
};

export const getStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await prisma.destinationConfig.findUnique({ where: { id } });
    if (!existing) throw new AppError('Config not found', 404);

    const since = new Date();
    since.setDate(since.getDate() - 30);
    since.setHours(0, 0, 0, 0);

    const stats = await prisma.destinationDailyStats.findMany({
      where: {
        destinationConfigId: id,
        date: { gte: since },
      },
      orderBy: { date: 'asc' },
    });

    res.json({ stats });
  } catch (error) {
    next(error);
  }
};
