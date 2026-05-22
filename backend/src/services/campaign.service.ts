import { Queue } from 'bullmq';
import { CampaignStatus, DestinationType, MessageStatus, ProductRepeatMode } from '@prisma/client';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { parseTemplate } from '../utils/template';
import * as whatsappService from './whatsapp.service';
import telegramService from './telegram.service';

const QUEUE_NAME = 'campaign-dispatch';

// ── Helpers de janela de tempo ─────────────────────────────────────────────

/**
 * Verifica se o horário atual está dentro da janela permitida da campanha.
 * Retorna true se não houver restrição ou se estiver dentro do intervalo.
 */
const isWithinTimeWindow = (
  allowedStartTime?: string | null,
  allowedEndTime?: string | null,
  allowedWeekdays?: number[],
): boolean => {
  const now = new Date();

  // Verifica dia da semana
  if (allowedWeekdays && allowedWeekdays.length > 0) {
    const today = now.getDay(); // 0=Dom, 6=Sáb
    if (!allowedWeekdays.includes(today)) return false;
  }

  // Verifica janela de horário
  if (allowedStartTime && allowedEndTime) {
    const [sh, sm] = allowedStartTime.split(':').map(Number);
    const [eh, em] = allowedEndTime.split(':').map(Number);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;

    // Suporta janela que passa da meia-noite (ex: 22:00 – 02:00)
    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  }

  return true;
};

/**
 * Calcula o próximo DateTime em que a janela de tempo abre.
 * Itera pelos próximos 8 dias para encontrar o próximo slot válido.
 */
const getNextWindowOpenTime = (
  allowedStartTime: string,
  allowedWeekdays: number[],
): Date => {
  const [h, m] = allowedStartTime.split(':').map(Number);
  const now = new Date();

  for (let daysAhead = 0; daysAhead <= 8; daysAhead++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + daysAhead);
    candidate.setHours(h, m, 0, 0);

    const dayOfWeek = candidate.getDay();
    const isDayAllowed = allowedWeekdays.length === 0 || allowedWeekdays.includes(dayOfWeek);

    if (isDayAllowed && candidate > now) {
      return candidate;
    }
  }

  // Fallback improvável: 1 hora a partir de agora
  return new Date(Date.now() + 60 * 60 * 1000);
};

/**
 * Ensures a product has a tracking URL. Generates and persists one if missing.
 * Returns the (potentially updated) product object.
 */

let campaignQueue: Queue | null = null;

export const getCampaignQueue = (): Queue => {
  if (!campaignQueue) {
    campaignQueue = new Queue(QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return campaignQueue;
};

/**
 * Start a campaign: validate state, enqueue the first dispatch job.
 */
export const startCampaign = async (campaignId: string): Promise<void> => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      destinations: { where: { isActive: true } },
      products: { include: { product: true } },
    },
  });

  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  if (campaign.destinations.length === 0) {
    throw new Error('Campaign has no active destinations');
  }

  if (campaign.products.length === 0) {
    throw new Error('Campaign has no products');
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.ACTIVE, isActive: true },
  });

  logger.info('Campaign: starting', { campaignId });

  const queue = getCampaignQueue();
  await queue.add(
    'dispatch',
    { campaignId },
    { jobId: `campaign-${campaignId}-${Date.now()}` },
  );
};

/**
 * Stop an active campaign.
 */
export const stopCampaign = async (campaignId: string): Promise<void> => {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.PAUSED, isActive: false },
  });

  // Remove pending jobs for this campaign
  const queue = getCampaignQueue();
  const jobs = await queue.getJobs(['waiting', 'delayed']);
  for (const job of jobs) {
    if (job.data?.campaignId === campaignId) {
      await job.remove();
    }
  }

  logger.info('Campaign: stopped', { campaignId });
};

/**
 * Process a campaign dispatch: send messages for each product to each destination.
 */
