import { Telegraf, Context } from 'telegraf';
import { TelegramBotStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

interface BotEntry {
  bot: Telegraf<Context>;
  status: TelegramBotStatus;
}

const bots = new Map<string, BotEntry>();

/**
 * Update bot status in the database.
 */
const updateBotStatus = async (
  botId: string,
  status: TelegramBotStatus,
  username?: string,
): Promise<void> => {
  try {
    await prisma.telegramBot.update({
      where: { id: botId },
      data: {
        status,
        ...(username ? { username } : {}),
      },
    });
  } catch (error) {
    logger.error('Telegram: failed to update bot status', { botId, status, error });
  }
};

/**
 * Initialize and launch a Telegram bot.
 */
export const initializeBot = async (botId: string, token: string): Promise<void> => {
  if (bots.has(botId)) {
    const entry = bots.get(botId)!;
    if (entry.status === TelegramBotStatus.ACTIVE) {
      logger.info('Telegram: bot already active', { botId });
      return;
    }
    // Stop existing bot first
    try {
      await entry.bot.stop();
    } catch {
      // ignore
    }
    bots.delete(botId);
  }

  logger.info('Telegram: initializing bot', { botId });

  const bot = new Telegraf(token);

  const entry: BotEntry = {
    bot,
    status: TelegramBotStatus.INACTIVE,
  };
  bots.set(botId, entry);

  // Basic error handling
  bot.catch((err: unknown, ctx: Context) => {
    logger.error('Telegram: bot error', { botId, chatId: ctx.chat?.id, error: err });
  });

  // Handle /start command for new users
  bot.start((ctx) => {
    ctx.reply('Bot DivulgaLinks ativo! Você receberá ofertas em breve.');
  });

  try {
    // Get bot info
    const botInfo = await bot.telegram.getMe();
    logger.info('Telegram: bot info retrieved', { botId, username: botInfo.username });

    // Launch in background (non-blocking)
    bot.launch().catch((err) => {
      logger.error('Telegram: bot launch error', { botId, error: err });
    });

    entry.status = TelegramBotStatus.ACTIVE;
    await updateBotStatus(botId, TelegramBotStatus.ACTIVE, botInfo.username);

    logger.info('Telegram: bot launched', { botId, username: botInfo.username });
  } catch (error) {
    logger.error('Telegram: failed to initialize bot', { botId, error });
    bots.delete(botId);
    await updateBotStatus(botId, TelegramBotStatus.INACTIVE);
    throw new Error(`Failed to initialize Telegram bot: ${(error as Error).message}`);
  }
};

/**
 * Send a message to a Telegram chat, optionally with an image.
 */
export const sendMessage = async (
  botId: string,
  chatId: string,
  message: string,
  imageUrl?: string,
): Promise<boolean> => {
  const entry = bots.get(botId);

  if (!entry || entry.status !== TelegramBotStatus.ACTIVE) {
    throw new Error(`Telegram bot ${botId} is not active`);
  }

  try {
    const numericChatId = isNaN(Number(chatId)) ? chatId : Number(chatId);

    if (imageUrl) {
      await entry.bot.telegram.sendPhoto(numericChatId, imageUrl, {
        caption: message,
        parse_mode: 'HTML',
      });
    } else {
      await entry.bot.telegram.sendMessage(numericChatId, message, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: false },
      });
    }

    logger.info('Telegram: message sent', { botId, chatId });
    return true;
  } catch (error) {
    logger.error('Telegram: failed to send message', { botId, chatId, error });
    throw error;
  }
};

/**
 * Get a bot instance by ID.
 */
export const getBot = (botId: string): Telegraf<Context> | null => {
  return bots.get(botId)?.bot ?? null;
};

/**
 * Stop a running Telegram bot.
 */
export const stopBot = async (botId: string): Promise<void> => {
  const entry = bots.get(botId);

  if (!entry) {
    logger.warn('Telegram: no bot found to stop', { botId });
    return;
  }

  try {
    await entry.bot.stop();
    logger.info('Telegram: bot stopped', { botId });
  } catch (error) {
    logger.error('Telegram: error stopping bot', { botId, error });
  } finally {
    bots.delete(botId);
    await updateBotStatus(botId, TelegramBotStatus.INACTIVE);
  }
};

/**
 * Get the list of chats (groups/channels) the bot is a member of.
 * Note: Telegram doesn't provide a direct API to list all chats.
 * This returns bot info and requires chat IDs to be known.
 */
export const getChats = async (
  botId: string,
): Promise<{ id: number; type: string; title: string }[]> => {
  const entry = bots.get(botId);

  if (!entry || entry.status !== TelegramBotStatus.ACTIVE) {
    throw new Error(`Telegram bot ${botId} is not active`);
  }

  // Telegram Bot API doesn't support listing all chats directly.
  // Return empty array - chats must be added manually.
  logger.info('Telegram: listing chats (requires manual input)', { botId });
  return [];
};

/**
 * Validate a Telegram bot token by calling getMe.
 */
export const validateBotToken = async (
  token: string,
): Promise<{ valid: boolean; username?: string; firstName?: string }> => {
  try {
    const tempBot = new Telegraf(token);
    const info = await tempBot.telegram.getMe();
    return { valid: true, username: info.username, firstName: info.first_name };
  } catch (error) {
    logger.error('Telegram: token validation failed', { error });
    return { valid: false };
  }
};

/**
 * Restore active bots on startup.
 */
export const restoreBots = async (): Promise<void> => {
  try {
    const activeBots = await prisma.telegramBot.findMany({
      where: { status: TelegramBotStatus.ACTIVE },
    });

    logger.info(`Telegram: restoring ${activeBots.length} bots`);

    for (const botRecord of activeBots) {
      try {
        await initializeBot(botRecord.id, botRecord.token);
      } catch (error) {
        logger.error('Telegram: failed to restore bot', { botId: botRecord.id, error });
      }
    }
  } catch (error) {
    logger.error('Telegram: failed to restore bots', { error });
  }
};

const telegramService = {
  initializeBot,
  sendMessage,
  getBot,
  stopBot,
  getChats,
  validateBotToken,
  restoreBots,
};

export default telegramService;
