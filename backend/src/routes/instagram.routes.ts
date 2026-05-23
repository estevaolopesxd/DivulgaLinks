import path from 'path';
import fs from 'fs';
import { Router, Request } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth';
import {
  getAuthUrl,
  handleCallback,
  listAccounts,
  disconnectAccount,
  uploadMedia,
  createPost,
  listPosts,
  getPost,
  updatePost,
  deletePost,
  publishPostNow,
  getConfig,
  saveConfig,
} from '../controllers/instagram.controller';

// ── Multer setup ──────────────────────────────────────────────────────────────

const uploadDir = path.join(process.cwd(), 'uploads', 'instagram');
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  // Diretório pode já existir ou ser criado pelo volume — continua normalmente
  console.warn('[instagram] Aviso ao criar diretório de uploads:', (err as Error).message);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();

router.use(authMiddleware);

// Config (App ID / Secret stored in DB)
router.get('/config', getConfig);
router.put('/config', saveConfig);

// Auth
router.get('/auth/url', getAuthUrl);
router.post('/auth/callback', handleCallback);

// Accounts
router.get('/accounts', listAccounts);
router.delete('/accounts/:id', disconnectAccount);

// Media upload
router.post('/media/upload', upload.single('file'), uploadMedia);

// Posts
router.post('/posts', createPost);
router.get('/posts', listPosts);
router.get('/posts/:id', getPost);
router.patch('/posts/:id', updatePost);
router.delete('/posts/:id', deletePost);
router.post('/posts/:id/publish', publishPostNow);

export default router;
