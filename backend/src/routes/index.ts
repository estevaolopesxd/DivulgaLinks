import { Router } from 'express';
import authRoutes from './auth.routes';
import platformsRoutes from './platforms.routes';
import productsRoutes from './products.routes';
import whatsappRoutes from './whatsapp.routes';
import telegramRoutes from './telegram.routes';
import campaignsRoutes from './campaigns.routes';
import dashboardRoutes from './dashboard.routes';
import logsRoutes from './logs.routes';
import usersRoutes from './users.routes';
import metricsRoutes from './metrics.routes';
import groupConfigRoutes from './group-config.routes';
import trackingRoutes from './tracking.routes';
import templatesRoutes from './templates.routes';
import instagramRoutes from './instagram.routes';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '1.0.0',
  });
});

// Public tracking redirect — no auth required
router.use('/r', trackingRoutes);

router.use('/auth', authRoutes);
router.use('/platforms', platformsRoutes);
router.use('/products', productsRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/telegram', telegramRoutes);
router.use('/campaigns', campaignsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/logs', logsRoutes);
router.use('/users', usersRoutes);
router.use('/metrics', metricsRoutes);
router.use('/group-config', groupConfigRoutes);
router.use('/templates', templatesRoutes);
router.use('/instagram', instagramRoutes);

export default router;
