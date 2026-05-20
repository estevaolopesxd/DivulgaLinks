import axios, { AxiosInstance } from 'axios';
import { BaseAffiliateService, AffiliateProduct, SearchOptions } from './base';
import { logger } from '../../utils/logger';

interface MLProduct {
  id: string;
  title: string;
  price: number;
  original_price?: number;
  thumbnail: string;
  permalink: string;
  category_id?: string;
  condition?: string;
  attributes?: Array<{ id: string; name: string; value_name: string }>;
}

interface MLSearchResponse {
  results: MLProduct[];
  paging: {
    total: number;
    offset: number;
    limit: number;
  };
}

export class MercadoLivreAffiliateService extends BaseAffiliateService {
  private readonly apiBase = 'https://api.mercadolibre.com';
  private readonly siteId = 'MLB'; // Brazil
  private http: AxiosInstance;

  constructor(affiliateId: string, apiKey?: string, apiSecret?: string) {
    super(affiliateId, apiKey, apiSecret);
    this.http = axios.create({
      baseURL: this.apiBase,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    });
  }

  buildAffiliateUrl(productUrl: string, affiliateId?: string): string {
    const partner = affiliateId ?? this.affiliateId;

    try {
      const url = new URL(productUrl);
      url.searchParams.set('deal_print_id', partner);
      url.searchParams.set('partner_id', 'divulgalinks');
      return url.toString();
    } catch {
      const separator = productUrl.includes('?') ? '&' : '?';
      return `${productUrl}${separator}deal_print_id=${partner}`;
    }
  }

  async searchProducts(options: SearchOptions): Promise<AffiliateProduct[]> {
    try {
      const { query, limit = 10, offset = 0, minPrice, maxPrice } = options;

      const params: Record<string, string | number> = {
        q: query,
        site_id: this.siteId,
        limit,
        offset,
      };

      if (minPrice !== undefined) params['price'] = `${minPrice}-*`;
      if (maxPrice !== undefined) params['price'] = `*-${maxPrice}`;
      if (minPrice !== undefined && maxPrice !== undefined) {
        params['price'] = `${minPrice}-${maxPrice}`;
      }

      logger.info('MercadoLivre: searching products', { query, limit });

      const response = await this.http.get<MLSearchResponse>('/sites/MLB/search', {
        params,
      });

      return response.data.results.map((item) => this.mapProduct(item));
    } catch (error) {
      logger.error('MercadoLivre: search failed', { error });
      throw new Error(`MercadoLivre search failed: ${(error as Error).message}`);
    }
  }

  async getProduct(externalId: string): Promise<AffiliateProduct | null> {
    try {
      logger.info('MercadoLivre: getting product', { externalId });

      const response = await this.http.get<MLProduct>(`/items/${externalId}`);
      return this.mapProduct(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      logger.error('MercadoLivre: get product failed', { externalId, error });
      throw new Error(`MercadoLivre get product failed: ${(error as Error).message}`);
    }
  }

  private mapProduct(item: MLProduct): AffiliateProduct {
    const tags: string[] = [];
    if (item.condition) tags.push(item.condition);

    return {
      externalId: item.id,
      title: item.title,
      price: item.price,
      originalPrice: item.original_price ?? undefined,
      imageUrl: item.thumbnail?.replace('I.jpg', 'O.jpg'), // Get larger image
      affiliateUrl: this.buildAffiliateUrl(item.permalink),
      category: item.category_id,
      tags,
      platformData: {
        mlId: item.id,
        permalink: item.permalink,
        condition: item.condition,
      },
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await this.http.get('/sites/MLB');
      if (response.status === 200) {
        return {
          ok: true,
          message: `MercadoLivre API connected. Affiliate ID: ${this.affiliateId}`,
        };
      }
      return { ok: false, message: 'Unexpected response from MercadoLivre API' };
    } catch (error) {
      return {
        ok: false,
        message: `Connection failed: ${(error as Error).message}`,
      };
    }
  }
}
