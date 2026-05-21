import axios, { AxiosError } from 'axios';
import type {
  Platform,
  Product,
  WhatsAppAccount,
  WhatsAppGroup,
  TelegramBot,
  TelegramChat,
  Campaign,
  CampaignDestination,
  MessageLog,
  ClickLog,
  DashboardStats,
  AuthUser,
  PaginatedResponse,
  User,
  DestinationConfig,
  MessageVolumePoint,
  CampaignMetric,
  DestinationMetric,
  PlatformMetric,
  HourlyPoint,
  MetricsSummary,
  TopProduct,
} from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: AuthUser }>('/api/auth/login', { email, password });
    return res.data;
  },
  register: async (name: string, email: string, password: string) => {
    const res = await api.post<{ token: string; user: AuthUser }>('/api/auth/register', { name, email, password });
    return res.data;
  },
  me: async () => {
    const res = await api.get<AuthUser>('/api/auth/me');
    return res.data;
  },
};

// ─── Platforms ───────────────────────────────────────────────────────────────

export const platformsApi = {
  list: async () => {
    const res = await api.get<{ platforms: Platform[] }>('/api/platforms');
    return res.data.platforms ?? [];
  },
  get: async (id: string) => {
    const res = await api.get<Platform>(`/api/platforms/${id}`);
    return res.data;
  },
  create: async (data: Partial<Platform & { displayName?: string; isDefault?: boolean }>) => {
    const res = await api.post<Platform>('/api/platforms', data);
    return res.data;
  },
  update: async (id: string, data: Partial<Platform & { displayName?: string; isDefault?: boolean }>) => {
    const res = await api.put<Platform>(`/api/platforms/${id}`, data);
    return res.data;
  },
  delete: async (id: string) => {
    await api.delete(`/api/platforms/${id}`);
  },
  test: async (id: string) => {
    const res = await api.post<{ success: boolean; message: string }>(`/api/platforms/${id}/test`);
    return res.data;
  },
};

// ─── Products ────────────────────────────────────────────────────────────────

export const productsApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    platformId?: string;
    category?: string;
    isActive?: boolean;
  }) => {
    const res = await api.get<{ products: Product[]; pagination: { page: number; limit: number; total: number; pages: number } }>('/api/products', { params });
    return {
      data: res.data.products ?? [],
      total: res.data.pagination?.total ?? 0,
      page: res.data.pagination?.page ?? 1,
      limit: res.data.pagination?.limit ?? 20,
      totalPages: res.data.pagination?.pages ?? 0,
    } as PaginatedResponse<Product>;
  },
  get: async (id: string) => {
    const res = await api.get<Product>(`/api/products/${id}`);
    return res.data;
  },
  create: async (data: Omit<Product, 'id' | 'importedAt'>) => {
    const res = await api.post<Product>('/api/products', data);
    return res.data;
  },
  update: async (id: string, data: Partial<Product>) => {
    const res = await api.put<Product>(`/api/products/${id}`, data);
    return res.data;
  },
  delete: async (id: string) => {
    await api.delete(`/api/products/${id}`);
  },
  importCSV: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post<{ imported: number; errors: string[] }>('/api/products/import-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  importFromPlatform: async (platformId: string, query: string) => {
    const res = await api.post<Product[]>('/api/products/import-platform', { platformId, query });
    return res.data;
  },
};

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

export const whatsappApi = {
  list: async () => {
    const res = await api.get<{ accounts: WhatsAppAccount[] }>('/api/whatsapp');
    return res.data.accounts ?? [];
  },
  create: async (data: { name: string; phoneNumber: string }) => {
    const res = await api.post<WhatsAppAccount>('/api/whatsapp', data);
    return res.data;
  },
  delete: async (id: string) => {
    await api.delete(`/api/whatsapp/${id}`);
  },
  initialize: async (id: string) => {
    const res = await api.post<{ status: string }>(`/api/whatsapp/${id}/initialize`);
    return res.data;
  },
  getQR: async (id: string) => {
    const res = await api.get<{ qrCode: string }>(`/api/whatsapp/${id}/qr`);
    return res.data;
  },
  getGroups: async (id: string) => {
    const res = await api.get<WhatsAppGroup[]>(`/api/whatsapp/${id}/groups`);
    return res.data;
  },
  getChannels: async (id: string) => {
    const res = await api.get<WhatsAppGroup[]>(`/api/whatsapp/${id}/channels`);
    return res.data;
  },
  disconnect: async (id: string) => {
    const res = await api.post<{ status: string }>(`/api/whatsapp/${id}/disconnect`);
    return res.data;
  },
};

