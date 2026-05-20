import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidGroup,
  isJidNewsletter,
  proto,
  AnyMessageContent,
  WASocket,
  ConnectionState,
  BaileysEventMap,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { Server as SocketIOServer } from 'socket.io';
import { WhatsAppStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import path from 'path';
import fs from 'fs';
import P from 'pino';

interface SessionEntry {
  sock: WASocket;
  status: WhatsAppStatus;
  qrCode: string | null;
}

const sessions = new Map<string, SessionEntry>();
const sessionsDir = path.join(process.cwd(), 'whatsapp_sessions');
let ioServer: SocketIOServer | null = null;

// Baileys logs via pino — silence them in production
const baileysLogger = P({ level: 'silent' });

export const setSocketIO = (io: SocketIOServer): void => {
  ioServer = io;
};

const emit = (event: string, data: unknown): void => {
  ioServer?.emit(event, data);
};

const updateAccountStatus = async (
  accountId: string,
  status: WhatsAppStatus,
  extra?: { qrCode?: string | null; phoneNumber?: string },
): Promise<void> => {
  try {
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: {
        status,
        ...(extra?.qrCode !== undefined ? { qrCode: extra.qrCode } : {}),
        ...(extra?.phoneNumber ? { phoneNumber: extra.phoneNumber } : {}),
      },
    });
  } catch (error) {
    logger.error('WhatsApp: failed to update account status', { accountId, status, error });
  }
};

export const initializeClient = async (accountId: string): Promise<void> => {
  const existing = sessions.get(accountId);
  if (existing?.status === WhatsAppStatus.CONNECTED || existing?.status === WhatsAppStatus.CONNECTING) {
    logger.info('WhatsApp: session already active', { accountId });
    return;
  }

  if (existing) {
    try { existing.sock.end(undefined); } catch { /* ignore */ }
    sessions.delete(accountId);
  }

  const sessionPath = path.join(sessionsDir, accountId);
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  logger.info('WhatsApp: initializing session with Baileys', { accountId, version });

  await updateAccountStatus(accountId, WhatsAppStatus.CONNECTING);
  emit('whatsapp:status', { accountId, status: WhatsAppStatus.CONNECTING });

  const sock = makeWASocket({
    version,
    auth: state,
    logger: baileysLogger,
    printQRInTerminal: false,
    browser: ['DivulgaLinks', 'Chrome', '1.0.0'],
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 30_000,
    keepAliveIntervalMs: 25_000,
    markOnlineOnConnect: false,
  });

  const entry: SessionEntry = { sock, status: WhatsAppStatus.CONNECTING, qrCode: null };
  sessions.set(accountId, entry);

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  // Connection state updates
  sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('WhatsApp: QR code generated', { accountId });
      entry.qrCode = qr;
      entry.status = WhatsAppStatus.QR_PENDING;
      await updateAccountStatus(accountId, WhatsAppStatus.QR_PENDING, { qrCode: qr });
      emit('whatsapp:qr', { accountId, qr });
      emit('whatsapp:status', { accountId, status: WhatsAppStatus.QR_PENDING });
    }

    if (connection === 'open') {
      logger.info('WhatsApp: connection opened', { accountId });
      entry.status = WhatsAppStatus.CONNECTED;
      entry.qrCode = null;

      const phoneNumber = sock.user?.id?.split(':')[0] ?? '';
      await updateAccountStatus(accountId, WhatsAppStatus.CONNECTED, {
        qrCode: null,
        ...(phoneNumber ? { phoneNumber } : {}),
      });
      emit('whatsapp:ready', { accountId, phoneNumber });
      emit('whatsapp:status', { accountId, status: WhatsAppStatus.CONNECTED });
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn('WhatsApp: connection closed', { accountId, statusCode, shouldReconnect });

      entry.status = WhatsAppStatus.DISCONNECTED;
      sessions.delete(accountId);

      await updateAccountStatus(accountId, WhatsAppStatus.DISCONNECTED, { qrCode: null });
      emit('whatsapp:status', { accountId, status: WhatsAppStatus.DISCONNECTED });
      emit('whatsapp:disconnected', { accountId, statusCode });

      // Auto-reconnect unless explicitly logged out
      if (shouldReconnect) {
        logger.info('WhatsApp: scheduling reconnect', { accountId, delayMs: 5000 });
        setTimeout(() => initializeClient(accountId), 5000);
      } else {
        // Remove session files on logout
        try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }
  });
};

