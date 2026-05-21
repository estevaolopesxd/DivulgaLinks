import { Queue, Job } from 'bullmq';
import { CampaignStatus, DestinationType, MessageStatus, ProductRepeatMode } from '@prisma/client';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { parseTemplate } from '../utils/template';
import * as whatsappService from './whatsapp.service';
import telegramService from './telegram.service';

const QUEUE_NAME = 'campaign-dispatch';

// ── Helpers de janela de tempo ─────────────────────────────────────────────

/**
 * Verifica se o horário atual está dentro da janela permitida da campanha.
 * Retorna true se não houver restrição ou se estiver dentro do intervalo.
 */
const isWithinTimeWindow = (
  allowedStartTime?: string | null,
  allowedEndTime?: string | null,
  allowedWeekdays?: number[],
): boolean => {
  const now = new Date();

  // Verifica dia da semana
  if (allowedWeekdays && allowedWeekdays.length > 0) {
    const today = now.getDay(); // 0=Dom, 6=Sáb
    if (!allowedWeekdays.includes(today)) return false;
  }

  // Verifica janela de horário
  if (allowedStartTime && allowedEndTime) {
    const [sh, sm] = allowedStartTime.split(':').map(Number);
    const [eh, em] = allowedEndTime.split(':').map(Number);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;

    // Suporta janela que passa da meia-noite (ex: 22:00 – 02:00)
    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  }

  return true;
};

/**
 * Calcula o próximo DateTime em que a janela de tempo abre.
 * Itera pelos próximos 8 dias para encontrar o próximo slot válido.
 */
const getNextWindowOpenTime = (
  allowedStartTime: string,
  allowedWeekdays: number[],
): Date => {
  const [h, m] = allowedStartTime.split(':').map(Number);
  const now = new Date();

  for (let daysAhead = 0; daysAhead <= 8; daysAhead++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + daysAhead);
    candidate.setHours(h, m, 0, 0);

    const dayOfWeek = candidate.getDay();
    const isDayAllowed = allowedWeekdays.length === 0 || allowedWeekdays.includes(dayOfWeek);

    if (isDayAllowed && candidate > now) {
      return candidate;
    }
  }

  // Fallback improvável: 1 hora a partir de agora
  return new Date(Date.now() + 60 * 60 * 1000);
};

let campaignQueue: Queue | null = null;

export const getCampaignQueue = (): Queue => {
  if (!campaignQueue) {
    campaignQueue = new Queue(QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return campaignQueue;
};

/**
 * Start a campaign: validate state, enqueue the first dispatch job.
 */
export const startCampaign = async (campaignId: string): Promise<void> => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      destinations: { where: { isActive: true } },
      products: { include: { product: true } },
    },
  });

  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  if (campaign.destinations.length === 0) {
    throw new Error('Campaign has no active destinations');
  }

  if (campaign.products.length === 0) {
    throw new Error('Campaign has no products');
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.ACTIVE, isActive: true },
  });

  logger.info('Campaign: starting', { campaignId });

  const queue = getCampaignQueue();
  await queue.add(
    'dispatch',
    { campaignId },
    { jobId: `campaign-${campaignId}-${Date.now()}` },
  );
};

/**
 * Stop an active campaign.
 */
export const stopCampaign = async (campaignId: string): Promise<void> => {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.PAUSED, isActive: false },
  });

  // Remove pending jobs for this campaign
  const queue = getCampaignQueue();
  const jobs = await queue.getJobs(['waiting', 'delayed']);
  for (const job of jobs) {
    if (job.data?.campaignId === campaignId) {
      await job.remove();
    }
  }

  logger.info('Campaign: stopped', { campaignId });
};

/**
 * Process a campaign dispatch: send messages for each product to each destination.
 */
