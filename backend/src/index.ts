import 'dotenv/config';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './config/database';
import { connectRedis } from './config/redis';
import { logger } from './utils/logger';
import { setSocketIO, restoreSessions } from './services/whatsapp.service';
import telegramService from './services/telegram.service';
import { startWorker, stopWorker } from './workers/campaign.worker';
import { getCampaignQueue } from './services/campaign.service';

const bootstrap = async (): Promise<void> => {
  // 1. Connect to Redis
  try {
    await connectRedis();
    logger.info('Redis connected');
  } catch (error) {
    logger.error('Failed to connect to Redis', { error });
    process.exit(1);
  }

  // 2. Connect to Postgres via Prisma
  try {
    await prisma.$connect();
    logger.info('Database connected');
  } catch (error) {
    logger.error('Failed to connect to database', { error });
    process.exit(1);
  }

  // 3. Create Express app
  const app = createApp();

  // 4. Create HTTP server
  const server = http.createServer(app);

  // 5. Attach Socket.IO for real-time QR code streaming
  const rawCorsOrigins = process.env.CORS_ORIGINS ?? env.FRONTEND_URL;
  const allowAllOrigins = rawCorsOrigins.trim() === '*';
  const socketCorsOrigin = allowAllOrigins
    ? true
    : [
        ...rawCorsOrigins.split(',').map((o) => o.trim()).filter(Boolean),
        'http://localhost:5173',
        'http://localhost:3000',
      ];

  const io = new SocketIOServer(server, {
    cors: {
      origin: socketCorsOrigin,
      methods: ['GET', 'POST'],
      credentials: !allowAllOrigins,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    logger.debug('Socket.IO client connected', { socketId: socket.id });

    socket.on('disconnect', () => {
      logger.debug('Socket.IO client disconnected', { socketId: socket.id });
    });

    // Client can subscribe to specific account updates
    socket.on('subscribe:whatsapp', (accountId: string) => {
      socket.join(`whatsapp:${accountId}`);
    });
  });

  // 6. Set the Socket.IO instance in the WhatsApp service
  setSocketIO(io);

  // 7. Start BullMQ campaign worker
  startWorker();
  logger.info('BullMQ campaign worker started');

  // 7b. Sincronizar fila BullMQ com o estado das campanhas no DB.
  //     - Remove jobs de campanhas inativas (evita envios indevidos após restart)
  //     - Recoloca na fila campanhas ATIVAS que perderam seu job (restart sem graceful shutdown)
  try {
    const queue = getCampaignQueue();

    // Campanhas com job já na fila
    const pendingJobs = await queue.getJobs(['waiting', 'delayed', 'active']);
    const campaignIdsInQueue = new Set<string>();

    let cleaned = 0;
    for (const job of pendingJobs) {
      const cid = job.data?.campaignId;
      if (!cid) continue;
      const campaign = await prisma.campaign.findUnique({
        where: { id: cid },
        select: { isActive: true },
      });
      if (!campaign || !campaign.isActive) {
        // Job de campanha inativa — remover
        try { await job.remove(); } catch { /* já pode ter sido processado */ }
        cleaned++;
        logger.info('Startup: removido job órfão de campanha inativa', { jobId: job.id, campaignId: cid });
      } else {
        // Campanha ativa com job na fila — registrar
        campaignIdsInQueue.add(cid);
      }
    }
    if (cleaned > 0) {
      logger.info(`Startup: ${cleaned} job(s) órfão(s) removido(s) da fila`);
    }

    // Campanhas ativas que NÃO têm job na fila — reenfileirar imediatamente
    const activeCampaigns = await prisma.campaign.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    let recovered = 0;
    for (const { id } of activeCampaigns) {
      if (!campaignIdsInQueue.has(id)) {
        await queue.add('dispatch', { campaignId: id }, {
          jobId: `campaign-${id}-recovery-${Date.now()}`,
        });
        recovered++;
        logger.info('Startup: reenfileirada campanha ativa sem job na fila', { campaignId: id });
      }
    }
    if (recovered > 0) {
      logger.info(`Startup: ${recovered} campanha(s) ativa(s) recuperada(s) na fila`);
    }
  } catch (err) {
    logger.warn('Startup: erro ao sincronizar fila de campanhas', { error: err });
  }

  // 8. Restore active WhatsApp sessions
  if (env.NODE_ENV === 'production') {
    restoreSessions().catch((err) =>
      logger.error('Failed to restore WhatsApp sessions', { error: err }),
    );
  }

  // 9. Restore active Telegram bots
  telegramService.restoreBots().catch((err) =>
    logger.error('Failed to restore Telegram bots', { error: err }),
  );

  // 10. Start HTTP server
  server.listen(env.PORT, () => {
    logger.info(`DivulgaLinks backend running`, {
      port: env.PORT,
      env: env.NODE_ENV,
      url: `http://localhost:${env.PORT}`,
    });
    logger.info(`API available at http://localhost:${env.PORT}/api`);
    logger.info(`Health check: http://localhost:${env.PORT}/api/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);

    server.close(async () => {
      logger.info('HTTP server closed');

      await stopWorker();
      await prisma.$disconnect();
      logger.info('Database disconnected');

      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    process.exit(1);
  });
};

bootstrap().catch((error) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
