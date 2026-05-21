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
import axios from 'axios';

interface SessionEntry {
  sock: WASocket;
  status: WhatsAppStatus;
  qrCode: string | null;
  initializedAt: number; // timestamp para detectar CONNECTING travado
}

const sessions = new Map<string, SessionEntry>();

// Contador de reconexões por conta — zera quando conecta com sucesso
const reconnectCounts = new Map<string, number>();
const MAX_RECONNECTS = 3;
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

  if (existing) {
    // Permite re-inicializar se o CONNECTING estiver travado há mais de 90s
    const staleConnecting =
      existing.status === WhatsAppStatus.CONNECTING &&
      Date.now() - existing.initializedAt > 90_000;

    if (existing.status === WhatsAppStatus.CONNECTED || (existing.status === WhatsAppStatus.CONNECTING && !staleConnecting)) {
      logger.info('WhatsApp: session already active', { accountId, status: existing.status });
      return;
    }

    // Sessão travada ou em estado inválido — encerrar antes de reiniciar
    logger.warn('WhatsApp: encerrando sessão travada antes de reiniciar', { accountId });
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

  const entry: SessionEntry = { sock, status: WhatsAppStatus.CONNECTING, qrCode: null, initializedAt: Date.now() };
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
      reconnectCounts.delete(accountId); // reconectou com sucesso — zerar contador

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
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      logger.warn('WhatsApp: connection closed', { accountId, statusCode, isLoggedOut });

      entry.status = WhatsAppStatus.DISCONNECTED;
      sessions.delete(accountId);

      await updateAccountStatus(accountId, WhatsAppStatus.DISCONNECTED, { qrCode: null });
      emit('whatsapp:status', { accountId, status: WhatsAppStatus.DISCONNECTED });
      emit('whatsapp:disconnected', { accountId, statusCode });

      if (isLoggedOut) {
        // Logout explícito — limpar arquivos e não reconectar
        reconnectCounts.delete(accountId);
        try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch { /* ignore */ }
        return;
      }

      // Reconectar com limite de tentativas
      const attempts = (reconnectCounts.get(accountId) ?? 0) + 1;
      reconnectCounts.set(accountId, attempts);

      if (attempts > MAX_RECONNECTS) {
        // Sessão corrompida — limpar arquivos e parar de tentar
        logger.warn('WhatsApp: máximo de reconexões atingido, limpando sessão corrompida', {
          accountId,
          attempts,
        });
        reconnectCounts.delete(accountId);
        try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch { /* ignore */ }
        // Status já está DISCONNECTED — usuário precisa escanear novo QR
        return;
      }

      const delayMs = Math.min(5000 * attempts, 30_000); // backoff: 5s, 10s, 15s
      logger.info('WhatsApp: reagendando reconexão', { accountId, attempts, delayMs });
      setTimeout(() => initializeClient(accountId), delayMs);
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

  logger.info('WhatsApp: sending message', {
    accountId,
    jid,
    hasImage: !!imageUrl,
    imageUrl: imageUrl ?? null,
    textLength: text.length,
  });

  // ── Strategy 1: image + caption via downloaded buffer ────────────────────
  if (imageUrl) {
    const absoluteUrl = imageUrl.startsWith('http')
      ? imageUrl
      : `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}${imageUrl}`;

    // Strategy 1a: download buffer → send with caption
    try {
      const imgResponse = await axios.get(absoluteUrl, {
        responseType: 'arraybuffer',
        timeout: 20_000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        maxRedirects: 10,
      });

      const imageBuffer = Buffer.from(imgResponse.data as ArrayBuffer);

      if (imageBuffer.length < 500) {
        throw new Error(`Buffer suspeito (${imageBuffer.length} bytes) — provavelmente página de erro`);
      }

      const lowerUrl = absoluteUrl.toLowerCase().split('?')[0];
      const mimetype = lowerUrl.endsWith('.png')  ? 'image/png'
                     : lowerUrl.endsWith('.gif')  ? 'image/gif'
                     : lowerUrl.endsWith('.webp') ? 'image/webp'
                     : 'image/jpeg';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await entry.sock.sendMessage(jid, { image: imageBuffer, mimetype, caption: text } as any);
      logger.info('WhatsApp: [1a] image+caption sent via buffer', { accountId, jid, bytes: imageBuffer.length });
      return true;
    } catch (err1a) {
      logger.warn('WhatsApp: [1a] buffer strategy failed', {
        error: err1a instanceof Error ? err1a.message : String(err1a),
      });
    }

    // Strategy 1b: send via URL directly (let Baileys handle the download)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await entry.sock.sendMessage(jid, { image: { url: absoluteUrl }, caption: text } as any);
      logger.info('WhatsApp: [1b] image+caption sent via URL', { accountId, jid, url: absoluteUrl });
      return true;
    } catch (err1b) {
      logger.warn('WhatsApp: [1b] URL strategy failed — falling back to text only', {
        error: err1b instanceof Error ? err1b.message : String(err1b),
      });
    }
  }

  // ── Strategy 2: text only (final fallback) ────────────────────────────────
  await entry.sock.sendMessage(jid, { text });
  logger.info('WhatsApp: [2] text-only message sent', { accountId, jid });
  return true;
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
  reconnectCounts.delete(accountId); // parar qualquer loop de reconexão
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

/**
 * Remove os arquivos de sessão do disco para um accountId.
 * Útil ao excluir uma conta que está DISCONNECTED (sem entrada em memória).
 */
export const deleteSessionFiles = (accountId: string): void => {
  const sessionPath = path.join(sessionsDir, accountId);
  try {
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      logger.info('WhatsApp: session files deleted', { accountId, sessionPath });
    }
  } catch (err) {
    logger.warn('WhatsApp: failed to delete session files', { accountId, error: err });
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
  deleteSessionFiles,
  restoreSessions,
};

export default whatsappService;
