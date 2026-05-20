import { Router } from 'express';
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  startCampaign,
  stopCampaign,
  addDestination,
  removeDestination,
  addProduct,
  removeProduct,
} from '../controllers/campaigns.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// GET /api/campaigns
router.get('/', listCampaigns);

// GET /api/campaigns/:id
router.get('/:id', getCampaign);

// POST /api/campaigns
router.post('/', createCampaign);

// PATCH /api/campaigns/:id
router.patch('/:id', updateCampaign);

// DELETE /api/campaigns/:id
router.delete('/:id', deleteCampaign);

// POST /api/campaigns/:id/start
router.post('/:id/start', startCampaign);

// POST /api/campaigns/:id/stop
router.post('/:id/stop', stopCampaign);

// POST /api/campaigns/:id/destinations
router.post('/:id/destinations', addDestination);

// DELETE /api/campaigns/:id/destinations/:destinationId
router.delete('/:id/destinations/:destinationId', removeDestination);

// POST /api/campaigns/:id/products
router.post('/:id/products', addProduct);

// DELETE /api/campaigns/:id/products/:productId
router.delete('/:id/products/:productId', removeProduct);

export default router;
