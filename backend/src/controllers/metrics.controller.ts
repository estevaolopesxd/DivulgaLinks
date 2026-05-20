import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { MessageStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error';

// ─── Shared query schemas ─────────────────────────────────────────────────────

const dateRangeSchema = z.object({
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

// ─── getMessageVolume ─────────────────────────────────────────────────────────

export const getMessageVolume = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = dateRangeSchema.extend({
      granularity: z.enum(['day', 'week', 'month']).default('day'),
      campaignId: z.string().uuid().optional(),
      destinationId: z.string().optional(),
      platformId: z.string().uuid().optional(),
      status: z.nativeEnum(MessageStatus).optional(),
    });

    const query = schema.parse(req.query);

    const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    // Build raw WHERE fragments
    const conditions: string[] = [
      `ml."createdAt" >= $1::timestamptz`,
      `ml."createdAt" <= $2::timestamptz`,
    ];
    const params: unknown[] = [startDate, endDate];
    let paramIdx = 3;

    if (query.campaignId) {
      conditions.push(`ml."campaignId" = $${paramIdx++}::uuid`);
      params.push(query.campaignId);
    }
    if (query.destinationId) {
      conditions.push(`ml."destinationId" = $${paramIdx++}`);
      params.push(query.destinationId);
    }
    if (query.status) {
      conditions.push(`ml.status = $${paramIdx++}::"MessageStatus"`);
      params.push(query.status);
    }

    const whereClause = conditions.join(' AND ');
    const truncUnit = query.granularity === 'week' ? 'week' : query.granularity === 'month' ? 'month' : 'day';

    const rows = await prisma.$queryRawUnsafe<
      { date: Date; sent: bigint; failed: bigint; pending: bigint; total: bigint }[]
    >(
      `SELECT
         DATE_TRUNC('${truncUnit}', ml."createdAt") AS date,
         COUNT(*) FILTER (WHERE ml.status = 'SENT')    AS sent,
         COUNT(*) FILTER (WHERE ml.status = 'FAILED')  AS failed,
         COUNT(*) FILTER (WHERE ml.status = 'PENDING') AS pending,
         COUNT(*)                                       AS total
       FROM message_logs ml
       WHERE ${whereClause}
       GROUP BY 1
       ORDER BY 1`,
      ...params,
    );

    const result = rows.map((r) => ({
      date: r.date,
      sent: Number(r.sent),
      failed: Number(r.failed),
      pending: Number(r.pending),
      total: Number(r.total),
    }));

    res.json({ volume: result });
  } catch (error) {
    next(error);
  }
};

// ─── getCampaignMetrics ───────────────────────────────────────────────────────

export const getCampaignMetrics = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = dateRangeSchema.extend({
      campaignId: z.string().uuid().optional(),
    });

    const query = schema.parse(req.query);
    const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    const where: Record<string, unknown> = {
      createdAt: { gte: startDate, lte: endDate },
    };
    if (query.campaignId) where.campaignId = query.campaignId;

    const logs = await prisma.messageLog.groupBy({
      by: ['campaignId'],
      where,
      _count: { id: true },
      _sum: {},
    });

    const campaignIds = logs.map((l) => l.campaignId);

    const campaigns = await prisma.campaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, name: true },
    });

    const clickCounts = await prisma.clickLog.groupBy({
      by: ['productId'],
      where: { clickedAt: { gte: startDate, lte: endDate } },
      _count: { id: true },
    });
    const totalClicks = clickCounts.reduce((acc, c) => acc + c._count.id, 0);

    // Compute days in range
    const diffDays = Math.max(
      1,
      Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
    );

    const statusCounts = await prisma.messageLog.groupBy({
      by: ['campaignId', 'status'],
      where,
      _count: { id: true },
    });

    const metrics = campaigns.map((c) => {
      const campaignLogs = statusCounts.filter((s) => s.campaignId === c.id);
      const sent = campaignLogs.find((s) => s.status === MessageStatus.SENT)?._count.id ?? 0;
      const failed = campaignLogs.find((s) => s.status === MessageStatus.FAILED)?._count.id ?? 0;
      const total = sent + failed;
      const clickRate = total > 0 ? Number((totalClicks / total).toFixed(4)) : 0;
      const avgPerDay = Number((total / diffDays).toFixed(2));

      return { id: c.id, name: c.name, sent, failed, clickRate, avgPerDay };
    });

    res.json({ campaigns: metrics });
  } catch (error) {
    next(error);
  }
};

// ─── getDestinationMetrics ────────────────────────────────────────────────────