export const processCampaignJob = async (campaignId: string): Promise<void> => {
  const dispatchStartedAt = Date.now(); // usado para calcular próximo ciclo a partir do INÍCIO
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      destinations: { where: { isActive: true } },
      products: { include: { product: true } },
    },
  });

  if (!campaign || !campaign.isActive) {
    logger.info('Campaign: skipping inactive campaign', { campaignId });
    return;
  }

  // ── Verificação de janela de tempo da campanha ─────────────────────────────
  const inWindow = isWithinTimeWindow(
    campaign.allowedStartTime,
    campaign.allowedEndTime,
    campaign.allowedWeekdays,
  );

  if (!inWindow) {
    const nextOpen = getNextWindowOpenTime(
      campaign.allowedStartTime ?? '00:00',
      campaign.allowedWeekdays,
    );
    const delayMs = nextOpen.getTime() - Date.now();

    logger.info('Campaign: fora da janela de horário, reagendando para abertura', {
      campaignId,
      nextOpen: nextOpen.toISOString(),
      allowedStartTime: campaign.allowedStartTime,
      allowedEndTime: campaign.allowedEndTime,
      allowedWeekdays: campaign.allowedWeekdays,
    });

    const queue = getCampaignQueue();
    await queue.add(
      'dispatch',
      { campaignId },
      { delay: delayMs, jobId: `campaign-${campaignId}-window-${Date.now()}` },
    );
    return;
  }

  if (campaign.products.length === 0) {
    logger.warn('Campaign: nenhum produto na campanha — dispatch ignorado', { campaignId });
    await scheduleNextRun(campaignId);
    return;
  }
  if (campaign.destinations.length === 0) {
    logger.warn('Campaign: nenhum destino ativo na campanha — dispatch ignorado', { campaignId });
    await scheduleNextRun(campaignId);
    return;
  }

  logger.info('Campaign: processing dispatch', {
    campaignId,
    products: campaign.products.length,
    destinations: campaign.destinations.length,
  });

  // ── Template pool ─────────────────────────────────────────────────────────
  // Fetch globally active templates; fall back to campaign template if none.
  const globalTemplates = await prisma.messageTemplate.findMany({
    where: { isActive: true },
    select: { content: true },
  });

  // Built-in default templates — formato post WhatsApp com foto
  const BUILTIN_TEMPLATES = [
    '🔥 *OFERTA DO DIA* 🔥\n\n🤩💥 *{{name}}*\n\n{{shortDescription}}\n\n{{priceBlockLines}}\n\n🛍️ Compre Aqui 👇\n{{url}}\n\n⏰ Promoção sujeita a alteração sem aviso prévio ou frete.',
    '✨ *DESTAQUE DA SEMANA* ✨\n\n😍💫 *{{name}}*\n\n{{shortDescription}}\n\n{{priceBlockLines}}\n\n🛒 Garanta o seu agora 👇\n{{url}}\n\n⚠️ Preço sujeito a alteração. Confira condições no site.',
    '💥 *SUPER PROMOÇÃO* 💥\n\n🎯🛍️ *{{name}}*\n\n{{shortDescription}}\n\n{{priceBlockLines}}\n\n👇 Link para comprar:\n{{url}}\n\n⏰ Válido por tempo limitado!',
    '⚡ *OFERTA RELÂMPAGO* ⚡\n\n🚀💎 *{{name}}*\n\n{{shortDescription}}\n\n{{priceBlockLines}}\n\n🔗 Aproveite agora:\n{{url}}\n\n📦 Frete grátis sujeito a disponibilidade.',
    '🎁 *PRESENTE PERFEITO* 🎁\n\n❤️✨ *{{name}}*\n\n{{shortDescription}}\n\n{{priceBlockLines}}\n\n🛍️ Compre Aqui 👇\n{{url}}\n\n⏰ Promoção sujeita a alteração sem aviso prévio.',
  ];

  // Template pool priority: global active > campaign's own template
  const templatePool: string[] =
    globalTemplates.length > 0
      ? globalTemplates.map((t) => t.content)
      : campaign.messageTemplate
        ? [campaign.messageTemplate]
        : BUILTIN_TEMPLATES;

  const pickTemplate = (): string =>
    templatePool[Math.floor(Math.random() * templatePool.length)];

  // ── Intervalo entre mensagens ─────────────────────────────────────────────
  // Usa o próprio intervalMinutes (em ms) como pausa entre cada mensagem.
  // Assim o usuário configura UM valor e ele vale tanto para o espaçamento
  // entre mensagens quanto para a frequência do ciclo completo.
  const delayBetweenMessages = campaign.intervalMinutes * 60 * 1000;

  for (const campaignProduct of campaign.products) {
    const product = campaignProduct.product;

    // ── Re-check de estado a cada produto ────────────────────────────────────
    // O job pode durar horas; verificamos se a campanha ainda está ativa e
    // se ainda estamos dentro da janela de horário antes de cada produto.
    const freshState = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { isActive: true, allowedStartTime: true, allowedEndTime: true, allowedWeekdays: true },
    });

    if (!freshState?.isActive) {
      logger.info('Campaign: loop interrompido — campanha desativada durante dispatch', { campaignId });
      return;
    }

    if (freshState.allowedStartTime && freshState.allowedEndTime) {
      const stillInWindow = isWithinTimeWindow(
        freshState.allowedStartTime,
        freshState.allowedEndTime,
        freshState.allowedWeekdays,
      );
      if (!stillInWindow) {
        logger.info('Campaign: janela de horário fechou durante dispatch, reagendando para abertura', { campaignId });
        const nextOpen = getNextWindowOpenTime(freshState.allowedStartTime, freshState.allowedWeekdays);
        const queue = getCampaignQueue();
        await queue.add('dispatch', { campaignId }, {
          delay: nextOpen.getTime() - Date.now(),
          jobId: `campaign-${campaignId}-window-${Date.now()}`,
        });
        return;
      }
    }

    for (const destination of campaign.destinations) {
      // ── DestinationConfig checks ──────────────────────────────────────────
      const config = await prisma.destinationConfig.findUnique({
        where: {
          destinationId_accountId: {
            destinationId: destination.destinationId,
            accountId: destination.accountId,
          },
        },
      });

      // Pick a random template from pool; destination customTemplate overrides everything
      let effectiveTemplate = config?.customTemplate ?? pickTemplate();

      if (config) {
        // 1. Check isActive
        if (!config.isActive) {
          logger.warn('Campaign: destino pulado — DestinationConfig está inativo (verifique Config do Grupo)', {
            campaignId,
            destinationId: destination.destinationId,
            destinationName: destination.destinationName,
          });
          continue;
        }

        // 2. Check time window (usando isWithinTimeWindow para suportar virada de meia-noite)
        if (config.allowedStartTime && config.allowedEndTime) {
          const inWindow = isWithinTimeWindow(config.allowedStartTime, config.allowedEndTime, []);
          if (!inWindow) {
            logger.info('Campaign: skipping destination outside allowed time window', {
              campaignId,
              destinationId: destination.destinationId,
              allowedStartTime: config.allowedStartTime,
              allowedEndTime: config.allowedEndTime,
            });
            continue;
          }
        }

        // 3. Check daily limit
        if (config.maxMessagesPerDay) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const stats = await prisma.destinationDailyStats.findUnique({
            where: {
              destinationConfigId_date: {
                destinationConfigId: config.id,
                date: today,
              },
            },
          });
          if ((stats?.messagesSent ?? 0) >= config.maxMessagesPerDay) {
            logger.info('Campaign: skipping destination — daily limit reached', {
              campaignId,
              destinationId: destination.destinationId,
              maxMessagesPerDay: config.maxMessagesPerDay,
            });
            continue;
          }
        }
      }

      // ── Product repeat mode check ─────────────────────────────────────────
      if (campaign.productRepeatMode !== ProductRepeatMode.ALWAYS) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const alreadySent = await prisma.messageLog.count({
          where: {
            campaignId,
            productId: product.id,
            destinationId: destination.destinationId,
            status: MessageStatus.SENT,
            ...(campaign.productRepeatMode === ProductRepeatMode.ONCE_PER_DAY && {
              sentAt: { gte: today, lt: tomorrow },
            }),
          },
        });

        if (alreadySent > 0) {
          logger.info('Campaign: skipping product — repeat policy', {
            campaignId,
            productId: product.id,
            destinationId: destination.destinationId,
            mode: campaign.productRepeatMode,
          });
          continue;
        }
      }

      // {{url}} uses affiliateUrl directly (as registered by the user)
      const message = parseTemplate(effectiveTemplate, product);

      // Create a pending log entry
      const logEntry = await prisma.messageLog.create({
        data: {
          campaignId,
          productId: product.id,
          destinationId: destination.destinationId,
          destinationType: destination.type,
          message,
          status: MessageStatus.PENDING,
        },
      });

      if (!product.imageUrl) {
        logger.warn('Campaign: produto sem imageUrl — mensagem será enviada sem foto', {
          campaignId,
          productId: product.id,
          productTitle: product.title,
        });
      }

      logger.info('Campaign: dispatch product', {
        campaignId,
        productId: product.id,
        productTitle: product.title,
        hasImage: !!product.imageUrl,
        imageUrl: product.imageUrl ?? null,
        destinationId: destination.destinationId,
        destinationType: destination.type,
      });

      try {
        const isWhatsApp =
          destination.type === DestinationType.WHATSAPP_GROUP ||
          destination.type === DestinationType.WHATSAPP_CHANNEL;

        const isTelegram =
          destination.type === DestinationType.TELEGRAM_GROUP ||
          destination.type === DestinationType.TELEGRAM_CHANNEL;

        // ── Rotação aleatória de contas ────────────────────────────────────
        // Se o destino tiver múltiplas contas configuradas, escolhe uma
        // aleatória dentre as que estão conectadas (para WhatsApp) ou
        // disponíveis (para Telegram). Isso distribui os envios entre
        // os números cadastrados, reduzindo risco de ban.
        const accountPool =
          destination.accountIds && destination.accountIds.length > 0
            ? destination.accountIds
            : [destination.accountId];

        let selectedAccountId = destination.accountId; // fallback

        if (isWhatsApp) {
          const { WhatsAppStatus } = await import('@prisma/client');
          const connectedAccounts = accountPool.filter(
            (id) => whatsappService.getClientStatus(id) === WhatsAppStatus.CONNECTED,
          );
          const pool = connectedAccounts.length > 0 ? connectedAccounts : accountPool;
          selectedAccountId = pool[Math.floor(Math.random() * pool.length)];
        } else if (isTelegram) {
          selectedAccountId = accountPool[Math.floor(Math.random() * accountPool.length)];
        }

        logger.info('Campaign: conta selecionada para envio', {
          campaignId,
          destinationId: destination.destinationId,
          selectedAccountId,
          poolSize: accountPool.length,
        });

        if (isWhatsApp) {
          await whatsappService.sendMessage(
            selectedAccountId,
            destination.destinationId,
            message,
            product.imageUrl ?? undefined,
          );
        } else if (isTelegram) {
          await telegramService.sendMessage(
            selectedAccountId,
            destination.destinationId,
            message,
            product.imageUrl ?? undefined,
          );
        }

        await prisma.messageLog.update({
          where: { id: logEntry.id },
          data: { status: MessageStatus.SENT, sentAt: new Date() },
        });

        // ── Update daily stats ──────────────────────────────────────────────
        if (config) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          await prisma.destinationDailyStats.upsert({
            where: {
              destinationConfigId_date: {
                destinationConfigId: config.id,
                date: today,
              },
            },
            create: {
              destinationConfigId: config.id,
              date: today,
              messagesSent: 1,
            },
            update: {
              messagesSent: { increment: 1 },
            },
          });
        }

        logger.info('Campaign: message sent', {
          campaignId,
          productId: product.id,
          destinationId: destination.destinationId,
        });
      } catch (error) {
        const failedReason =
          error instanceof Error ? error.message : 'Unknown error';

        await prisma.messageLog.update({
          where: { id: logEntry.id },
          data: { status: MessageStatus.FAILED, failedReason },
        });

        // Track failed count in daily stats
        if (config) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          await prisma.destinationDailyStats.upsert({
            where: {
              destinationConfigId_date: {
                destinationConfigId: config.id,
                date: today,
              },
            },
            create: {
              destinationConfigId: config.id,
              date: today,
              messagesFailed: 1,
            },
            update: {
              messagesFailed: { increment: 1 },
            },
          });
        }

        logger.error('Campaign: message failed', {
          campaignId,
          productId: product.id,
          destinationId: destination.destinationId,
          error: failedReason,
        });
      }

      // ── Aguarda o intervalo configurado antes da próxima mensagem ──────────
      // O delay é aplicado APÓS o envio, garantindo que cada mensagem seja
      // espaçada por `intervalMinutes` minutos da seguinte.
      if (delayBetweenMessages > 0) {
        logger.info('Campaign: aguardando intervalo antes da próxima mensagem', {
          campaignId,
          delayMinutes: campaign.intervalMinutes,
        });
        await new Promise((resolve) => setTimeout(resolve, delayBetweenMessages));
      }
    }
  }

  // Após o último delay do ciclo, o próximo ciclo começa em ~10s
  // (scheduleNextRun detecta que idealNextRun já passou e usa minNextRun = now+10s)
  await scheduleNextRun(campaignId, dispatchStartedAt);
};