// ─── Telegram ─────────────────────────────────────────────────────────────────

export const telegramApi = {
  list: async () => {
    const res = await api.get<{ bots: TelegramBot[] }>('/api/telegram');
    return res.data.bots ?? [];
  },
  create: async (data: { name: string; token: string }) => {
    const res = await api.post<TelegramBot>('/api/telegram', data);
    return res.data;
  },
  delete: async (id: string) => {
    await api.delete(`/api/telegram/${id}`);
  },
  start: async (id: string) => {
    const res = await api.post<TelegramBot>(`/api/telegram/${id}/start`);
    return res.data;
  },
  stop: async (id: string) => {
    const res = await api.post<TelegramBot>(`/api/telegram/${id}/stop`);
    return res.data;
  },
  getChats: async (id: string) => {
    const res = await api.get<TelegramChat[]>(`/api/telegram/${id}/chats`);
    return res.data;
  },
};

// ─── Campaigns ────────────────────────────────────────────────────────────────

export const campaignsApi = {
  list: async () => {
    const res = await api.get<{ campaigns: Campaign[] }>('/api/campaigns');
    return res.data.campaigns ?? [];
  },
  get: async (id: string) => {
    const res = await api.get<Campaign>(`/api/campaigns/${id}`);
    return res.data;
  },
  create: async (data: Omit<Campaign, 'id' | 'createdAt' | 'destinations' | 'products'>) => {
    const res = await api.post<Campaign>('/api/campaigns', data);
    return res.data;
  },
  update: async (id: string, data: Partial<Campaign>) => {
    const res = await api.put<Campaign>(`/api/campaigns/${id}`, data);
    return res.data;
  },
  delete: async (id: string) => {
    await api.delete(`/api/campaigns/${id}`);
  },
  start: async (id: string) => {
    const res = await api.post<Campaign>(`/api/campaigns/${id}/start`);
    return res.data;
  },
  stop: async (id: string) => {
    const res = await api.post<Campaign>(`/api/campaigns/${id}/stop`);
    return res.data;
  },
  addDestination: async (id: string, data: Omit<CampaignDestination, 'id' | 'campaignId'>) => {
    const res = await api.post<CampaignDestination>(`/api/campaigns/${id}/destinations`, data);
    return res.data;
  },
  removeDestination: async (id: string, destinationId: string) => {
    await api.delete(`/api/campaigns/${id}/destinations/${destinationId}`);
  },
  addProduct: async (id: string, productId: string) => {
    const res = await api.post<Campaign>(`/api/campaigns/${id}/products`, { productId });
    return res.data;
  },
  removeProduct: async (id: string, productId: string) => {
    await api.delete(`/api/campaigns/${id}/products/${productId}`);
  },
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const [statsRes, timelineRes, topRes, msgRes, campRes] = await Promise.all([
      api.get<{ stats: { totalProducts: number; activeCampaigns: number; messagesToday: number; totalClicks: number } }>('/api/dashboard/stats'),
      api.get<{ timeline: { date: string; clicks: number }[] }>('/api/dashboard/clicks-timeline'),
      api.get<{ products: Record<string, unknown>[] }>('/api/dashboard/top-products'),
      api.get<{ messageStats: { sent: number; failed: number; pending: number } }>('/api/dashboard/message-stats'),
      api.get<{ campaigns: Record<string, unknown>[] }>('/api/dashboard/campaign-performance'),
    ]);
    const st = statsRes.data.stats ?? {};
    return {
      totalProducts:       (st as { totalProducts?: number }).totalProducts       ?? 0,
      activeCampaigns:     (st as { activeCampaigns?: number }).activeCampaigns   ?? 0,
      messagesToday:       (st as { messagesToday?: number }).messagesToday       ?? 0,
      totalClicks:         (st as { totalClicks?: number }).totalClicks           ?? 0,
      clicksTimeline:      timelineRes.data.timeline ?? [],
      topProducts:         (topRes.data.products ?? []).map((p) => ({ product: p as unknown as Product, clicks: (p.clicks as number) ?? 0 })),
      messageStats:        msgRes.data.messageStats ?? { sent: 0, failed: 0, pending: 0 },
      campaignPerformance: (campRes.data.campaigns ?? []).map((c) => ({ campaign: c as unknown as Campaign, sent: (c.sent as number) ?? 0, clicks: (c.clicks as number) ?? 0 })),
    };
  },
};

// ─── Logs ─────────────────────────────────────────────────────────────────────

