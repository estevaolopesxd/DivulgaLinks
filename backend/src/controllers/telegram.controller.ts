import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { TelegramBotStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error';
import { logger } from '../utils/logger';
import { sanitizeTelegramBot } from '../utils/sanitize';
import telegramService from '../services/telegram.service';

export const listBots = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const bots = await prisma.telegramBot.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        username: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        // Don't expose token in list
      },
    });

    res.json({ bots: bots.map(sanitizeTelegramBot) });
  } catch (error) {
    next(error);
  }
};

export const createBot = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = z.object({
      name: z.string().min(2).max(100),
      token: z.string().min(10, 'Invalid bot token format'),
    });

    const data = schema.parse(req.body);

    // Validate the token with Telegram
    const validation = await telegramService.validateBotToken(data.token);
    if (!validation.valid) {
      throw new AppError('Invalid Telegram bot token', 400);
    }

    const bot = await prisma.telegramBot.create({
      data: {
        name: data.name,
        token: data.token,
        username: validation.username,
        status: TelegramBotStatus.INACTIVE,
      },
      select: {
        id: true,
        name: true,
        username: true,
        status: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      message: 'Telegram bot created',
      bot: sanitizeTelegramBot(bot),
    });
  } catch (error) {
    next(error);
  }
};

export const deleteBot = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const bot = await prisma.telegramBot.findUnique({ where: { id } });
    if (!bot) {
      throw new AppError('Telegram bot not found', 404);
    }

    // Stop if active
    if (bot.status === TelegramBotStatus.ACTIVE) {
      await telegramService.stopBot(id);
    }

    await prisma.telegramBot.delete({ where: { id } });

    res.json({ message: 'Telegram bot deleted' });
  } catch (error) {
    next(error);
  }
};

export const startBot = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const bot = await prisma.telegramBot.findUnique({ where: { id } });
    if (!bot) {
      throw new AppError('Telegram bot not found', 404);
    }

    if (bot.status === TelegramBotStatus.ACTIVE) {
      res.json({ message: 'Bot is already active', status: TelegramBotStatus.ACTIVE });
      return;
    }

    await telegramService.initializeBot(id, bot.token);

    res.json({ message: 'Telegram bot started', status: TelegramBotStatus.ACTIVE });
  } catch (error) {
    next(error);
  }
};

export const stopBot = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const bot = await prisma.telegramBot.findUnique({ where: { id } });
    if (!bot) {
      throw new AppError('Telegram bot not found', 404);
    }

    await telegramService.stopBot(id);

    res.json({ message: 'Telegram bot stopped' });
  } catch (error) {
    next(error);
  }
};

export const getChats = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const bot = await prisma.telegramBot.findUnique({ where: { id } });
    if (!bot) {
      throw new AppError('Telegram bot not found', 404);
    }

    if (bot.status !== TelegramBotStatus.ACTIVE) {
      throw new AppError('Bot must be active to list chats', 400);
    }

    const chats = await telegramService.getChats(id);

    res.json({
      chats,
      note: 'Telegram API does not allow bots to list all chats. Add chat IDs manually.',
    });
  } catch (error) {
    next(error);
  }
};

export const sendTestMessage = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const schema = z.object({
      chatId: z.string().min(1),
      message: z.string().min(1).max(4096),
    });

    const data = schema.parse(req.body);

    const bot = await prisma.telegramBot.findUnique({ where: { id } });
    if (!bot) {
      throw new AppError('Telegram bot not found', 404);
    }

    if (bot.status !== TelegramBotStatus.ACTIVE) {
      throw new AppError('Bot must be active to send messages', 400);
    }

    await telegramService.sendMessage(id, data.chatId, data.message);

    res.json({ message: 'Test message sent successfully' });
  } catch (error) {
    next(error);
  }
};
