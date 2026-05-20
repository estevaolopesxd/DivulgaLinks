import { Router } from 'express';
import {
  getMessageLogs,
  getClickLogs,
  exportLogs,
  trackClick,
} from '../controllers/logs.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Public tracking redirect (no auth required)
// GET /api/logs/track/:shortCode
router.get('/track/:shortCode', trackClick);

// All other routes require auth
router.use(authMiddleware);

// GET /api/logs/messages
router.get('/messages', getMessageLogs);

// GET /api/logs/clicks
router.get('/clicks', getClickLogs);

// GET /api/logs/export
router.get('/export', exportLogs);

export default router;
