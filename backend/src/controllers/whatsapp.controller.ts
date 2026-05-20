import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { WhatsAppStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error';
import { logger } from '../utils/logger';
import { sanitizeWhatsAppAccount } from '../utils/sanitize';
import * as whatsappService from '../services/whatsapp.service';

export const listAccounts = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const accounts = await prisma.whatsAppAccount.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        // Don't return sessionData or qrCode in list
      },
    });

    res.json({ accounts: accounts.map((account) => sanitizeWhatsAppAccount(account, false)) });
  } catch (error) {
    next(error);
  }
};

export const createAccount = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = z.object({
      name: z.string().min(2).max(100),
    });

    const data = schema.parse(req.body);

    const account = await prisma.whatsAppAccount.create({
      data: {
        name: data.name,
        status: WhatsAppStatus.DISCONNECTED,
      },
    });

    res.status(201).json({ message: 'WhatsApp account created', account });
  } catch (error) {
    next(error);
  }
};

export const deleteAccount = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    // Disconnect if active
    const status = whatsappService.getClientStatus(id);
    if (status === WhatsAppStatus.CONNECTED || status === WhatsAppStatus.CONNECTING) {
      await whatsappService.disconnectClient(id);
    }

    await prisma.whatsAppAccount.delete({ where: { id } });

    res.json({ message: 'WhatsApp account deleted' });
  } catch (error) {
    next(error);
  }
};

export const initializeSession = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const account = await prisma.whatsAppAccount.findUnique({ where: { id } });
    if (!account) {
      throw new AppError('WhatsApp account not found', 404);
    }

    // Start initialization (non-blocking - QR will be emitted via socket)
    whatsappService.initializeClient(id).catch((err) => {
      logger.error('WhatsApp: initialization error', { accountId: id, error: err });
    });

    res.json({
      message: 'Initialization started. Connect via WebSocket for QR code updates.',
      accountId: id,
      status: WhatsAppStatus.CONNECTING,
    });
  } catch (error) {
    next(error);
  }
};

export const getQRCode = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const account = await prisma.whatsAppAccount.findUnique({ where: { id } });
    if (!account) {
      throw new AppError('WhatsApp account not found', 404);
    }

    const qrCode = whatsappService.getQRCode(id);
    const status = whatsappService.getClientStatus(id);

    const safeAccount = sanitizeWhatsAppAccount(account, true);

    if (!qrCode && status !== WhatsAppStatus.QR_PENDING) {
      res.json({
        status,
        qrCode: safeAccount.qrCode,
        message: status === WhatsAppStatus.CONNECTED
          ? 'Already connected'
          : 'No QR code available. Start a session first.',
      });
      return;
    }

    res.json({
      status: WhatsAppStatus.QR_PENDING,
      qrCode: qrCode ?? safeAccount.qrCode,
    });
  } catch (error) {
    next(error);
  }
};

export const getGroups = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const groups = await whatsappService.getGroups(id);

    res.json({ groups });
  } catch (error) {
    next(error);
  }
};

export const getChannels = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const channels = await whatsappService.getChannels(id);

    res.json({ channels });
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

    const account = await prisma.whatsAppAccount.findUnique({ where: { id } });
    if (!account) {
      throw new AppError('WhatsApp account not found', 404);
    }

    await whatsappService.disconnectClient(id);

    res.json({ message: 'Account disconnected' });
  } catch (error) {
    next(error);
  }
};

export const getAccountStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const account = await prisma.whatsAppAccount.findUnique({
      where: { id },
      select: { id: true, name: true, phoneNumber: true, status: true, updatedAt: true },
    });

    if (!account) {
      throw new AppError('WhatsApp account not found', 404);
    }

    const liveStatus = whatsappService.getClientStatus(id);

    res.json({
      account: { ...sanitizeWhatsAppAccount(account, false), liveStatus },
    });
  } catch (error) {
    next(error);
  }
};
