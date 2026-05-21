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

  // 8. Restore active WhatsApp sessions (sempre, independente de NODE_ENV)
  restoreSessions().catch((err) =>
    logger.error('Failed to restore WhatsApp sessions', { error: err }),
  );

  // 9. Restore active Telegram bots
  telegramService.restoreBots().catch((err) =>
    logger.error('Failed to restore Telegram bots', { error: err }),
  );

  // 10. Sincronizar fila BullMQ — roda 5s após startup para dar tempo do WA reconectar
  setTimeout(async () => {
    try {
      const queue = getCampaignQueue();

      // Mapear estado atual de cada job na fila por campaignId
      // waiting = vai rodar em breve | active = rodando agora | delayed = agendado pro futuro
      const allJobs = await queue.getJobs(['waiting', 'delayed', 'active']);

      // Separar por estado para cada campaignId
      const jobStates = new Map<string, { hasWaitingOrActive: boolean; delayedJobs: typeof allJobs }>();
      for (const job of allJobs) {
        const cid = job.data?.campaignId as string | undefined;
        if (!cid) continue;
        const state = await job.getState();
        const entry = jobStates.get(cid) ?? { hasWaitingOrActive: false, delayedJobs: [] };
        if (state === 'waiting' || state === 'active') {
          entry.hasWaitingOrActive = true;
        } else if (state === 'delayed') {
          entry.delayedJobs.push(job);
        }
        jobStates.set(cid, entry);
      }

      // Buscar campanhas ativas no DB
      const activeCampaigns = await prisma.campaign.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      // Remover jobs de campanhas INATIVAS que ainda estão na fila
      for (const [cid, entry] of jobStates.entries()) {
        const isActive = activeCampaigns.some((c) => c.id === cid);
        if (!isActive) {
          for (const job of [...entry.delayedJobs]) {
            try { await job.remove(); } catch { /* ignore */ }
          }
          logger.info('Startup: removidos jobs de campanha inativa', { campaignId: cid });
        }
      }

      // Para campanhas ativas: garantir que há um job imediato (escalonado por 30s)
      const STAGGER_MS = 30_000;
      let offset = 0;
      for (const { id } of activeCampaigns) {
        const state = jobStates.get(id);

        if (state?.hasWaitingOrActive) {
          // Já tem job imediato/rodando — não interferir
          logger.info('Startup: campanha já tem job na fila, mantendo', { campaignId: id });
          continue;
        }

        // Remover delayed existente (será substituído por um escalonado)
        if (state?.delayedJobs.length) {
          for (const job of state.delayedJobs) {
            try { await job.remove(); } catch { /* ignore */ }
          }
        }

        const delayMs = offset * STAGGER_MS;
        await queue.add('dispatch', { campaignId: id }, {
          delay: delayMs,
          jobId: `campaign-${id}-startup-${Date.now()}`,
        });
        logger.info('Startup: campanha ativa agendada', { campaignId: id, startsIn: `${delayMs / 1000}s` });
        offset++;
      }

      if (offset > 0) {
        logger.info(`Startup: ${offset} campanha(s) ativa(s) agendada(s) (30s de intervalo entre cada)`);
      }
    } catch (err) {
      logger.warn('Startup: erro ao sincronizar fila de campanhas', { error: err });
    }
  }, 5_000);

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