export const getDestinationMetrics = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = dateRangeSchema.extend({
      accountType: z.enum(['whatsapp', 'telegram']).optional(),
    });

    const query = schema.parse(req.query);
    const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    const typeFilter: Record<string, unknown> = {};
    if (query.accountType === 'whatsapp') {
      typeFilter.destinationType = { in: ['WHATSAPP_GROUP', 'WHATSAPP_CHANNEL'] };
    } else if (query.accountType === 'telegram') {
      typeFilter.destinationType = { in: ['TELEGRAM_GROUP', 'TELEGRAM_CHANNEL'] };
    }

    const rows = await prisma.messageLog.groupBy({
      by: ['destinationId', 'destinationType', 'status'],
      where: { createdAt: { gte: startDate, lte: endDate }, ...typeFilter },
      _count: { id: true },
    });

    // Aggregate per destination
    const map = new Map<string, { sent: number; failed: number; type: string }>();
    for (const row of rows) {
      const existing = map.get(row.destinationId) ?? { sent: 0, failed: 0, type: String(row.destinationType) };
      if (row.status === MessageStatus.SENT) existing.sent += row._count.id;
      if (row.status === MessageStatus.FAILED) existing.failed += row._count.id;
      map.set(row.destinationId, existing);
    }

    // Fetch display names from DestinationConfig
    const destIds = Array.from(map.keys());
    const configs = await prisma.destinationConfig.findMany({
      where: { destinationId: { in: destIds } },
      select: { destinationId: true, displayName: true },
    });
    const nameMap = new Map(configs.map((c) => [c.destinationId, c.displayName]));

    // Clicks per destination — join via message logs
    const clicksRows = await prisma.$queryRawUnsafe<{ destinationId: string; clicks: bigint }[]>(
      `SELECT ml."destinationId", COUNT(cl.id) AS clicks
       FROM message_logs ml
       LEFT JOIN click_logs cl ON cl."messageLogId" = ml.id
       WHERE ml."createdAt" >= $1 AND ml."createdAt" <= $2
       GROUP BY ml."destinationId"`,
      startDate,
      endDate,
    );
    const clicksMap = new Map(clicksRows.map((r) => [r.destinationId, Number(r.clicks)]));

    const destinations = Array.from(map.entries()).map(([destinationId, data]) => ({
      destinationId,
      name: nameMap.get(destinationId) ?? destinationId,
      type: data.type,
      sent: data.sent,
      failed: data.failed,
      clicks: clicksMap.get(destinationId) ?? 0,
    }));

    res.json({ destinations });
  } catch (error) {
    next(error);
  }
};

// ─── getPlatformMetrics ───────────────────────────────────────────────────────

export const getPlatformMetrics = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const query = dateRangeSchema.parse(req.query);
    const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    const platforms = await prisma.platform.findMany({
      select: { id: true, name: true, type: true },
    });

    const productCounts = await prisma.product.groupBy({
      by: ['platformId'],
      _count: { id: true },
    });
    const productMap = new Map(productCounts.map((p) => [p.platformId ?? '', p._count.id]));

    // Messages sent per platform (via product->platform)
    const msgRows = await prisma.$queryRawUnsafe<{ platformId: string; messagesSent: bigint }[]>(
      `SELECT p."platformId", COUNT(ml.id) AS "messagesSent"
       FROM message_logs ml
       JOIN products p ON p.id = ml."productId"
       WHERE ml."createdAt" >= $1 AND ml."createdAt" <= $2
         AND ml.status = 'SENT'
       GROUP BY p."platformId"`,
      startDate,
      endDate,
    );
    const msgMap = new Map(msgRows.map((r) => [r.platformId, Number(r.messagesSent)]));

    const clickRows = await prisma.$queryRawUnsafe<{ platformId: string; clicks: bigint }[]>(
      `SELECT p."platformId", COUNT(cl.id) AS clicks
       FROM click_logs cl
       JOIN products p ON p.id = cl."productId"
       WHERE cl."clickedAt" >= $1 AND cl."clickedAt" <= $2
       GROUP BY p."platformId"`,
      startDate,
      endDate,
    );
    const clickMap = new Map(clickRows.map((r) => [r.platformId, Number(r.clicks)]));

    const result = platforms.map((pl) => ({
      platformId: pl.id,
      name: pl.name,
      type: pl.type,
      products: productMap.get(pl.id) ?? 0,
      messagesSent: msgMap.get(pl.id) ?? 0,
      clicks: clickMap.get(pl.id) ?? 0,
    }));

    res.json({ platforms: result });
  } catch (error) {
    next(error);
  }
};

// ─── getHourlyDistribution ────────────────────────────────────────────────────

