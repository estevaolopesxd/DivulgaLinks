import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { env } from './config/env';
import apiRoutes from './routes/index';
import { errorHandler, notFoundHandler } from './middleware/error';
import { logger } from './utils/logger';

export const createApp = (): Application => {
  const app = express();

  // Strip X-Powered-By header to avoid fingerprinting
  app.disable('x-powered-by');

  // Security headers
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true },
      noSniff: true,
      xssFilter: true,
    }),
  );

  // CORS
  // CORS_ORIGINS aceita lista separada por vírgula ou "*" para liberar tudo
  const rawOrigins = process.env.CORS_ORIGINS ?? env.FRONTEND_URL;
  const allowAll = rawOrigins.trim() === '*';
  const allowedOrigins = allowAll
    ? []
    : [
        ...rawOrigins.split(',').map((o) => o.trim()).filter(Boolean),
        'http://localhost',
        'http://localhost:80',
        'http://localhost:5173',
        'http://localhost:3000',
      ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // sem origin = requisição server-to-server ou curl — sempre ok
        if (!origin) return callback(null, true);
        if (allowAll || allowedOrigins.includes(origin)) return callback(null, true);
        // rejeita sem lançar Error (evita 500)
        logger.warn(`CORS: origem bloqueada — ${origin}`);
        callback(null, false);
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: true,
      maxAge: 86400,
    }),
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later.' },
  });

  app.use(limiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  // Body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`, {
      query: req.query,
      ip: req.ip,
    });
    next();
  });

  // Static files (uploaded assets)
  const uploadsDir = path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsDir));

  // API routes
  app.use('/api', apiRoutes);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
};
