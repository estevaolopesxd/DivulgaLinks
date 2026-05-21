import { Router } from 'express';
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../controllers/templates.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// GET  /api/templates
router.get('/', listTemplates);

// POST /api/templates
router.post('/', createTemplate);

// PATCH /api/templates/:id
router.patch('/:id', updateTemplate);

// DELETE /api/templates/:id
router.delete('/:id', deleteTemplate);

export default router;