export const getHourlyDistribution = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = dateRangeSchema.extend({
      campaignId: z.string().uuid().optional(),
    });

    const query = schema.parse(req.query);
    const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    const conditions: string[] = [
      `"createdAt" >= $1::timestamptz`,
      `"createdAt" <= $2::timestamptz`,
    ];
    const params: unknown[] = [startDate, endDate];

    if (query.campaignId) {
      conditions.push(`"campaignId" = $3::uuid`);
      params.push(query.campaignId);
    }

    const rows = await prisma.$queryRawUnsafe<{ hour: number; count: bigint }[]>(
      `SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COUNT(*) AS count
       FROM message_logs
       WHERE ${conditions.join(' AND ')}
       GROUP BY 1
       ORDER BY 1`,
      ...params,
    );

    // Fill all 24 buckets
    const bucketMap = new Map(rows.map((r) => [r.hour, Number(r.count)]));
    const distribution = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: bucketMap.get(h) ?? 0,
    }));

    res.json({ distribution });
  } catch (error) {
    next(error);
  }
};

// ─── getTopProducts ───────────────────────────────────────────────────────────

export const getTopProducts = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = dateRangeSchema.extend({
      limit: z.coerce.number().int().min(1).max(100).default(10),
      metric: z.enum(['clicks', 'sent']).default('clicks'),
    });

    const query = schema.parse(req.query);
    const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    let products: { productId: string; clicks: number; sent: number }[];

    if (query.metric === 'clicks') {
      const rows = await prisma.$queryRawUnsafe<{ productId: string; clicks: bigint; sent: bigint }[]>(
        `SELECT
           cl."productId",
           COUNT(DISTINCT cl.id)                                   AS clicks,
           COUNT(DISTINCT ml.id) FILTER (WHERE ml.status='SENT')   AS sent
         FROM click_logs cl
         LEFT JOIN message_logs ml ON ml."productId" = cl."productId"
           AND ml."createdAt" >= $1 AND ml."createdAt" <= $2
         WHERE cl."clickedAt" >= $1 AND cl."clickedAt" <= $2
         GROUP BY cl."productId"
         ORDER BY clicks DESC
         LIMIT $3`,
        startDate,
        endDate,
        query.limit,
      );
      products = rows.map((r) => ({ productId: r.productId, clicks: Number(r.clicks), sent: Number(r.sent) }));
    } else {
      const rows = await prisma.$queryRawUnsafe<{ productId: string; sent: bigint; clicks: bigint }[]>(
        `SELECT
           ml."productId",
           COUNT(DISTINCT ml.id) FILTER (WHERE ml.status='SENT')  AS sent,
           COUNT(DISTINCT cl.id)                                   AS clicks
         FROM message_logs ml
         LEFT JOIN click_logs cl ON cl."productId" = ml."productId"
           AND cl."clickedAt" >= $1 AND cl."clickedAt" <= $2
         WHERE ml."createdAt" >= $1 AND ml."createdAt" <= $2
           AND ml."productId" IS NOT NULL
         GROUP BY ml."productId"
         ORDER BY sent DESC
         LIMIT $3`,
        startDate,
        endDate,
        query.limit,
      );
      products = rows.map((r) => ({ productId: r.productId, sent: Number(r.sent), clicks: Number(r.clicks) }));
    }

    const productIds = products.map((p) => p.productId);
    const productDetails = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, title: true, price: true, imageUrl: true, affiliateUrl: true },
    });
    const detailMap = new Map(productDetails.map((p) => [p.id, p]));

    const result = products.map((p) => ({
      product: detailMap.get(p.productId) ?? { id: p.productId },
      clicks: p.clicks,
      sent: p.sent,
    }));

    res.json({ products: result });
  } catch (error) {
    next(error);
  }
};

// ─── getSummary ───────────────────────────────────────────────────────────────

export const getSummary = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const query = dateRangeSchema.parse(req.query);
    const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    const [statusGroups, totalClicks, activeCampaigns, activeDestinations] = await Promise.all([
      prisma.messageLog.groupBy({
        by: ['status'],
        where: { createdAt: { gte: startDate, lte: endDate } },
        _count: { id: true },
      }),
      prisma.clickLog.count({
        where: { clickedAt: { gte: startDate, lte: endDate } },
      }),
      prisma.campaign.count({ where: { isActive: true } }),
      prisma.destinationConfig.count({ where: { isActive: true } }),
    ]);

    const totalSent = statusGroups.find((s) => s.status === MessageStatus.SENT)?._count.id ?? 0;
    const totalFailed = statusGroups.find((s) => s.status === MessageStatus.FAILED)?._count.id ?? 0;
    const totalMessages = statusGroups.reduce((acc, s) => acc + s._count.id, 0);

    const deliveryRate = totalMessages > 0 ? Number((totalSent / totalMessages).toFixed(4)) : 0;
    const clickRate = totalSent > 0 ? Number((totalClicks / totalSent).toFixed(4)) : 0;

    res.json({
      summary: {
        totalSent,
        totalFailed,
        totalClicks,
        deliveryRate,
        clickRate,
        activeCampaigns,
        activeDestinations,
      },
    });
  } catch (error) {
    next(error);
  }
};
