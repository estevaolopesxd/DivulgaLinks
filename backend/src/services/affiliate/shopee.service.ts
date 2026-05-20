import axios from 'axios';
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

  async searchProducts(options: SearchOptions): Promise<AffiliateProduct[]> {
    try {
      const { query, limit = 10 } = options;
      logger.info('Shopee: searching products', { query, limit });

      // Shopee Affiliate API uses GraphQL
      // Requires approved affiliate account and API credentials
      if (!this.apiKey) {
        logger.warn('Shopee: API key not provided, using public search');
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
              title: productName
              commissionRate
              price
              imageUrl: imageLink
              productLink
              shopName
              sales
            }
          }
        }
      `;

      const response = await axios.post(
        this.apiBase,
        { query: graphqlQuery, variables: { keyword: query, limit } },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        },
      );

      const nodes = response.data?.data?.productOfferV2?.nodes ?? [];
      return nodes.map((item: any) => ({
        externalId: `${item.shopId}_${item.itemId}`,
        title: item.title,
        price: item.price,
        imageUrl: item.imageUrl,
        affiliateUrl: this.buildAffiliateUrl(item.productLink),
        platformData: {
          shopId: item.shopId,
          itemId: item.itemId,
          commissionRate: item.commissionRate,
          sales: item.sales,
        },
      }));
    } catch (error) {
      logger.error('Shopee: search failed', { error });
      throw new Error(`Shopee search failed: ${(error as Error).message}`);
    }
  }

  private async publicSearch(query: string, limit: number): Promise<AffiliateProduct[]> {
    // Fallback using Shopee public search endpoint
    try {
      const response = await axios.get('https://shopee.com.br/api/v4/search/search_items', {
        params: {
          by: 'relevancy',
          keyword: query,
          limit,
          newest: 0,
          order: 'desc',
          page_type: 'search',
          scenario: 'PAGE_GLOBAL_SEARCH',
          version: 2,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://shopee.com.br/',
          'X-API-SOURCE': 'pc',
        },
        timeout: 10000,
      });

      const items = response.data?.items ?? [];
      return items.slice(0, limit).map((item: any) => {
        const shopId = item.shopid;
        const itemId = item.itemid;
        const productUrl = `https://shopee.com.br/product/${shopId}/${itemId}`;
        return {
          externalId: `${shopId}_${itemId}`,
          title: item.name,
          price: (item.price ?? 0) / 100000,
          originalPrice: item.price_before_discount
            ? item.price_before_discount / 100000
            : undefined,
          imageUrl: item.image
            ? `https://cf.shopee.com.br/file/${item.image}`
            : undefined,
          affiliateUrl: this.buildAffiliateUrl(productUrl),
          platformData: { shopId, itemId },
        };
      });
    } catch (error) {
      logger.error('Shopee: public search failed', { error });
      return [];
    }
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