export const logsApi = {
  getMessageLogs: async (params?: {
    page?: number;
    limit?: number;
    campaignId?: string;
    status?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const res = await api.get<{ logs: MessageLog[]; pagination: { page: number; limit: number; total: number; pages: number } }>('/api/logs/messages', { params });
    return {
      data: res.data.logs ?? [],
      total: res.data.pagination?.total ?? 0,
      page: res.data.pagination?.page ?? 1,
      limit: res.data.pagination?.limit ?? 20,
      totalPages: res.data.pagination?.pages ?? 0,
    } as PaginatedResponse<MessageLog>;
  },
  getClickLogs: async (params?: {
    page?: number;
    limit?: number;
    productId?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const res = await api.get<{ logs: ClickLog[]; pagination: { page: number; limit: number; total: number; pages: number } }>('/api/logs/clicks', { params });
    return {
      data: res.data.logs ?? [],
      total: res.data.pagination?.total ?? 0,
      page: res.data.pagination?.page ?? 1,
      limit: res.data.pagination?.limit ?? 20,
      totalPages: res.data.pagination?.pages ?? 0,
    } as PaginatedResponse<ClickLog>;
  },
};

// ─── Users API ────────────────────────────────────────────────────────────────

export const usersApi = {
  list: (params?: { page?: number; limit?: number; role?: string; isActive?: boolean; search?: string }) =>
    api.get<PaginatedResponse<User>>('/api/users', { params }).then(r => r.data),
  get: (id: string) => api.get<User>(`/api/users/${id}`).then(r => r.data),
  create: (data: { name: string; email: string; password: string; role: string }) =>
    api.post<User>('/api/users', data).then(r => r.data),
  update: (id: string, data: Partial<{ name: string; email: string; role: string; isActive: boolean; password: string }>) =>
    api.put<User>(`/api/users/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/api/users/${id}`).then(r => r.data),
  toggle: (id: string) => api.patch<User>(`/api/users/${id}/toggle`).then(r => r.data),
  getMe: () => api.get<User>('/api/users/me').then(r => r.data),
  updateMe: (data: { name?: string; password?: string; currentPassword?: string }) =>
    api.put<User>('/api/users/me', data).then(r => r.data),
};

// ─── Metrics API ──────────────────────────────────────────────────────────────

export const metricsApi = {
  getVolume: (params: { startDate: string; endDate: string; granularity?: string; campaignId?: string; destinationId?: string; platformId?: string; status?: string }) =>
    api.get<MessageVolumePoint[]>('/api/metrics/volume', { params }).then(r => r.data),
  getCampaigns: (params: { startDate: string; endDate: string; campaignId?: string }) =>
    api.get<CampaignMetric[]>('/api/metrics/campaigns', { params }).then(r => r.data),
  getDestinations: (params: { startDate: string; endDate: string; accountType?: string }) =>
    api.get<DestinationMetric[]>('/api/metrics/destinations', { params }).then(r => r.data),
  getPlatforms: (params: { startDate: string; endDate: string }) =>
    api.get<PlatformMetric[]>('/api/metrics/platforms', { params }).then(r => r.data),
  getHourly: (params: { startDate: string; endDate: string; campaignId?: string }) =>
    api.get<HourlyPoint[]>('/api/metrics/hourly', { params }).then(r => r.data),
  getTopProducts: (params: { startDate: string; endDate: string; limit?: number; metric?: string }) =>
    api.get<TopProduct[]>('/api/metrics/top-products', { params }).then(r => r.data),
  getSummary: (params: { startDate: string; endDate: string }) =>
    api.get<MetricsSummary>('/api/metrics/summary', { params }).then(r => r.data),
};

// ─── Group Config API ─────────────────────────────────────────────────────────

export const groupConfigApi = {
  list: (params?: { accountId?: string }) =>
    api.get<DestinationConfig[]>('/api/group-config', { params }).then(r => r.data),
  get: (id: string) => api.get<DestinationConfig>(`/api/group-config/${id}`).then(r => r.data),
  upsert: (data: Partial<DestinationConfig>) =>
    api.post<DestinationConfig>('/api/group-config', data).then(r => r.data),
  update: (id: string, data: Partial<DestinationConfig>) =>
    api.put<DestinationConfig>(`/api/group-config/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/api/group-config/${id}`).then(r => r.data),
  getStats: (id: string) =>
    api.get<{ stats: DestinationConfig['dailyStats'] }>(`/api/group-config/${id}/stats`).then(r => r.data),
};

export default api;
