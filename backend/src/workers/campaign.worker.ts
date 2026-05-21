import { Worker, Job } from 'bullmq';
import { MessageStatus, DestinationType } from '@prisma/client';
import { redis } from '../config/redis';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { parseTemplate } from '../utils/template';
import { processCampaignJob } from '../services/campaign.service';
import * as whatsappService from '../services/whatsapp.service';
import telegramService from '../services/telegram.service';

const QUEUE_NAME = 'campaign-dispatch';

export interface CampaignJobData {
  campaignId: string;
  productId?: string;
  destinationId?: string;
}

let worker: Worker | null = null;

/**
 * Process a campaign dispatch job.
 * Supports both full campaign dispatch and single product/destination dispatch.
 */
const processJob = async (job: Job<CampaignJobData>): Promise<void> => {
  const { campaignId, productId, destinationId } = job.data;

  logger.info('Worker: processing job', { jobId: job.id, campaignId, productId, destinationId });

  try {
    if (productId && destinationId) {
      // Single product + destination dispatch
      await processSingleDispatch(campaignId, productId, destinationId);
    } else {
      // Full campaign dispatch
      await processCampaignJob(campaignId);
    }
  } catch (error) {
    logger.error('Worker: job failed', { jobId: job.id, campaignId, error });
    throw error; // BullMQ will retry based on job options
  }
};

/**
 * Process a single product/destination pair.
 */
const processSingleDispatch = async (
  campaignId: string,
  productId: string,
  destinationId: string,
): Promise<void> => {
  const [campaign, product, destination] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId } }),
    prisma.product.findUnique({ where: { id: productId } }),
    prisma.campaignDestination.findUnique({ where: { id: destinationId } }),
  ]);

  if (!campaign || !product || !destination) {
    logger.error('Worker: missing data for single dispatch', {
      campaignId,
      productId,
      destinationId,
    });
    return;
  }

  // Skip if campaign is no longer active
  if (!campaign.isActive) {
    logger.info('Worker: skipping single dispatch — campaign inactive', { campaignId });
    return;
  }

  const message = parseTemplate(campaign.messageTemplate, product);

  const logEntry = await prisma.messageLog.create({
    data: {
      campaignId,
      productId,
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
        product.imageUrl ?? undefined,
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

    logger.info('Worker: single dispatch sent', {
      campaignId,
      productId,
      destinationId,
    });
  } catch (error) {
    const failedReason = error instanceof Error ? error.message : 'Unknown error';

    await prisma.messageLog.update({
      where: { id: logEntry.id },
      data: { status: MessageStatus.FAILED, failedReason },
    });

    throw error;
  }
};

/**
 * Start the BullMQ worker.
 */
export const startWorker = (): Worker => {
  if (worker) {
    logger.warn('Worker: already running');
    return worker;
  }

  worker = new Worker<CampaignJobData>(QUEUE_NAME, processJob, {
    connection: redis,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 1000,
    },
  });

  worker.on('active', (job) => {
    logger.info('Worker: job active', { jobId: job.id, campaignId: job.data.campaignId });
  });

  worker.on('completed', (job) => {
    logger.info('Worker: job completed', { jobId: job.id, campaignId: job.data.campaignId });
  });

  worker.on('failed', (job, err) => {
    logger.error('Worker: job failed', {
      jobId: job?.id,
      campaignId: job?.data?.campaignId,
      error: err.message,
      attempts: job?.attemptsMade,
    });
  });

  worker.on('error', (err) => {
    logger.error('Worker: error', { error: err.message });
  });

  worker.on('stalled', (jobId) => {
    logger.warn('Worker: job stalled', { jobId });
  });

  logger.info('Campaign worker started');
  return worker;
};

/**
 * Stop the worker gracefully.
 */
export const stopWorker = async (): Promise<void> => {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Campaign worker stopped');
  }
};

export { worker };
