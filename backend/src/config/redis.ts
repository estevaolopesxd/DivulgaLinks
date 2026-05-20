import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

const createRedisClient = (): Redis => {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  client.on('connect', () => {
    logger.info('Redis client connected');
  });

  client.on('ready', () => {
    logger.info('Redis client ready');
  });

  client.on('error', (err) => {
    logger.error('Redis client error:', err);
  });

  client.on('close', () => {
    logger.warn('Redis client connection closed');
  });

  client.on('reconnecting', () => {
    logger.info('Redis client reconnecting...');
  });

  return client;
};

const redis = global.__redis ?? createRedisClient();

if (env.NODE_ENV !== 'production') {
  global.__redis = redis;
}

export const connectRedis = async (): Promise<void> => {
  if (redis.status !== 'ready' && redis.status !== 'connect') {
    await redis.connect();
  }
};

export { redis };
export default redis;