export const getQRCode = (accountId: string): string | null => {
  return sessions.get(accountId)?.qrCode ?? null;
};

export const getClientStatus = (accountId: string): WhatsAppStatus => {
  return sessions.get(accountId)?.status ?? WhatsAppStatus.DISCONNECTED;
};

export const sendMessage = async (
  accountId: string,
  jid: string,
  text: string,
  imageUrl?: string,
): Promise<boolean> => {
  const entry = sessions.get(accountId);
  if (!entry || entry.status !== WhatsAppStatus.CONNECTED) {
    throw new Error(`WhatsApp account ${accountId} is not connected`);
  }

  try {
    let content: AnyMessageContent;

    if (imageUrl) {
      content = { image: { url: imageUrl }, caption: text };
    } else {
      content = { text };
    }

    await entry.sock.sendMessage(jid, content);
    logger.info('WhatsApp: message sent', { accountId, jid });
    return true;
  } catch (error) {
    logger.error('WhatsApp: failed to send message', { accountId, jid, error });
    throw error;
  }
};

export const getGroups = async (
  accountId: string,
): Promise<Array<{ id: string; name: string; participants: number }>> => {
  const entry = sessions.get(accountId);
  if (!entry || entry.status !== WhatsAppStatus.CONNECTED) {
    throw new Error(`WhatsApp account ${accountId} is not connected`);
  }

  try {
    const groups = await entry.sock.groupFetchAllParticipating();
    return Object.values(groups).map((g) => ({
      id: g.id,
      name: g.subject,
      participants: g.participants?.length ?? 0,
    }));
  } catch (error) {
    logger.error('WhatsApp: failed to fetch groups', { accountId, error });
    throw error;
  }
};

export const getChannels = async (
  accountId: string,
): Promise<Array<{ id: string; name: string }>> => {
  const entry = sessions.get(accountId);
  if (!entry || entry.status !== WhatsAppStatus.CONNECTED) {
    throw new Error(`WhatsApp account ${accountId} is not connected`);
  }

  try {
    // Fetch newsletter/channel metadata from sock store
    // Channels use the @newsletter JID suffix
    const chats = await (entry.sock as any).fetchNewsletterInfo?.('') ?? [];
    if (Array.isArray(chats)) {
      return chats.map((c: any) => ({ id: c.id, name: c.name ?? c.id }));
    }
    return [];
  } catch (error) {
    logger.error('WhatsApp: failed to fetch channels', { accountId, error });
    return [];
  }
};

export const disconnectClient = async (accountId: string): Promise<void> => {
  const entry = sessions.get(accountId);
  if (!entry) {
    logger.warn('WhatsApp: no session to disconnect', { accountId });
    return;
  }

  try {
    await entry.sock.logout();
    logger.info('WhatsApp: session logged out', { accountId });
  } catch (error) {
    logger.error('WhatsApp: error during logout', { accountId, error });
    try { entry.sock.end(undefined); } catch { /* ignore */ }
  } finally {
    sessions.delete(accountId);
    await updateAccountStatus(accountId, WhatsAppStatus.DISCONNECTED, { qrCode: null });
    emit('whatsapp:status', { accountId, status: WhatsAppStatus.DISCONNECTED });

    // Clean up session files
    const sessionPath = path.join(sessionsDir, accountId);
    try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch { /* ignore */ }
  }
};

export const restoreSessions = async (): Promise<void> => {
  try {
    const accounts = await prisma.whatsAppAccount.findMany({
      where: { status: { in: [WhatsAppStatus.CONNECTED, WhatsAppStatus.CONNECTING] } },
    });

    logger.info(`WhatsApp: restoring ${accounts.length} sessions`);

    for (const account of accounts) {
      try {
        await initializeClient(account.id);
      } catch (error) {
        logger.error('WhatsApp: failed to restore session', { accountId: account.id, error });
      }
    }
  } catch (error) {
    logger.error('WhatsApp: failed to restore sessions', { error });
  }
};

const whatsappService = {
  setSocketIO,
  initializeClient,
  getQRCode,
  getClientStatus,
  sendMessage,
  getGroups,
  getChannels,
  disconnectClient,
  restoreSessions,
};

export default whatsappService;