export const processCampaignJob = async (campaignId: string): Promise<void> => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      destinations: { where: { isActive: true } },
      products: { include: { product: true } },
    },
  });

  if (!campaign || !campaign.isActive) {
    logger.info('Campaign: skipping inactive campaign', { campaignId });
    return;
  }

  // ── Verificação de janela de tempo da campanha ─────────────────────────────
  const inWindow = isWithinTimeWindow(
    campaign.allowedStartTime,
    campaign.allowedEndTime,
    campaign.allowedWeekdays,
  );

  if (!inWindow) {
    const nextOpen = getNextWindowOpenTime(
      campaign.allowedStartTime ?? '00:00',
      campaign.allowedWeekdays,
    );
    const delayMs = nextOpen.getTime() - Date.now();

    logger.info('Campaign: fora da janela de horário, reagendando para abertura', {
      campaignId,
      nextOpen: nextOpen.toISOString(),
      allowedStartTime: campaign.allowedStartTime,
      allowedEndTime: campaign.allowedEndTime,
      allowedWeekdays: campaign.allowedWeekdays,
    });

    const queue = getCampaignQueue();
    await queue.add(
      'dispatch',
      { campaignId },
      { delay: delayMs, jobId: `campaign-${campaignId}-window-${Date.now()}` },
    );
    return;
  }

  logger.info('Campaign: processing dispatch', {
    campaignId,
    products: campaign.products.length,
    destinations: campaign.destinations.length,
  });

  const delay = campaign.delayBetweenMessages;

  for (const campaignProduct of campaign.products) {
    const product = campaignProduct.product;

    for (const destination of campaign.destinations) {
      // ── DestinationConfig checks ──────────────────────────────────────────
      const config = await prisma.destinationConfig.findUnique({
        where: {
          destinationId_accountId: {
            destinationId: destination.destinationId,
            accountId: destination.accountId,
          },
        },
      });

      let effectiveTemplate = campaign.messageTemplate;

      if (config) {
        // 1. Check isActive
        if (!config.isActive) {
          logger.info('Campaign: skipping inactive destination config', {
            campaignId,
            destinationId: destination.destinationId,
          });
          continue;
        }

        // 2. Check time window
        if (config.allowedStartTime && config.allowedEndTime) {
          const now = new Date();
          const [sh, sm] = config.allowedStartTime.split(':').map(Number);
          const [eh, em] = config.allowedEndTime.split(':').map(Number);
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const startMinutes = sh * 60 + sm;
          const endMinutes = eh * 60 + em;
          if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
            logger.info('Campaign: skipping destination outside allowed time window', {
              campaignId,
              destinationId: destination.destinationId,
              allowedStartTime: config.allowedStartTime,
              allowedEndTime: config.allowedEndTime,
            });
            continue;
          }
        }

        // 3. Check daily limit
        if (config.maxMessagesPerDay) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const stats = await prisma.destinationDailyStats.findUnique({
            where: {
              destinationConfigId_date: {
                destinationConfigId: config.id,
                date: today,
              },
            },
          });
          if ((stats?.messagesSent ?? 0) >= config.maxMessagesPerDay) {
            logger.info('Campaign: skipping destination — daily limit reached', {
              campaignId,
              destinationId: destination.destinationId,
              maxMessagesPerDay: config.maxMessagesPerDay,
            });
            continue;
          }
        }

        // 4. Use custom template if set
        if (config.customTemplate) {
          effectiveTemplate = config.customTemplate;
        }
      }

      // ── Product repeat mode check ─────────────────────────────────────────
      if (campaign.productRepeatMode !== ProductRepeatMode.ALWAYS) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const alreadySent = await prisma.messageLog.count({
          where: {
            campaignId,
            productId: product.id,
            destinationId: destination.destinationId,
            status: MessageStatus.SENT,
            ...(campaign.productRepeatMode === ProductRepeatMode.ONCE_PER_DAY && {
              sentAt: { gte: today, lt: tomorrow },
            }),
          },
        });

        if (alreadySent > 0) {
          logger.info('Campaign: skipping product — repeat policy', {
            campaignId,
            productId: product.id,
            destinationId: destination.destinationId,
            mode: campaign.productRepeatMode,
          });
          continue;
        }
      }

      const message = parseTemplate(effectiveTemplate, product);

      // Create a pending log entry
      const logEntry = await prisma.messageLog.create({
        data: {
          campaignId,
          productId: product.id,
          destinationId: destination.destinationId,
          destinationType: destination.type,
          message,
          status: MessageStatus.PENDING,
        },
      });

      try {
        const isWhatsApp =
          destination.type === DestinationType.WHATSAPP_GROUP ||
          destination.type === DestinationType.WHATSAPP_CHANNEL;

        const isTelegram =
          destination.type === DestinationType.TELEGRAM_GROUP ||
          destination.type === DestinationType.TELEGRAM_CHANNEL;

        if (isWhatsApp) {
          await whatsappService.sendMessage(
            destination.accountId,
            destination.destinationId,
            message,
          );
        } else if (isTelegram) {
          await telegramService.sendMessage(
            destination.accountId,
            destination.destinationId,
            message,
            product.imageUrl ?? undefined,
          );
        }

        await prisma.messageLog.update({
          where: { id: logEntry.id },
          data: { status: MessageStatus.SENT, sentAt: new Date() },
        });

        // ── Update daily stats ──────────────────────────────────────────────
        if (config) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          await prisma.destinationDailyStats.upsert({
            where: {
              destinationConfigId_date: {
                destinationConfigId: config.id,
                date: today,
              },
            },
            create: {
              destinationConfigId: config.id,
              date: today,
              messagesSent: 1,
            },
            update: {
              messagesSent: { increment: 1 },
            },
          });
        }

        logger.info('Campaign: message sent', {
          campaignId,
          productId: product.id,
          destinationId: destination.destinationId,
        });
      } catch (error) {
        const failedReason =
          error instanceof Error ? error.message : 'Unknown error';

        await prisma.messageLog.update({
          where: { id: logEntry.id },
          data: { status: MessageStatus.FAILED, failedReason },
        });

        // Track failed count in daily stats
        if (config) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          await prisma.destinationDailyStats.upsert({
            where: {
              destinationConfigId_date: {
                destinationConfigId: config.id,
                date: today,
              },
            },
            create: {
              destinationConfigId: config.id,
              date: today,
              messagesFailed: 1,
            },
            update: {
              messagesFailed: { increment: 1 },
            },
          });
        }

        logger.error('Campaign: message failed', {
          campaignId,
          productId: product.id,
          destinationId: destination.destinationId,
          error: failedReason,
        });
      }

      // Delay between messages
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Schedule next run
  await scheduleNextRun(campaignId);
};

