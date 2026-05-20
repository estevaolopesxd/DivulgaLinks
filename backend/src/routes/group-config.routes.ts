import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  listConfigs,
  getConfig,
  upsertConfig,
  updateConfig,
  deleteConfig,
  getStats,
} from '../controllers/group-config.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', listConfigs);
router.post('/', upsertConfig);
router.get('/:id', getConfig);
router.put('/:id', updateConfig);
router.delete('/:id', deleteConfig);
router.get('/:id/stats', getStats);

export default router;
