import { Router } from 'express';
import {
  getStats,
  getClicksTimeline,
  getTopProducts,
  getMessageStats,
  getCampaignPerformance,
  getRevenueEstimate,
} from '../controllers/dashboard.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// GET /api/dashboard/stats
router.get('/stats', getStats);

// GET /api/dashboard/clicks-timeline
router.get('/clicks-timeline', getClicksTimeline);

// GET /api/dashboard/top-products
router.get('/top-products', getTopProducts);

// GET /api/dashboard/message-stats
router.get('/message-stats', getMessageStats);

// GET /api/dashboard/campaign-performance
router.get('/campaign-performance', getCampaignPerformance);

// GET /api/dashboard/revenue-estimate
router.get('/revenue-estimate', getRevenueEstimate);

export default router;
