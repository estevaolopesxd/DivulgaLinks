import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  getMessageVolume,
  getCampaignMetrics,
  getDestinationMetrics,
  getPlatformMetrics,
  getHourlyDistribution,
  getTopProducts,
  getSummary,
} from '../controllers/metrics.controller';

const router = Router();

router.use(authMiddleware);

router.get('/volume', getMessageVolume);
router.get('/campaigns', getCampaignMetrics);
router.get('/destinations', getDestinationMetrics);
router.get('/platforms', getPlatformMetrics);
router.get('/hourly', getHourlyDistribution);
router.get('/top-products', getTopProducts);
router.get('/summary', getSummary);

export default router;