/**
 * Schedule the next campaign dispatch based on intervalMinutes.
 * @param dispatchStartedAt - timestamp de quando o ciclo atual COMEÇOU.
 *   O próximo ciclo é agendado para (dispatchStartedAt + intervalMinutes),
 *   garantindo que o intervalo configurado seja respeitado mesmo com delay entre msgs.
 */
export const scheduleNextRun = async (campaignId: string, dispatchStartedAt?: number): Promise<void> => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      isActive: true,
      intervalMinutes: true,
      endTime: true,
      allowedStartTime: true,
      allowedEndTime: true,
      allowedWeekdays: true,
    },
  });

  if (!campaign || !campaign.isActive) {
    logger.info('Campaign: not rescheduling inactive campaign', { campaignId });
    return;
  }

  const now = new Date();

  // Check if campaign has ended
  if (campaign.endTime && now > campaign.endTime) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.COMPLETED, isActive: false },
    });
    logger.info('Campaign: completed (end time reached)', { campaignId });
    return;
  }

  // Calcula próxima execução a partir do INÍCIO do ciclo atual
  // Se o ciclo demorou mais que o intervalo, agenda para daqui 10s (não acumula atraso)
  const intervalMs = campaign.intervalMinutes * 60 * 1000;
  const cycleStart = dispatchStartedAt ?? Date.now();
  const idealNextRun = cycleStart + intervalMs;
  const minNextRun = Date.now() + 10_000; // pelo menos 10s no futuro
  let nextRunAt = new Date(Math.max(idealNextRun, minNextRun));

  // Se a próxima execução cai fora da janela, adiantamos para a abertura da janela
  if (campaign.allowedStartTime && campaign.allowedEndTime) {
    const nextInWindow = isWithinTimeWindow(
      campaign.allowedStartTime,
      campaign.allowedEndTime,
      campaign.allowedWeekdays,
    );

    if (!nextInWindow) {
      const windowOpen = getNextWindowOpenTime(
        campaign.allowedStartTime,
        campaign.allowedWeekdays,
      );
      // Usa o maior entre o intervalo normal e a abertura da próxima janela
      if (windowOpen > nextRunAt) {
        nextRunAt = windowOpen;
        logger.info('Campaign: próxima execução ajustada para abertura da janela', {
          campaignId,
          nextRunAt: nextRunAt.toISOString(),
        });
      }
    }
  }

  const delayMs = nextRunAt.getTime() - Date.now();

  const queue = getCampaignQueue();
  await queue.add('dispatch', { campaignId }, {
    delay: delayMs,
    jobId: `campaign-${campaignId}-${Date.now()}`,
  });

  // Update schedule record if exists
  await prisma.schedule.updateMany({
    where: { campaignId, isActive: true },
    data: { lastRunAt: now, nextRunAt },
  });

  logger.info('Campaign: next run scheduled', {
    campaignId,
    nextRunAt: nextRunAt.toISOString(),
    delayMinutes: campaign.intervalMinutes,
  });
};

const campaignService = {
  getCampaignQueue,
  startCampaign,
  stopCampaign,
  processCampaignJob,
  scheduleNextRun,
};

export default campaignService;
