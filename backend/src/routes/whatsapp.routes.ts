import { Router } from 'express';
import {
  listAccounts,
  createAccount,
  deleteAccount,
  initializeSession,
  getQRCode,
  getGroups,
  getChannels,
  disconnectAccount,
  getAccountStatus,
} from '../controllers/whatsapp.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// GET /api/whatsapp
router.get('/', listAccounts);

// POST /api/whatsapp
router.post('/', createAccount);

// GET /api/whatsapp/:id/status
router.get('/:id/status', getAccountStatus);

// POST /api/whatsapp/:id/initialize
router.post('/:id/initialize', initializeSession);

// GET /api/whatsapp/:id/qr
router.get('/:id/qr', getQRCode);

// GET /api/whatsapp/:id/groups
router.get('/:id/groups', getGroups);

// GET /api/whatsapp/:id/channels
router.get('/:id/channels', getChannels);

// POST /api/whatsapp/:id/disconnect
router.post('/:id/disconnect', disconnectAccount);

// DELETE /api/whatsapp/:id
router.delete('/:id', deleteAccount);

export default router;
