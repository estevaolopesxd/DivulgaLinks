import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  toggleActive,
  getMe,
  updateMe,
} from '../controllers/users.controller';

const router = Router();

// Own profile — no admin required
router.get('/me', authMiddleware, getMe);
router.put('/me', authMiddleware, updateMe);

// Admin-only routes
router.get('/', authMiddleware, adminMiddleware, listUsers);
router.post('/', authMiddleware, adminMiddleware, createUser);
router.get('/:id', authMiddleware, adminMiddleware, getUser);
router.put('/:id', authMiddleware, adminMiddleware, updateUser);
router.delete('/:id', authMiddleware, adminMiddleware, deleteUser);
router.patch('/:id/toggle', authMiddleware, adminMiddleware, toggleActive);

export default router;
