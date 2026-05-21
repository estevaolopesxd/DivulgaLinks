import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error';
import { logger } from '../utils/logger';

const templateSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório').max(100),
  content: z.string().min(1, 'Conteúdo obrigatório').max(4000),
  isActive: z.boolean().optional().default(true),
});

export const listTemplates = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const templates = await prisma.messageTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ templates });
  } catch (error) {
    next(error);
  }
};

export const createTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const data = templateSchema.parse(req.body);

    const template = await prisma.messageTemplate.create({ data });

    logger.info('Template: created', { id: template.id, name: template.name });
    res.status(201).json({ message: 'Template criado com sucesso', template });
  } catch (error) {
    next(error);
  }
};

export const updateTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = templateSchema.partial().parse(req.body);

    const existing = await prisma.messageTemplate.findUnique({ where: { id } });
    if (!existing) throw new AppError('Template não encontrado', 404);

    const template = await prisma.messageTemplate.update({
      where: { id },
      data,
    });

    logger.info('Template: updated', { id });
    res.json({ message: 'Template atualizado', template });
  } catch (error) {
    next(error);
  }
};

export const deleteTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await prisma.messageTemplate.findUnique({ where: { id } });
    if (!existing) throw new AppError('Template não encontrado', 404);

    await prisma.messageTemplate.delete({ where: { id } });

    logger.info('Template: deleted', { id });
    res.json({ message: 'Template excluído com sucesso' });
  } catch (error) {
    next(error);
  }
};
