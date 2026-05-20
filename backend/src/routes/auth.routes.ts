import { Router } from 'express';
import { login, register, me, updateProfile } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// GET /api/auth/me
router.get('/me', authMiddleware, me);

// PATCH /api/auth/profile
router.patch('/profile', authMiddleware, updateProfile);

export default router;