/**
 * Schedule the next campaign dispatch based on intervalMinutes.
 */
export const scheduleNextRun = async (campaignId: string): Promise<void> => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      isActive: true,
      intervalMinutes: true,
      endTime: true,
      allowedStartTime: true,
      allowedEndTime: true,
      allowedWeekdays: true,
    },
  });

  if (!campaign || !campaign.isActive) {
    logger.info('Campaign: not rescheduling inactive campaign', { campaignId });
    return;
  }

  const now = new Date();

  // Check if campaign has ended
  if (campaign.endTime && now > campaign.endTime) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.COMPLETED, isActive: false },
    });
    logger.info('Campaign: completed (end time reached)', { campaignId });
    return;
  }

  // Calcula próxima execução com base no intervalo
  const intervalMs = campaign.intervalMinutes * 60 * 1000;
  let nextRunAt = new Date(Date.now() + intervalMs);

  // Se a próxima execução cai fora da janela, adiantamos para a abertura da janela
  if (campaign.allowedStartTime && campaign.allowedEndTime) {
    const nextInWindow = isWithinTimeWindow(
      campaign.allowedStartTime,
      campaign.allowedEndTime,
      campaign.allowedWeekdays,
    );

    if (!nextInWindow) {
      const windowOpen = getNextWindowOpenTime(
        campaign.allowedStartTime,
        campaign.allowedWeekdays,
      );
      // Usa o maior entre o intervalo normal e a abertura da próxima janela
      if (windowOpen > nextRunAt) {
        nextRunAt = windowOpen;
        logger.info('Campaign: próxima execução ajustada para abertura da janela', {
          campaignId,
          nextRunAt: nextRunAt.toISOString(),
        });
      }
    }
  }

  const delayMs = nextRunAt.getTime() - Date.now();

  const queue = getCampaignQueue();
  await queue.add('dispatch', { campaignId }, {
    delay: delayMs,
    jobId: `campaign-${campaignId}-${Date.now()}`,
  });

  // Update schedule record if exists
  await prisma.schedule.updateMany({
    where: { campaignId, isActive: true },
    data: { lastRunAt: now, nextRunAt },
  });

  logger.info('Campaign: next run scheduled', {
    campaignId,
    nextRunAt: nextRunAt.toISOString(),
    delayMinutes: campaign.intervalMinutes,
  });
};

const campaignService = {
  getCampaignQueue,
  startCampaign,
  stopCampaign,
  processCampaignJob,
  scheduleNextRun,
};

export default campaignService;
