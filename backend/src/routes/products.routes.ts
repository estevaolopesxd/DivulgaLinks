import { Router } from 'express';
import multer from 'multer';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  importCSV,
  importFromPlatform,
  importFromUrl,
  searchFromPlatform,
  importSelectedFromPlatform,
  generateTrackingUrl,
} from '../controllers/products.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Multer config: memory storage for CSV processing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.endsWith('.csv')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

router.use(authMiddleware);

// GET /api/products
router.get('/', listProducts);

// GET /api/products/:id
router.get('/:id', getProduct);

// POST /api/products
router.post('/', createProduct);

// PATCH /api/products/:id
router.patch('/:id', updateProduct);

// DELETE /api/products/:id
router.delete('/:id', deleteProduct);

// POST /api/products/import/csv
router.post('/import/csv', upload.single('file'), importCSV);

// POST /api/products/import/platform  (importa todos)
router.post('/import/platform', importFromPlatform);

// POST /api/products/import/url
router.post('/import/url', importFromUrl);

// POST /api/products/search/platform  (busca preview, não salva)
router.post('/search/platform', searchFromPlatform);

// POST /api/products/import/selected  (importa selecionados)
router.post('/import/selected', importSelectedFromPlatform);

// POST /api/products/:id/tracking-url
router.post('/:id/tracking-url', generateTrackingUrl);

export default router;
