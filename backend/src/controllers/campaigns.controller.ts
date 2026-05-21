import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CampaignStatus, DestinationType, ProductRepeatMode } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error';
import { logger } from '../utils/logger';
import campaignService from '../services/campaign.service';

// Valida formato "HH:mm"
const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato inválido — use HH:mm')
  .optional();

const baseCampaignSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  messageTemplate: z.string().min(10),
  intervalMinutes: z.number().int().min(1).default(60),
  delayBetweenMessages: z.number().int().min(0).default(5000),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  platforms: z.array(z.string()).optional().default([]),
  // Janela de horário de funcionamento
  allowedStartTime: timeString,
  allowedEndTime: timeString,
  allowedWeekdays: z
    .array(z.number().int().min(0).max(6))
    .optional()
    .default([]),
  // Política de repetição de produto
  productRepeatMode: z.nativeEnum(ProductRepeatMode).optional().default(ProductRepeatMode.ALWAYS),
});

const campaignSchema = baseCampaignSchema.refine(
  (d) => !(d.allowedStartTime && !d.allowedEndTime) && !(!d.allowedStartTime && d.allowedEndTime),
  { message: 'Informe início e fim do horário juntos', path: ['allowedEndTime'] },
);

export const listCampaigns = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      status: z.nativeEnum(CampaignStatus).optional(),
    });

    const query = schema.parse(req.query);
    const skip = (query.page - 1) * query.limit;

    const where: any = {};
    if (query.status) where.status = query.status;

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              destinations: true,
              products: true,
              messageLogs: true,
            },
          },
        },
      }),
      prisma.campaign.count({ where }),
    ]);

    res.json({
      campaigns,
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

export const getCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        destinations: true,
        products: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                price: true,
                imageUrl: true,
                affiliateUrl: true,
              },
            },
          },
        },
        messageLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        schedules: true,
        _count: {
          select: { messageLogs: true },
        },
      },
    });

    if (!campaign) {
      throw new AppError('Campaign not found', 404);
    }

    res.json({ campaign });
  } catch (error) {
    next(error);
  }
};

export const createCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = campaignSchema.parse(req.body);

    const campaign = await prisma.campaign.create({
      data: {
        name: data.name,
        description: data.description,
        messageTemplate: data.messageTemplate,
        intervalMinutes: data.intervalMinutes,
        delayBetweenMessages: data.delayBetweenMessages,
        startTime: data.startTime ? new Date(data.startTime) : undefined,
        endTime: data.endTime ? new Date(data.endTime) : undefined,
        platforms: data.platforms,
        status: CampaignStatus.DRAFT,
        allowedStartTime: data.allowedStartTime ?? null,
        allowedEndTime: data.allowedEndTime ?? null,
        allowedWeekdays: data.allowedWeekdays,
        productRepeatMode: data.productRepeatMode,
      },
    });

    res.status(201).json({ message: 'Campaign created', campaign });
  } catch (error) {
    next(error);
  }
};

export const updateCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = baseCampaignSchema.partial().parse(req.body);

    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing) throw new AppError('Campaign not found', 404);

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.messageTemplate !== undefined && { messageTemplate: data.messageTemplate }),
        ...(data.intervalMinutes !== undefined && { intervalMinutes: data.intervalMinutes }),
        ...(data.delayBetweenMessages !== undefined && {
          delayBetweenMessages: data.delayBetweenMessages,
        }),
        ...(data.startTime !== undefined && { startTime: new Date(data.startTime!) }),
        ...(data.endTime !== undefined && { endTime: new Date(data.endTime!) }),
        ...(data.platforms !== undefined && { platforms: data.platforms }),
        // Time window
        ...(data.allowedStartTime !== undefined && { allowedStartTime: data.allowedStartTime ?? null }),
        ...(data.allowedEndTime !== undefined && { allowedEndTime: data.allowedEndTime ?? null }),
        ...(data.allowedWeekdays !== undefined && { allowedWeekdays: data.allowedWeekdays }),
        // Product repeat mode
        ...(data.productRepeatMode !== undefined && { productRepeatMode: data.productRepeatMode }),
      },
    });

    res.json({ message: 'Campaign updated', campaign });
  } catch (error) {
    next(error);
  }
};

export const deleteCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError('Campaign not found', 404);

    if (campaign.isActive) {
      await campaignService.stopCampaign(id);
    }

    await prisma.campaign.delete({ where: { id } });

    res.json({ message: 'Campaign deleted' });
  } catch (error) {
    next(error);
  }
};

export const startCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError('Campaign not found', 404);

    if (campaign.isActive) {
      res.json({ message: 'Campaign is already active', status: campaign.status });
      return;
    }

    await campaignService.startCampaign(id);

    res.json({ message: 'Campaign started', status: CampaignStatus.ACTIVE });
  } catch (error) {
    next(error);
  }
};

export const stopCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError('Campaign not found', 404);

    await campaignService.stopCampaign(id);

    res.json({ message: 'Campaign stopped', status: CampaignStatus.PAUSED });
  } catch (error) {
    next(error);
  }
};

export const addDestination = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const schema = z.object({
      type: z.nativeEnum(DestinationType),
      destinationId: z.string().min(1),
      destinationName: z.string().min(1),
      accountId: z.string().min(1),
      // accountType is optional — derived from type if absent
      accountType: z.string().optional(),
    });

    const data = schema.parse(req.body);

    // Derive accountType from the destination type when not explicitly provided
    const accountType =
      data.accountType ??
      (data.type.startsWith('WHATSAPP') ? 'WHATSAPP' : 'TELEGRAM');

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError('Campaign not found', 404);

    const destination = await prisma.campaignDestination.create({
      data: {
        campaignId: id,
        type: data.type,
        destinationId: data.destinationId,
        destinationName: data.destinationName,
        accountId: data.accountId,
        accountType,
        isActive: true,
      },
    });

    res.status(201).json({ message: 'Destination added', destination });
  } catch (error) {
    next(error);
  }
};

export const removeDestination = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id, destinationId } = req.params;

    await prisma.campaignDestination.delete({
      where: { id: destinationId },
    });

    res.json({ message: 'Destination removed' });
  } catch (error) {
    next(error);
  }
};

export const addProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const schema = z.object({ productId: z.string().uuid() });
    const data = schema.parse(req.body);

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError('Campaign not found', 404);

    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) throw new AppError('Product not found', 404);

    const relation = await prisma.campaignProduct.create({
      data: { campaignId: id, productId: data.productId },
    });

    res.status(201).json({ message: 'Product added to campaign', relation });
  } catch (error) {
    next(error);
  }
};

export const removeProduct = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id, productId } = req.params;

    await prisma.campaignProduct.deleteMany({
      where: { campaignId: id, productId },
    });

    res.json({ message: 'Product removed from campaign' });
  } catch (error) {
    next(error);
  }
};
