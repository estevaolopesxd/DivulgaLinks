export interface Platform {
  id: string;
  name: string;
  type: 'AMAZON' | 'MERCADO_LIVRE' | 'SHOPEE' | 'ALIEXPRESS' | 'AWIN' | 'MAGALU';
  affiliateId: string;
  apiKey?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  title: string;
  description?: string;
  price: number;
  originalPrice?: number;
  imageUrl?: string;
  affiliateUrl: string;
  trackingUrl?: string;
  category?: string;
  tags: string[];
  isActive: boolean;
  platform?: Platform;
  platformId?: string;
  importedAt: string;
  clicks?: number;
}

// Produto retornado pelo preview (antes de salvar no banco)
export interface PreviewProduct {
  externalId: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  imageUrl?: string | null;
  affiliateUrl: string;
  category?: string | null;
  sales: number;
  commissionRate: number;
  shopName?: string | null;
}

export interface WhatsAppAccount {
  id: string;
  name: string;
  phoneNumber: string;
  status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'QR_PENDING';
  qrCode?: string;
  createdAt: string;
}

export interface WhatsAppGroup {
  id: string;
  name: string;
  participantCount?: number;
  isAdmin?: boolean;
}

export interface TelegramBot {
  id: string;
  name: string;
  token: string;
  username?: string;
  status: 'INACTIVE' | 'ACTIVE';
  createdAt: string;
}

export interface TelegramChat {
  id: string;
  title: string;
  type: 'group' | 'supergroup' | 'channel';
  memberCount?: number;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  messageTemplate: string;
  intervalMinutes: number;
  delayBetweenMessages: number;
  isActive: boolean;
  platforms: string[];
  destinations?: CampaignDestination[];
  products?: Product[];
  createdAt: string;
  // Janela de horário de funcionamento
  allowedStartTime?: string;   // "HH:mm"
  allowedEndTime?: string;     // "HH:mm"
  allowedWeekdays?: number[];  // 0=Dom … 6=Sáb
  // Política de repetição de produto
  productRepeatMode?: 'ALWAYS' | 'ONCE_PER_DAY' | 'NEVER';
}

export interface CampaignDestination {
  id: string;
  campaignId: string;
  type: 'WHATSAPP_GROUP' | 'WHATSAPP_CHANNEL' | 'TELEGRAM_GROUP' | 'TELEGRAM_CHANNEL';
  destinationId: string;
  destinationName: string;
  accountId: string;
  accountIds: string[]; // pool de contas para rotação aleatória
  accountType: string;
  isActive: boolean;
}

export interface MessageLog {
  id: string;
  campaignId: string;
  campaign?: Campaign;
  productId?: string;
  product?: Product;
  destinationId: string;
  destinationType: string;
  message: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CLICKED';
  sentAt?: string;
  failedReason?: string;
  createdAt: string;
}

export interface ClickLog {
  id: string;
  productId: string;
  product?: Product;
  trackingCode: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface DashboardStats {
  totalProducts: number;
  activeCampaigns: number;
  messagesToday: number;
  totalClicks: number;
  clicksTimeline: { date: string; clicks: number }[];
  topProducts: { product: Product; clicks: number }[];
  messageStats: { sent: number; failed: number; pending: number };
  campaignPerformance: { campaign: Campaign; sent: number; clicks: number }[];
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  statusCode: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  _count?: { campaigns: number };
}

export interface DestinationConfig {
  id: string;
  destinationId: string;
  destinationType: 'WHATSAPP_GROUP' | 'WHATSAPP_CHANNEL' | 'TELEGRAM_GROUP' | 'TELEGRAM_CHANNEL';
  accountId: string;
  displayName: string;
  allowedStartTime?: string;   // "HH:mm"
  allowedEndTime?: string;     // "HH:mm"
  allowedWeekdays: number[];   // 0=Sun...6=Sat
  maxMessagesPerDay?: number;
  minIntervalMinutes?: number;
  allowedPlatformIds: string[];
  customTemplate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  dailyStats?: DestinationDailyStats[];
}

export interface DestinationDailyStats {
  id: string;
  destinationConfigId: string;
  date: string;
  messagesSent: number;
  messagesFailed: number;
  clicks: number;
}

export interface MessageVolumePoint {
  date: string;
  sent: number;
  failed: number;
  pending: number;
  total: number;
}

export interface CampaignMetric {
  id: string;
  name: string;
  sent: number;
  failed: number;
  clickRate: number;
  avgPerDay: number;
}

export interface DestinationMetric {
  destinationId: string;
  name: string;
  type: string;
  sent: number;
  failed: number;
  clicks: number;
}

export interface PlatformMetric {
  platformId: string;
  name: string;
  type: string;
  products: number;
  messagesSent: number;
  clicks: number;
}

export interface HourlyPoint {
  hour: number;
  count: number;
}

export interface MetricsSummary {
  totalSent: number;
  totalFailed: number;
  totalClicks: number;
  deliveryRate: number;
  clickRate: number;
  activeCampaigns: number;
  activeDestinations: number;
}

export interface TopProduct {
  product: Product;
  clicks: number;
  sent: number;
}

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InstagramAccount {
  id: string;
  instagramUserId: string;
  username: string;
  profilePictureUrl?: string;
  pageId?: string;
  pageName?: string;
  isActive: boolean;
  tokenExpiresAt?: string;
  createdAt: string;
}

export type InstagramMediaType = 'IMAGE' | 'REEL' | 'CAROUSEL' | 'STORY';
export type InstagramPostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';

export interface InstagramPost {
  id: string;
  accountId: string;
  account?: InstagramAccount;
  mediaType: InstagramMediaType;
  mediaUrls: string[];
  caption?: string;
  hashtags?: string;
  status: InstagramPostStatus;
  scheduledAt?: string;
  publishedAt?: string;
  igMediaId?: string;
  failedReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
