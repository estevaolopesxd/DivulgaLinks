import axios from 'axios';
import { createHmac } from 'crypto';
import { BaseAffiliateService, AffiliateProduct, SearchOptions } from './base';
import { logger } from '../../utils/logger';

const BASE_URL = 'https://open-api.tiktokglobalshop.com';

export class TikTokShopAffiliateService extends BaseAffiliateService {
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly accessToken: string;
  private readonly shopCipher: string;

  constructor(affiliateId: string, apiKey?: string, apiSecret?: string, config?: Record<string, unknown>) {
    super(affiliateId, apiKey, apiSecret);
    this.appKey      = (config?.appKey      as string) ?? apiKey    ?? '';
    this.appSecret   = (config?.appSecret   as string) ?? apiSecret ?? '';
    this.accessToken = (config?.accessToken as string) ?? '';
    this.shopCipher  = (config?.shopCipher  as string) ?? '';
  }

  /**
   * Assinatura TikTok Shop:
   * HMAC-SHA256( appSecret, appSecret + path + sorted_key_value_params + body + appSecret ).toUpperCase()
   */
  private buildSign(path: string, queryParams: Record<string, string>, body: string): string {
    const sorted = Object.entries(queryParams)
      .filter(([k]) => !['sign', 'access_token', 'x-tts-access-token'].includes(k))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}${v}`)
      .join('');

    const message = `${this.appSecret}${path}${sorted}${body}${this.appSecret}`;
    return createHmac('sha256', this.appSecret).update(message).digest('hex').toUpperCase();
  }

  private buildUrl(path: string, queryParams: Record<string, string>, body: string): string {
    const sign = this.buildSign(path, queryParams, body);
    const qs = new URLSearchParams({ ...queryParams, sign }).toString();
    return `${BASE_URL}${path}?${qs}`;
  }

  buildAffiliateUrl(productUrl: string, _affiliateId?: string): string {
    // TikTok Shop rastreamento é feito automaticamente pelo access_token / creator_id
    return productUrl;
  }

  extractProductIds(_url: string) { return null; }

  async searchProducts(options: SearchOptions): Promise<AffiliateProduct[]> {
    const { query, limit = 20 } = options;

    if (!this.appKey || !this.appSecret || !this.accessToken) {
      throw new Error('TikTok Shop: configure App Key, App Secret e Access Token na plataforma.');
    }

    logger.info('TikTok Shop: buscando produtos', { query, limit });

    const version = '202409';
    const path = `/affiliate_creator/${version}/open_collaborations/products/search`;

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ keyword: query, page_size: limit });

    const queryParams: Record<string, string> = {
      app_key:    this.appKey,
      timestamp,
      ...(this.shopCipher ? { shop_cipher: this.shopCipher } : {}),
    };

    const url = this.buildUrl(path, queryParams, body);

    try {
      const response = await axios.post(url, body, {
        headers: {
          'x-tts-access-token': this.accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      const code = response.data?.code;
      if (code !== 0) {
        const msg = response.data?.message ?? `TikTok Shop error code ${code}`;
        logger.error('TikTok Shop: API error', { code, msg });
        throw new Error(`TikTok Shop: ${msg}`);
      }

      const products = response.data?.data?.products ?? [];

      return products.map((p: any) => ({
        externalId: p.product_id ?? p.id,
        title: p.product_name ?? p.title,
        price: parseFloat(p.price?.sale_price ?? p.price?.original_price ?? p.min_price ?? 0),
        originalPrice: parseFloat(p.price?.original_price ?? 0) || undefined,
        imageUrl: p.images?.[0]?.thumb_url_list?.[0] ?? p.cover_image_url ?? undefined,
        affiliateUrl: p.product_url ?? p.share_url ?? `https://www.tiktok.com/shop/product/${p.product_id}`,
        category: p.category_list?.[0]?.local_name ?? undefined,
        platformData: {
          productId: p.product_id,
          sales: p.sale_props?.sold_count ?? 0,
          commissionRate: p.commission_rate ?? p.commission?.commission_rate ?? 0,
          rating: p.rating ?? undefined,
        },
      }));
    } catch (error: any) {
      const msg = error?.response?.data?.message ?? error.message;
      logger.error('TikTok Shop: erro na busca', { query, error: msg });
      throw new Error(`TikTok Shop: ${msg}`);
    }
  }

  async getProduct(externalId: string): Promise<AffiliateProduct | null> {
    logger.warn('TikTok Shop: getProduct não implementado', { externalId });
    return null;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.appKey || !this.appSecret || !this.accessToken) {
      return { ok: false, message: 'Configure App Key, App Secret e Access Token.' };
    }
    return { ok: true, message: `TikTok Shop configurado. App Key: ${this.appKey}` };
  }
}
