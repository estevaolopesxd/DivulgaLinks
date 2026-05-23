import axios from 'axios';
import { Queue } from 'bullmq';
import { InstagramPostStatus, InstagramMediaType } from '@prisma/client';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

const QUEUE_NAME = 'instagram-publish';
const GRAPH_BASE = 'https://graph.facebook.com/v20.0';

// ── Singleton queue ───────────────────────────────────────────────────────────

let _queue: Queue | null = null;

export const getInstagramQueue = (): Queue => {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: redis });
  }
  return _queue;
};

// ── OAuth helpers ─────────────────────────────────────────────────────────────

export const getAuthUrl = (): string => {
  const appId = process.env.INSTAGRAM_APP_ID ?? '';
  const redirectUri = encodeURIComponent(process.env.INSTAGRAM_REDIRECT_URI ?? 'http://localhost:7654/instagram/callback');
  const scope = 'instagram_basic,instagram_content_publish,pages_show_list,business_management';
  return `https://www.facebook.com/v20.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;
};

export const exchangeCodeForToken = async (code: string): Promise<string> => {
  const res = await axios.post<{ access_token: string }>(
    `${GRAPH_BASE}/oauth/access_token`,
    null,
    {
      params: {
        client_id: process.env.INSTAGRAM_APP_ID,
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
        code,
      },
    },
  );
  return res.data.access_token;
};

export const getLongLivedToken = async (
  shortToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> => {
  const res = await axios.get<{ access_token: string; expires_in: number }>(
    `${GRAPH_BASE}/oauth/access_token`,
    {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.INSTAGRAM_APP_ID,
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        fb_exchange_token: shortToken,
      },
    },
  );
  const expiresAt = new Date(Date.now() + (res.data.expires_in ?? 5184000) * 1000);
  return { accessToken: res.data.access_token, expiresAt };
};

export const getInstagramAccountFromToken = async (
  longToken: string,
): Promise<{ igUserId: string; username: string; profilePictureUrl: string; pageId: string; pageName: string }> => {
  // 1. Get Facebook Pages
  const pagesRes = await axios.get<{ data: Array<{ id: string; name: string }> }>(
    `${GRAPH_BASE}/me/accounts`,
    { params: { access_token: longToken } },
  );

  const pages = pagesRes.data.data ?? [];
  if (pages.length === 0) {
    throw new Error('Nenhuma página do Facebook encontrada. Certifique-se de que sua conta está conectada a uma página.');
  }

  // Use first page (or loop to find one with IG)
  let igUserId = '';
  let pageId = '';
  let pageName = '';

  for (const page of pages) {
    try {
      const igRes = await axios.get<{ instagram_business_account?: { id: string } }>(
        `${GRAPH_BASE}/${page.id}`,
        { params: { fields: 'instagram_business_account', access_token: longToken } },
      );
      if (igRes.data.instagram_business_account?.id) {
        igUserId = igRes.data.instagram_business_account.id;
        pageId = page.id;
        pageName = page.name;
        break;
      }
    } catch {
      // Skip this page and try next
    }
  }

  if (!igUserId) {
    throw new Error('Nenhuma conta Instagram Business encontrada. Conecte sua conta do Instagram à sua página do Facebook.');
  }

  // 2. Get IG profile info
  const profileRes = await axios.get<{ id: string; username: string; profile_picture_url?: string }>(
    `${GRAPH_BASE}/${igUserId}`,
    { params: { fields: 'id,username,profile_picture_url', access_token: longToken } },
  );

  return {
    igUserId,
    username: profileRes.data.username,
    profilePictureUrl: profileRes.data.profile_picture_url ?? '',
    pageId,
    pageName,
  };
};

// ── Account management ────────────────────────────────────────────────────────

export const connectAccount = async (code: string) => {
  const shortToken = await exchangeCodeForToken(code);
  const { accessToken, expiresAt } = await getLongLivedToken(shortToken);
  const { igUserId, username, profilePictureUrl, pageId, pageName } =
    await getInstagramAccountFromToken(accessToken);

  const account = await prisma.instagramAccount.upsert({
    where: { instagramUserId: igUserId },
    update: {
      username,
      accessToken,
      tokenExpiresAt: expiresAt,
      profilePictureUrl: profilePictureUrl || null,
      pageId,
      pageName,
      isActive: true,
    },
    create: {
      instagramUserId: igUserId,
      username,
      accessToken,
      tokenExpiresAt: expiresAt,
      profilePictureUrl: profilePictureUrl || null,
      pageId,
      pageName,
      isActive: true,
    },
  });

  logger.info('Instagram account connected', { igUserId, username });
  return account;
};

export const disconnectAccount = async (accountId: string): Promise<void> => {
  await prisma.instagramAccount.delete({ where: { id: accountId } });
  logger.info('Instagram account disconnected', { accountId });
};

export const listAccounts = async () => {
  return prisma.instagramAccount.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      instagramUserId: true,
      username: true,
      profilePictureUrl: true,
      pageId: true,
      pageName: true,
      isActive: true,
      tokenExpiresAt: true,
      createdAt: true,
      // Never return accessToken
    },
  });
};

// ── Post management ───────────────────────────────────────────────────────────

export interface CreatePostData {
  accountId: string;
  mediaType: InstagramMediaType;
  mediaUrls: string[];
  caption?: string;
  hashtags?: string;
  scheduledAt?: Date | null;
}

export const createPost = async (data: CreatePostData) => {
  const status: InstagramPostStatus = data.scheduledAt
    ? InstagramPostStatus.SCHEDULED
    : InstagramPostStatus.DRAFT;

  const post = await prisma.instagramPost.create({
    data: {
      accountId: data.accountId,
      mediaType: data.mediaType,
      mediaUrls: data.mediaUrls,
      caption: data.caption,
      hashtags: data.hashtags,
      status,
      scheduledAt: data.scheduledAt ?? null,
    },
    include: { account: { select: { id: true, username: true, profilePictureUrl: true } } },
  });

  if (data.scheduledAt) {
    const delay = data.scheduledAt.getTime() - Date.now();
    if (delay > 0) {
      const queue = getInstagramQueue();
      await queue.add(
        'publish',
        { postId: post.id },
        { delay, jobId: `post-${post.id}` },
      );
      logger.info('Instagram post scheduled', { postId: post.id, scheduledAt: data.scheduledAt });
    }
  }

  return post;
};

export const updatePost = async (
  id: string,
  data: Partial<CreatePostData>,
) => {
  const existing = await prisma.instagramPost.findUnique({ where: { id } });
  if (!existing) throw new Error('Post não encontrado');

  const newStatus =
    data.scheduledAt !== undefined
      ? data.scheduledAt
        ? InstagramPostStatus.SCHEDULED
        : InstagramPostStatus.DRAFT
      : undefined;

  const post = await prisma.instagramPost.update({
    where: { id },
    data: {
      ...(data.accountId && { accountId: data.accountId }),
      ...(data.mediaType && { mediaType: data.mediaType }),
      ...(data.mediaUrls && { mediaUrls: data.mediaUrls }),
      ...(data.caption !== undefined && { caption: data.caption }),
      ...(data.hashtags !== undefined && { hashtags: data.hashtags }),
      ...(data.scheduledAt !== undefined && { scheduledAt: data.scheduledAt }),
      ...(newStatus && { status: newStatus }),
    },
    include: { account: { select: { id: true, username: true, profilePictureUrl: true } } },
  });

  // Reschedule if scheduledAt changed
  if (data.scheduledAt !== undefined) {
    const queue = getInstagramQueue();
    // Remove old job
    try {
      const oldJob = await queue.getJob(`post-${id}`);
      if (oldJob) await oldJob.remove();
    } catch { /* ignore */ }

    if (data.scheduledAt) {
      const delay = data.scheduledAt.getTime() - Date.now();
      if (delay > 0) {
        await queue.add(
          'publish',
          { postId: id },
          { delay, jobId: `post-${id}` },
        );
      }
    }
  }

  return post;
};

export const deletePost = async (id: string): Promise<void> => {
  // Cancel scheduled job if any
  try {
    const queue = getInstagramQueue();
    const job = await queue.getJob(`post-${id}`);
    if (job) await job.remove();
  } catch { /* ignore */ }

  await prisma.instagramPost.delete({ where: { id } });
};

export const listPosts = async (params: {
  accountId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) => {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const skip = (page - 1) * limit;

  const where = {
    ...(params.accountId && { accountId: params.accountId }),
    ...(params.status && { status: params.status as InstagramPostStatus }),
  };

  const [posts, total] = await Promise.all([
    prisma.instagramPost.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        account: {
          select: { id: true, username: true, profilePictureUrl: true },
        },
      },
    }),
    prisma.instagramPost.count({ where }),
  ]);

  return { posts, total };
};

export const getPost = async (id: string) => {
  return prisma.instagramPost.findUnique({
    where: { id },
    include: {
      account: {
        select: { id: true, username: true, profilePictureUrl: true },
      },
    },
  });
};

// ── Publishing logic ──────────────────────────────────────────────────────────

const pollVideoStatus = async (
  creationId: string,
  accessToken: string,
  maxAttempts = 12,
  intervalMs = 10_000,
): Promise<void> => {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await axios.get<{ status_code: string }>(
      `${GRAPH_BASE}/${creationId}`,
      { params: { fields: 'status_code', access_token: accessToken } },
    );
    const statusCode = res.data.status_code;
    logger.debug('Instagram video poll', { creationId, statusCode, attempt: i + 1 });
    if (statusCode === 'FINISHED') return;
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw new Error(`Video processing failed with status: ${statusCode}`);
    }
  }
  throw new Error('Video processing timed out after 2 minutes');
};

export const publishPost = async (postId: string): Promise<void> => {
  const post = await prisma.instagramPost.findUnique({
    where: { id: postId },
    include: { account: true },
  });

  if (!post) {
    logger.error('Instagram publishPost: post not found', { postId });
    return;
  }

  if (!post.account) {
    await prisma.instagramPost.update({
      where: { id: postId },
      data: { status: InstagramPostStatus.FAILED, failedReason: 'Conta não encontrada' },
    });
    return;
  }

  // Mark as PUBLISHING
  await prisma.instagramPost.update({
    where: { id: postId },
    data: { status: InstagramPostStatus.PUBLISHING },
  });

  const { account } = post;
  const token = account.accessToken;
  const igUserId = account.instagramUserId;

  try {
    let creationId: string;
    const captionText = [post.caption, post.hashtags].filter(Boolean).join('\n\n');

    if (post.mediaType === InstagramMediaType.IMAGE || post.mediaType === InstagramMediaType.STORY) {
      const mediaType = post.mediaType === InstagramMediaType.STORY ? 'STORIES' : 'IMAGE';
      const res = await axios.post<{ id: string }>(
        `${GRAPH_BASE}/${igUserId}/media`,
        {
          image_url: post.mediaUrls[0],
          caption: captionText || undefined,
          media_type: mediaType,
          access_token: token,
        },
      );
      creationId = res.data.id;
    } else if (post.mediaType === InstagramMediaType.REEL) {
      const res = await axios.post<{ id: string }>(
        `${GRAPH_BASE}/${igUserId}/media`,
        {
          video_url: post.mediaUrls[0],
          caption: captionText || undefined,
          media_type: 'REELS',
          access_token: token,
        },
      );
      creationId = res.data.id;
      // Poll until video is processed
      await pollVideoStatus(creationId, token);
    } else if (post.mediaType === InstagramMediaType.CAROUSEL) {
      // Create child containers first
      const childIds: string[] = [];
      for (const url of post.mediaUrls) {
        const childRes = await axios.post<{ id: string }>(
          `${GRAPH_BASE}/${igUserId}/media`,
          {
            image_url: url,
            is_carousel_item: true,
            access_token: token,
          },
        );
        childIds.push(childRes.data.id);
      }

      const containerRes = await axios.post<{ id: string }>(
        `${GRAPH_BASE}/${igUserId}/media`,
        {
          media_type: 'CAROUSEL',
          caption: captionText || undefined,
          children: childIds,
          access_token: token,
        },
      );
      creationId = containerRes.data.id;
    } else {
      throw new Error(`Unsupported media type: ${post.mediaType}`);
    }

    // Publish the container
    const publishRes = await axios.post<{ id: string }>(
      `${GRAPH_BASE}/${igUserId}/media_publish`,
      {
        creation_id: creationId,
        access_token: token,
      },
    );

    await prisma.instagramPost.update({
      where: { id: postId },
      data: {
        status: InstagramPostStatus.PUBLISHED,
        igMediaId: publishRes.data.id,
        publishedAt: new Date(),
        failedReason: null,
      },
    });

    logger.info('Instagram post published', { postId, igMediaId: publishRes.data.id });
  } catch (error) {
    const failedReason =
      error instanceof Error ? error.message : 'Unknown error during publishing';

    logger.error('Instagram publishPost error', { postId, error: failedReason });

    await prisma.instagramPost.update({
      where: { id: postId },
      data: {
        status: InstagramPostStatus.FAILED,
        failedReason,
      },
    });

    throw error;
  }
};
