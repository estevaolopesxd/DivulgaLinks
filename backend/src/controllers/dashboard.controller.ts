import { Request, Response, NextFunction } from 'express';
import { MessageStatus, PlatformType } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// Commission rates per platform (percentage)
const COMMISSION_RATES: Record<string, number> = {
  [PlatformType.AMAZON]: 0.08,
  [PlatformType.MERCADO_LIVRE]: 0.05,
  [PlatformType.SHOPEE]: 0.06,
  [PlatformType.ALIEXPRESS]: 0.07,
  [PlatformType.AWIN]: 0.05,
  [PlatformType.MAGALU]: 0.06,
};

export const getStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalProducts,
      activeCampaigns,
      messagesToday,
      totalClicks,
      failedMessages,
      pendingMessages,
    ] = await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.campaign.count({ where: { isActive: true } }),
      prisma.messageLog.count({
        where: {
          status: MessageStatus.SENT,
          sentAt: { gte: todayStart },
        },
      }),
      prisma.clickLog.count(),
      prisma.messageLog.count({ where: { status: MessageStatus.FAILED } }),
      prisma.messageLog.count({ where: { status: MessageStatus.PENDING } }),
    ]);

    res.json({
      stats: {
        totalProducts,
        activeCampaigns,
        messagesToday,
        totalClicks,
        failedMessages,
        pendingMessages,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getClicksTimeline = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const days = 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const clickLogs = await prisma.clickLog.findMany({
      where: { clickedAt: { gte: startDate } },
      select: { clickedAt: true },
      orderBy: { clickedAt: 'asc' },
    });

    // Group by day
    const clicksByDay = new Map<string, number>();

    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      clicksByDay.set(key, 0);
    }

    for (const log of clickLogs) {
      const key = log.clickedAt.toISOString().split('T')[0];
      clicksByDay.set(key, (clicksByDay.get(key) ?? 0) + 1);
    }

    const timeline = Array.from(clicksByDay.entries()).map(([date, clicks]) => ({
      date,
      clicks,
    }));

    res.json({ timeline });
  } catch (error) {
    next(error);
  }
};

export const getTopProducts = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const limit = Number(req.query.limit ?? 10);

    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { clickLogs: true } },
        platform: { select: { name: true, type: true } },
      },
      orderBy: {
        clickLogs: { _count: 'desc' },
      },
      take: limit,
    });

    res.json({
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        price: p.price,
        imageUrl: p.imageUrl,
        affiliateUrl: p.trackingUrl ?? p.affiliateUrl,
        clicks: p._count.clickLogs,
        platform: p.platform,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getMessageStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const [sent, failed, pending, clicked] = await Promise.all([
      prisma.messageLog.count({ where: { status: MessageStatus.SENT } }),
      prisma.messageLog.count({ where: { status: MessageStatus.FAILED } }),
      prisma.messageLog.count({ where: { status: MessageStatus.PENDING } }),
      prisma.messageLog.count({ where: { status: MessageStatus.CLICKED } }),
    ]);

    const total = sent + failed + pending + clicked;
    const successRate = total > 0 ? Math.round((sent / total) * 100) : 0;

    res.json({
      messageStats: {
        sent,
        failed,
        pending,
        clicked,
        total,
        successRate,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getCampaignPerformance = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: {
        _count: {
          select: {
            products: true,
            destinations: true,
          },
        },
        messageLogs: {
          select: { status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const performance = campaigns.map((campaign) => {
      const sent = campaign.messageLogs.filter((l) => l.status === MessageStatus.SENT).length;
      const failed = campaign.messageLogs.filter((l) => l.status === MessageStatus.FAILED).length;
      const pending = campaign.messageLogs.filter((l) => l.status === MessageStatus.PENDING).length;
      const total = campaign.messageLogs.length;
      const successRate = total > 0 ? Math.round((sent / total) * 100) : 0;

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        isActive: campaign.isActive,
        products: campaign._count.products,
        destinations: campaign._count.destinations,
        totalMessages: total,
        sent,
        failed,
        pending,
        successRate,
      };
    });

    res.json({ campaigns: performance });
  } catch (error) {
    next(error);
  }
};

export const getRevenueEstimate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const clickedMessages = await prisma.messageLog.findMany({
      where: { status: MessageStatus.CLICKED },
      include: {
        product: {
          include: { platform: { select: { type: true } } },
        },
      },
    });

    let totalEstimate = 0;
    const byPlatform: Record<string, { clicks: number; estimate: number }> = {};

    for (const log of clickedMessages) {
      if (!log.product) continue;

      const platformType = log.product.platform?.type ?? 'UNKNOWN';
      const commissionRate = COMMISSION_RATES[platformType] ?? 0.05;
      const estimate = log.product.price * commissionRate;

      totalEstimate += estimate;

      if (!byPlatform[platformType]) {
        byPlatform[platformType] = { clicks: 0, estimate: 0 };
      }
      byPlatform[platformType].clicks++;
      byPlatform[platformType].estimate += estimate;
    }

    res.json({
      revenueEstimate: {
        total: Math.round(totalEstimate * 100) / 100,
        totalClicks: clickedMessages.length,
        byPlatform: Object.entries(byPlatform).map(([platform, data]) => ({
          platform,
          clicks: data.clicks,
          estimate: Math.round(data.estimate * 100) / 100,
        })),
        disclaimer:
          'Estimates based on average commission rates. Actual revenue may vary.',
      },
    });
  } catch (error) {
    next(error);
  }
};
