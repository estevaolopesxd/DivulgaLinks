import axios from 'axios';
import { createHmac } from 'crypto';
import { BaseAffiliateService, AffiliateProduct, SearchOptions } from './base';
import { logger } from '../../utils/logger';

export class ShopeeAffiliateService extends BaseAffiliateService {
  private readonly affiliateBaseUrl = 'https://shope.ee';
  private readonly apiBase = 'https://open-api.affiliate.shopee.com.br/graphql';

  /**
   * Build a Shopee affiliate tracking URL.
   * Shopee affiliate links use their short URL format with the affiliate ID embedded.
   */
  buildAffiliateUrl(productUrl: string, affiliateId?: string): string {
    const affId = affiliateId ?? this.affiliateId;

    try {
      const url = new URL(productUrl);

      // Add affiliate parameters
      url.searchParams.set('af_id', affId);
      url.searchParams.set('offer_id', '12');
      url.searchParams.set('source', 'divulgalinks');

      // If it's already a shortened Shopee URL, just append params
      if (url.hostname === 'shope.ee' || url.hostname === 's.shopee.com.br') {
        return url.toString();
      }

      return url.toString();
    } catch {
      const separator = productUrl.includes('?') ? '&' : '?';
      return `${productUrl}${separator}af_id=${affId}&offer_id=12`;
    }
  }

  /**
   * Extract shop ID and item ID from a Shopee product URL.
   * URL pattern: https://shopee.com.br/product/SHOP_ID/ITEM_ID
   * or: https://shopee.com.br/PRODUCT-TITLE-i.SHOP_ID.ITEM_ID
   */
  extractProductIds(url: string): { shopId: string; itemId: string } | null {
    // Pattern: /product/SHOP_ID/ITEM_ID
    const pattern1 = /\/product\/(\d+)\/(\d+)/;
    const match1 = url.match(pattern1);
    if (match1) return { shopId: match1[1], itemId: match1[2] };

    // Pattern: -i.SHOP_ID.ITEM_ID
    const pattern2 = /-i\.(\d+)\.(\d+)/;
    const match2 = url.match(pattern2);
    if (match2) return { shopId: match2[1], itemId: match2[2] };

    return null;
  }

  /**
   * Gera o header Authorization com HMAC-SHA256 para a API Oficial da Shopee Affiliates.
   * Formato: SHA256 Hmac appid={appId},timestamp={ts},sign={hmac}
   * Assinatura: HMAC-SHA256(appSecret, appId + timestamp + "/graphql" + body)
   */
  private buildAuthHeader(body: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const appId = this.affiliateId;
    const secret = this.apiKey;
    const message = `${appId}${timestamp}/graphql${body}`;
    const sign = createHmac('sha256', secret).update(message).digest('hex');
    return `SHA256 Hmac appid=${appId},timestamp=${timestamp},sign=${sign}`;
  }

  async searchProducts(options: SearchOptions): Promise<AffiliateProduct[]> {
    const { query, limit = 10 } = options;
    logger.info('Shopee: searching products', { query, limit });

    if (!this.apiKey) {
      logger.warn('Shopee: API key not configured, trying public search');
      return this.publicSearch(query, limit);
    }

    const graphqlQuery = `
      query SearchProducts($keyword: String!, $limit: Int!) {
        productOfferV2(
          listType: 0
          sortType: 2
          keyword: $keyword
          limit: $limit
        ) {
          nodes {
            itemId
            shopId
            productName
            commissionRate
            priceMin
            priceMax
            imageLink
            productLink
            shopName
            sales
          }
        }
      }
    `;

    const body = JSON.stringify({ query: graphqlQuery, variables: { keyword: query, limit } });

    try {
      const response = await axios.post(this.apiBase, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.buildAuthHeader(body),
          'X-Shopee-Language': 'pt-BR',
        },
        timeout: 15000,
      });

      const nodes = response.data?.data?.productOfferV2?.nodes ?? [];

      if (nodes.length === 0) {
        logger.warn('Shopee API: nenhum resultado', { query });
        return [];
      }

