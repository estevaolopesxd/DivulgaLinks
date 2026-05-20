import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { MessageStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const csvEscape = (value: string): string => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export const getMessageLogs = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      campaignId: z.string().uuid().optional(),
      status: z.nativeEnum(MessageStatus).optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    });

    const query = schema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: any = {};
    if (query.campaignId) where.campaignId = query.campaignId;
    if (query.status) where.status = query.status;
    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      prisma.messageLog.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          campaign: { select: { id: true, name: true } },
          product: { select: { id: true, title: true } },
        },
      }),
      prisma.messageLog.count({ where }),
    ]);

    res.json({
      logs,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getClickLogs = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      productId: z.string().uuid().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    });

    const query = schema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: any = {};
    if (query.productId) where.productId = query.productId;
    if (query.startDate || query.endDate) {
      where.clickedAt = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      prisma.clickLog.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { clickedAt: 'desc' },
        include: {
          product: { select: { id: true, title: true, price: true } },
        },
      }),
      prisma.clickLog.count({ where }),
    ]);

    res.json({
      logs,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const exportLogs = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = z.object({
      type: z.enum(['messages', 'clicks']).default('messages'),
      campaignId: z.string().uuid().optional(),
      productId: z.string().uuid().optional(),
      status: z.nativeEnum(MessageStatus).optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    });

    const query = schema.parse(req.query);
    const filename = `${query.type}-export-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (query.type === 'messages') {
      const where: any = {};
      if (query.campaignId) where.campaignId = query.campaignId;
      if (query.status) where.status = query.status;
      if (query.startDate || query.endDate) {
        where.createdAt = {
          ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
          ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
        };
      }

      const logs = await prisma.messageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          campaign: { select: { name: true } },
          product: { select: { title: true } },
        },
        take: 10000,
      });

      const header = 'ID,Campaign,Product,DestinationID,DestinationType,Status,SentAt,FailedReason,CreatedAt\n';
      res.write(header);

      for (const log of logs) {
        const row = [
          log.id,
          csvEscape(log.campaign?.name ?? ''),
          csvEscape(log.product?.title ?? ''),
          csvEscape(log.destinationId),
          log.destinationType,
          log.status,
          log.sentAt?.toISOString() ?? '',
          csvEscape(log.failedReason ?? ''),
          log.createdAt.toISOString(),
        ].join(',');

        res.write(row + '\n');
      }
    } else {
      const where: any = {};
      if (query.productId) where.productId = query.productId;
      if (query.startDate || query.endDate) {
        where.clickedAt = {
          ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
          ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
        };
      }

      const logs = await prisma.clickLog.findMany({
        where,
        orderBy: { clickedAt: 'desc' },
        include: {
          product: { select: { title: true, price: true } },
        },
        take: 10000,
      });

      const header = 'ID,ProductTitle,ProductPrice,ShortCode,IPAddress,UserAgent,ClickedAt\n';
      res.write(header);

      for (const log of logs) {
        const row = [
          log.id,
          csvEscape(log.product?.title ?? ''),
          log.product?.price?.toString() ?? '',
          log.shortCode,
          csvEscape(log.ipAddress ?? ''),
          csvEscape(log.userAgent ?? ''),
          log.clickedAt.toISOString(),
        ].join(',');

        res.write(row + '\n');
      }
    }

    res.end();
  } catch (error) {
    next(error);
  }
};

/**
 * Track a click when a user visits a tracking URL.
 */
export const trackClick = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { shortCode } = req.params;

    const product = await prisma.product.findFirst({
      where: { trackingUrl: { contains: shortCode } },
    });

    if (!product) {
      res.redirect(302, process.env.FRONTEND_URL ?? '/');
      return;
    }

    // Log the click
    await prisma.clickLog.create({
      data: {
        productId: product.id,
        shortCode,
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    // Redirect to affiliate URL
    res.redirect(302, product.affiliateUrl);
  } catch (error) {
    next(error);
  }
};
