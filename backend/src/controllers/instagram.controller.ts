import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { InstagramMediaType } from '@prisma/client';
import { AppError } from '../middleware/error';
import { logger } from '../utils/logger';
import * as instagramService from '../services/instagram.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const sanitizeAccount = (account: Record<string, unknown>) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessToken, ...safe } = account as { accessToken: string; [key: string]: unknown };
  return safe;
};

// ── Auth ──────────────────────────────────────────────────────────────────────

export const getAuthUrl = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authUrl = await instagramService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    next(error);
  }
};

// ── Config ────────────────────────────────────────────────────────────────────

export const getConfig = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const config = await instagramService.getInstagramConfig();
    res.json(config);
  } catch (error) {
    next(error);
  }
};

const saveConfigSchema = z.object({
  appId: z.string().min(1, 'App ID é obrigatório'),
  appSecret: z.string().optional(),
  redirectUri: z.string().min(1, 'URI de redirecionamento é obrigatória'),
});

export const saveConfig = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = saveConfigSchema.parse(req.body);
    await instagramService.saveInstagramConfig(data);
    res.json({ message: 'Configurações salvas com sucesso' });
  } catch (error) {
    next(error);
  }
};

export const handleCallback = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = z.object({ code: z.string().min(1, 'Código de autorização é obrigatório') });
    const { code } = schema.parse(req.body);

    const account = await instagramService.connectAccount(code);
    res.json({ account: sanitizeAccount(account as unknown as Record<string, unknown>) });
  } catch (error) {
    next(error);
  }
};

// ── Accounts ──────────────────────────────────────────────────────────────────

export const listAccounts = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const accounts = await instagramService.listAccounts();
    res.json({ accounts });
  } catch (error) {
    next(error);
  }
};

export const disconnectAccount = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    await instagramService.disconnectAccount(id);
    res.json({ message: 'Conta desconectada com sucesso' });
  } catch (error) {
    next(error);
  }
};

// ── Media upload ──────────────────────────────────────────────────────────────

export const uploadMedia = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.file) {
      throw new AppError('Nenhum arquivo enviado', 400);
    }

    const filename = req.file.filename;
    // Serve o arquivo via rota /api/instagram/media/file/:filename (sem depender de proxy /uploads/)
    // Se PUBLIC_URL estiver definida, gera URL absoluta (necessária para o Instagram Graph API buscar a imagem)
    const publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
    const apiPath = `/api/instagram/media/file/${filename}`;
    const url = publicUrl ? `${publicUrl}${apiPath}` : apiPath;

    logger.info('Instagram media uploaded', { filename });
    res.json({ url, filename });
  } catch (error) {
    next(error);
  }
};

// Serve arquivos de mídia sem autenticação (necessário para o Instagram Graph API baixar a imagem)
export const serveMediaFile = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    // path.basename previne path traversal (ex: ../../etc/passwd)
    const safe = path.basename(req.params.filename);
    const filepath = path.join(process.cwd(), 'uploads', 'instagram', safe);
    res.sendFile(filepath, (err) => {
      if (err) {
        next(new AppError('Arquivo de mídia não encontrado', 404));
      }
    });
  } catch (error) {
    next(error);
  }
};

// ── Posts ─────────────────────────────────────────────────────────────────────

const createPostSchema = z.object({
  accountId: z.string().uuid('ID de conta inválido'),
  mediaType: z.nativeEnum(InstagramMediaType),
  mediaUrls: z.array(z.string().url('URL de mídia inválida')).min(1, 'Pelo menos uma URL de mídia é necessária'),
  caption: z.string().optional(),
  hashtags: z.string().optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
});

export const createPost = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = createPostSchema.parse(req.body);

    const post = await instagramService.createPost({
      accountId: data.accountId,
      mediaType: data.mediaType,
      mediaUrls: data.mediaUrls,
      caption: data.caption,
      hashtags: data.hashtags,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
    });

    res.status(201).json({ post });
  } catch (error) {
    next(error);
  }
};

export const listPosts = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const accountId = req.query.accountId as string | undefined;
    const status = req.query.status as string | undefined;

    const result = await instagramService.listPosts({ accountId, status, page, limit });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getPost = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const post = await instagramService.getPost(id);
    if (!post) throw new AppError('Post não encontrado', 404);
    res.json({ post });
  } catch (error) {
    next(error);
  }
};

const updatePostSchema = z.object({
  accountId: z.string().uuid().optional(),
  mediaType: z.nativeEnum(InstagramMediaType).optional(),
  mediaUrls: z.array(z.string().url()).optional(),
  caption: z.string().optional(),
  hashtags: z.string().optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
});

export const updatePost = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = updatePostSchema.parse(req.body);

    const post = await instagramService.updatePost(id, {
      ...data,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : data.scheduledAt === null ? null : undefined,
    });

    res.json({ post });
  } catch (error) {
    next(error);
  }
};

export const deletePost = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    await instagramService.deletePost(id);
    res.json({ message: 'Post excluído com sucesso' });
  } catch (error) {
    next(error);
  }
};

export const publishPostNow = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await instagramService.getPost(id);
    if (!existing) throw new AppError('Post não encontrado', 404);

    // Publish immediately (fire and respond)
    instagramService.publishPost(id).catch((err) => {
      logger.error('Instagram publishPostNow background error', { postId: id, error: err });
    });

    res.json({ message: 'Publicação iniciada', postId: id });
  } catch (error) {
    next(error);
  }
};
