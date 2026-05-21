import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { PlatformType } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error';
import { logger } from '../utils/logger';
import { parseProductsCSV } from '../utils/csvParser';
import { AmazonAffiliateService } from '../services/affiliate/amazon.service';
import { MercadoLivreAffiliateService } from '../services/affiliate/mercadolivre.service';
import { ShopeeAffiliateService } from '../services/affiliate/shopee.service';
import { BaseAffiliateService } from '../services/affiliate/base';

const productSchema = z.object({
  title: z.string().min(2).max(500),
  description: z.string().max(5000).optional(),
  price: z.number().positive(),
  originalPrice: z.number().positive().optional(),
  imageUrl: z.string().url().optional(),
  affiliateUrl: z.string().url(),
  platformId: z.string().uuid().optional(),
  externalId: z.string().optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string()).optional().default([]),
  isActive: z.boolean().optional().default(true),
});

export const listProducts = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      platformId: z.string().uuid().optional(),
      category: z.string().optional(),
      search: z.string().optional(),
      isActive: z.coerce.boolean().optional(),
    });

    const query = schema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: any = {};
    if (query.platformId) where.platformId = query.platformId;
    if (query.category) where.category = { contains: query.category, mode: 'insensitive' };
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { category: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { importedAt: 'desc' },
        include: {
          platform: { select: { id: true, name: true, type: true } },
          _count: { select: { clickLogs: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      products,
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

export const getProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        platform: { select: { id: true, name: true, type: true } },
        _count: { select: { clickLogs: true, messageLogs: true } },
      },
    });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    res.json({ product });
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = productSchema.parse(req.body);

    const product = await prisma.product.create({
      data: {
        title: data.title,
        description: data.description,
        price: data.price,
        originalPrice: data.originalPrice,
        imageUrl: data.imageUrl,
        affiliateUrl: data.affiliateUrl,
        platformId: data.platformId,
        externalId: data.externalId,
        category: data.category,
        tags: data.tags,
        isActive: data.isActive,
      },
    });

    res.status(201).json({ message: 'Product created', product });
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = productSchema.partial().parse(req.body);

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.originalPrice !== undefined && { originalPrice: data.originalPrice }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.affiliateUrl !== undefined && { affiliateUrl: data.affiliateUrl }),
        ...(data.platformId !== undefined && { platformId: data.platformId }),
        ...(data.externalId !== undefined && { externalId: data.externalId }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    res.json({ message: 'Product updated', product });
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.product.delete({ where: { id } });

    res.json({ message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
};

export const importCSV = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.file) {
      throw new AppError('CSV file is required', 400);
    }

    const platformId = req.body.platformId as string | undefined;

    const { products, errors } = await parseProductsCSV(req.file.buffer);

    if (products.length === 0) {
      res.status(400).json({
        message: 'No valid products found in CSV',
        errors,
      });
      return;
    }

    const created = await prisma.product.createMany({
      data: products.map((p) => ({
        title: p.title,
        description: p.description,
        price: p.price,
        originalPrice: p.originalPrice,
        imageUrl: p.imageUrl,
        affiliateUrl: p.affiliateUrl,
        category: p.category,
        tags: p.tags,
        platformId: platformId ?? null,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    res.status(201).json({
      message: `Imported ${created.count} products`,
      imported: created.count,
      skipped: products.length - created.count,
      errors,
    });
  } catch (error) {
    next(error);
  }
};

const getAffiliateService = (
  type: PlatformType,
  affiliateId: string,
  apiKey?: string | null,
  apiSecret?: string | null,
): BaseAffiliateService => {
  switch (type) {
    case PlatformType.AMAZON:
      return new AmazonAffiliateService(affiliateId, apiKey ?? undefined, apiSecret ?? undefined);
    case PlatformType.MERCADO_LIVRE:
      return new MercadoLivreAffiliateService(affiliateId, apiKey ?? undefined, apiSecret ?? undefined);
    case PlatformType.SHOPEE:
      return new ShopeeAffiliateService(affiliateId, apiKey ?? undefined, apiSecret ?? undefined);
    default:
      throw new AppError(`Affiliate service not available for platform type: ${type}`, 400);
  }
};

export const importFromPlatform = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = z.object({
      platformId: z.string().uuid(),
      query: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(50).default(10),
    });

    const data = schema.parse(req.body);

    const platform = await prisma.platform.findUnique({
      where: { id: data.platformId },
    });

    if (!platform) {
      throw new AppError('Platform not found', 404);
    }

    if (!platform.isActive) {
      throw new AppError('Platform is not active', 400);
    }

    const service = getAffiliateService(
      platform.type,
      platform.affiliateId,
      platform.apiKey,
      platform.apiSecret,
    );

    const affiliateProducts = await service.searchProducts({
      query: data.query,
      limit: data.limit,
    });

    if (affiliateProducts.length === 0) {
      res.json({ message: 'No products found', products: [] });
      return;
    }

    const created = await prisma.$transaction(
      affiliateProducts.map((p) =>
        prisma.product.upsert({
          where: {
            id: uuidv4(), // Force create - will not match existing
          },
          create: {
            title: p.title,
            description: p.description,
            price: p.price,
            originalPrice: p.originalPrice,
            imageUrl: p.imageUrl,
            affiliateUrl: p.affiliateUrl,
            platformId: platform.id,
            externalId: p.externalId,
            category: p.category,
            tags: p.tags ?? [],
            isActive: true,
          },
          update: {},
        }),
      ),
    );

    res.status(201).json({
      message: `Imported ${created.length} products from ${platform.name}`,
      products: created,
    });
  } catch (error) {
    next(error);
  }
};

export const generateTrackingUrl = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    // Generate a short code for tracking
    // URL points to /api/r/:shortCode which is proxied by nginx to the backend
    const shortCode = uuidv4().replace(/-/g, '').substring(0, 8);
    const baseUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const trackingUrl = `${baseUrl}/api/r/${shortCode}`;

    await prisma.product.update({
      where: { id },
      data: { trackingUrl },
    });

    res.json({
      message: 'Tracking URL generated',
      trackingUrl,
      shortCode,
    });
  } catch (error) {
    next(error);
  }
};
