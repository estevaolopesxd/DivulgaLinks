import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PlatformType } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error';
import { logger } from '../utils/logger';
import { sanitizePlatform } from '../utils/sanitize';
import { AmazonAffiliateService } from '../services/affiliate/amazon.service';
import { MercadoLivreAffiliateService } from '../services/affiliate/mercadolivre.service';
import { ShopeeAffiliateService } from '../services/affiliate/shopee.service';

const platformSchema = z.object({
  name: z.string().min(2).max(100),
  type: z.nativeEnum(PlatformType),
  affiliateId: z.string().min(1, 'Affiliate ID is required'),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  config: z.record(z.unknown()).optional(),
});

export const listPlatforms = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const platforms = await prisma.platform.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        affiliateId: true,
        apiKey: true,
        isActive: true,
        config: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { products: true } },
      },
    });

    res.json({ platforms: platforms.map(sanitizePlatform) });
  } catch (error) {
    next(error);
  }
};

export const getPlatform = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const platform = await prisma.platform.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        affiliateId: true,
        apiKey: true,
        isActive: true,
        config: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { products: true } },
      },
    });

    if (!platform) {
      throw new AppError('Platform not found', 404);
    }

    res.json({ platform: sanitizePlatform(platform) });
  } catch (error) {
    next(error);
  }
};

export const createPlatform = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = platformSchema.parse(req.body);

    const platform = await prisma.platform.create({
      data: {
        name: data.name,
        type: data.type,
        affiliateId: data.affiliateId,
        apiKey: data.apiKey,
        apiSecret: data.apiSecret,
        isActive: data.isActive,
        config: data.config as any,
      },
    });

    res.status(201).json({ message: 'Platform created', platform: sanitizePlatform(platform) });
  } catch (error) {
    next(error);
  }
};

export const updatePlatform = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = platformSchema.partial().parse(req.body);

    const platform = await prisma.platform.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.affiliateId !== undefined && { affiliateId: data.affiliateId }),
        ...(data.apiKey !== undefined && { apiKey: data.apiKey }),
        ...(data.apiSecret !== undefined && { apiSecret: data.apiSecret }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.config !== undefined && { config: data.config as any }),
      },
    });

    res.json({ message: 'Platform updated', platform: sanitizePlatform(platform) });
  } catch (error) {
    next(error);
  }
};

export const deletePlatform = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.platform.delete({ where: { id } });

    res.json({ message: 'Platform deleted' });
  } catch (error) {
    next(error);
  }
};

export const testConnection = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const platform = await prisma.platform.findUnique({ where: { id } });
    if (!platform) {
      throw new AppError('Platform not found', 404);
    }

    let result: { ok: boolean; message: string };

    switch (platform.type) {
      case PlatformType.AMAZON: {
        const svc = new AmazonAffiliateService(
          platform.affiliateId,
          platform.apiKey ?? undefined,
          platform.apiSecret ?? undefined,
        );
        result = await svc.testConnection();
        break;
      }
      case PlatformType.MERCADO_LIVRE: {
        const svc = new MercadoLivreAffiliateService(
          platform.affiliateId,
          platform.apiKey ?? undefined,
          platform.apiSecret ?? undefined,
        );
        result = await svc.testConnection();
        break;
      }
      case PlatformType.SHOPEE: {
        const svc = new ShopeeAffiliateService(
          platform.affiliateId,
          platform.apiKey ?? undefined,
          platform.apiSecret ?? undefined,
        );
        result = await svc.testConnection();
        break;
      }
      default:
        result = { ok: true, message: `Platform type ${platform.type} configured` };
    }

    res.json({ result: { ok: result.ok, message: result.message } });
  } catch (error) {
    next(error);
  }
};