      return nodes.map((item: any) => ({
        externalId: `${item.shopId}_${item.itemId}`,
        title: item.productName,
        price: item.priceMin ?? 0,
        originalPrice: item.priceMax && item.priceMax > item.priceMin ? item.priceMax : undefined,
        imageUrl: item.imageLink ?? undefined,
        affiliateUrl: item.productLink
          ? this.buildAffiliateUrl(item.productLink)
          : this.buildAffiliateUrl(`https://shopee.com.br/product/${item.shopId}/${item.itemId}`),
        platformData: {
          shopId: item.shopId,
          itemId: item.itemId,
          commissionRate: item.commissionRate,
          sales: item.sales,
          shopName: item.shopName,
        },
      }));
    } catch (error: any) {
      const msg = error?.response?.data?.errors?.[0]?.message ?? error.message;
      logger.error('Shopee API: erro na busca', { query, error: msg });
      throw new Error(`Shopee API: ${msg}`);
    }
  }

  private async publicSearch(query: string, limit: number): Promise<AffiliateProduct[]> {
    const endpoints = [
      // Endpoint v4 com parâmetros completos
      {
        url: 'https://shopee.com.br/api/v4/search/search_items',
        params: {
          by: 'relevancy', keyword: query, limit, newest: 0,
          order: 'desc', page_type: 'search',
          scenario: 'PAGE_GLOBAL_SEARCH', version: 2, shopv: 2,
        },
      },
      // Endpoint alternativo usado pelo app mobile
      {
        url: 'https://shopee.com.br/api/v4/search/search_items',
        params: {
          by: 'relevancy', keyword: query, limit, newest: 0,
          order: 'desc', page_type: 'search', version: 2,
        },
      },
    ];

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'Referer': `https://shopee.com.br/search?keyword=${encodeURIComponent(query)}`,
      'X-API-SOURCE': 'pc',
      'X-Shopee-Language': 'pt-BR',
      'if-none-match-': '',
    };

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(endpoint.url, {
          params: endpoint.params,
          headers,
          timeout: 12000,
        });

        const items = response.data?.items ?? [];
        if (items.length === 0) continue;

        logger.info('Shopee: public search success', { query, count: items.length });

        return items.slice(0, limit).map((item: any) => {
          const data = item.item_basic ?? item;
          const shopId = data.shopid ?? item.shopid;
          const itemId = data.itemid ?? item.itemid;
          const productUrl = `https://shopee.com.br/product/${shopId}/${itemId}`;
          const image = data.image ?? item.image;
          const price = data.price ?? item.price ?? 0;
          const priceBefore = data.price_before_discount ?? item.price_before_discount;
          return {
            externalId: `${shopId}_${itemId}`,
            title: data.name ?? item.name,
            price: price / 100000,
            originalPrice: priceBefore ? priceBefore / 100000 : undefined,
            imageUrl: image ? `https://cf.shopee.com.br/file/${image}` : undefined,
            affiliateUrl: this.buildAffiliateUrl(productUrl),
            platformData: { shopId, itemId },
          };
        });
      } catch (error) {
        logger.warn('Shopee: endpoint failed, trying next', { url: endpoint.url, error: (error as Error).message });
      }
    }

    logger.error('Shopee: all public search endpoints failed — API key required', { query });
    return [];
  }

  async getProduct(externalId: string): Promise<AffiliateProduct | null> {
    try {
      const [shopId, itemId] = externalId.split('_');
      if (!shopId || !itemId) return null;

      logger.info('Shopee: getting product', { shopId, itemId });

      const response = await axios.get('https://shopee.com.br/api/v4/item/get', {
        params: { shopid: shopId, itemid: itemId },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://shopee.com.br/',
        },
        timeout: 10000,
      });

      const item = response.data?.item;
      if (!item) return null;

      const productUrl = `https://shopee.com.br/product/${shopId}/${itemId}`;
      return {
        externalId,
        title: item.name,
        description: item.description,
        price: (item.price ?? 0) / 100000,
        originalPrice: item.price_before_discount
          ? item.price_before_discount / 100000
          : undefined,
        imageUrl: item.image ? `https://cf.shopee.com.br/file/${item.image}` : undefined,
        affiliateUrl: this.buildAffiliateUrl(productUrl),
        category: item.categories?.[0]?.display_name,
        platformData: { shopId, itemId },
      };
    } catch (error) {
      logger.error('Shopee: get product failed', { externalId, error });
      return null;
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      if (!this.affiliateId) {
        return { ok: false, message: 'Affiliate ID is required' };
      }

      const testUrl = this.buildAffiliateUrl('https://shopee.com.br/product/123/456');
      if (!testUrl.includes(this.affiliateId)) {
        return { ok: false, message: 'Failed to build affiliate URL' };
      }

      return {
        ok: true,
        message: `Shopee affiliate configured. ID: ${this.affiliateId}`,
      };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }
}
