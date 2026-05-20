import { Router } from 'express';
import {
  listPlatforms,
  getPlatform,
  createPlatform,
  updatePlatform,
  deletePlatform,
  testConnection,
} from '../controllers/platforms.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// GET /api/platforms
router.get('/', listPlatforms);

// GET /api/platforms/:id
router.get('/:id', getPlatform);

// POST /api/platforms
router.post('/', createPlatform);

// PATCH /api/platforms/:id
router.patch('/:id', updatePlatform);

// DELETE /api/platforms/:id
router.delete('/:id', deletePlatform);

// POST /api/platforms/:id/test
router.post('/:id/test', testConnection);

export default router;
