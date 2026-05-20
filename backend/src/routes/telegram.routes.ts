import { Router } from 'express';
import {
  listBots,
  createBot,
  deleteBot,
  startBot,
  stopBot,
  getChats,
  sendTestMessage,
} from '../controllers/telegram.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// GET /api/telegram
router.get('/', listBots);

// POST /api/telegram
router.post('/', createBot);

// POST /api/telegram/:id/start
router.post('/:id/start', startBot);

// POST /api/telegram/:id/stop
router.post('/:id/stop', stopBot);

// GET /api/telegram/:id/chats
router.get('/:id/chats', getChats);

// POST /api/telegram/:id/test
router.post('/:id/test', sendTestMessage);

// DELETE /api/telegram/:id
router.delete('/:id', deleteBot);

export default router;
