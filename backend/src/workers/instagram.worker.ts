import { Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { publishPost } from '../services/instagram.service';

const QUEUE_NAME = 'instagram-publish';

export interface InstagramJobData {
  postId: string;
}

let worker: Worker | null = null;

const processJob = async (job: Job<InstagramJobData>): Promise<void> => {
  const { postId } = job.data;
  logger.info('Instagram worker: processing job', { jobId: job.id, postId });

  try {
    await publishPost(postId);
  } catch (error) {
    logger.error('Instagram worker: job failed', {
      jobId: job.id,
      postId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

export const startInstagramWorker = (): Worker => {
  if (worker) {
    logger.warn('Instagram worker: already running');
    return worker;
  }

  worker = new Worker<InstagramJobData>(QUEUE_NAME, processJob, {
    connection: redis,
    concurrency: 2,
  });

  worker.on('active', (job) => {
    logger.info('Instagram worker: job active', { jobId: job.id, postId: job.data.postId });
  });

  worker.on('completed', (job) => {
    logger.info('Instagram worker: job completed', { jobId: job.id, postId: job.data.postId });
  });

  worker.on('failed', (job, err) => {
    logger.error('Instagram worker: job failed', {
      jobId: job?.id,
      postId: job?.data?.postId,
      error: err.message,
      attempts: job?.attemptsMade,
    });
  });

  worker.on('error', (err) => {
    logger.error('Instagram worker: error', { error: err.message });
  });

  worker.on('stalled', (jobId) => {
    logger.warn('Instagram worker: job stalled', { jobId });
  });

  logger.info('Instagram worker started');
  return worker;
};

export const stopInstagramWorker = async (): Promise<void> => {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Instagram worker stopped');
  }
};

export { worker };
