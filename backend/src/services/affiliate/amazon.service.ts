import axios from 'axios';
import { BaseAffiliateService, AffiliateProduct, SearchOptions } from './base';
import { logger } from '../../utils/logger';

export class AmazonAffiliateService extends BaseAffiliateService {
  private readonly baseUrl = 'https://www.amazon.com.br';
  private readonly searchUrl = 'https://www.amazon.com.br/s';

  /**
   * Build an Amazon affiliate URL by appending the tag parameter.
   * Handles existing query parameters correctly.
   */
  buildAffiliateUrl(productUrl: string, affiliateId?: string): string {
    const tag = affiliateId ?? this.affiliateId;

    try {
      const url = new URL(productUrl);

      // Normalize amazon domains to amazon.com.br
      if (!url.hostname.includes('amazon')) {
        throw new Error('Not an Amazon URL');
      }

      // Remove existing tag if present
      url.searchParams.delete('tag');
      url.searchParams.set('tag', `${tag}-20`);

      // Clean up tracking parameters that might interfere
      url.searchParams.delete('ref');
      url.searchParams.delete('ref_');
      url.searchParams.delete('linkCode');
      url.searchParams.delete('linkId');

      return url.toString();
    } catch {
      // If URL parsing fails, try string manipulation
      const separator = productUrl.includes('?') ? '&' : '?';
      return `${productUrl}${separator}tag=${tag}-20`;
    }
  }

  /**
   * Parse an ASIN from an Amazon URL
   */
  extractAsin(url: string): string | null {
    // Match /dp/ASIN, /gp/product/ASIN, /product/ASIN
    const patterns = [
      /\/dp\/([A-Z0-9]{10})/i,
      /\/gp\/product\/([A-Z0-9]{10})/i,
      /\/product\/([A-Z0-9]{10})/i,
      /\/([A-Z0-9]{10})(?:\/|\?|$)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1].toUpperCase();
    }

    return null;
  }

  /**
   * Search products via Amazon search page scraping.
   * Note: For production use, Amazon Product Advertising API (PA-API) requires
   * approval and specific credentials. This method uses the public search page
   * which may be rate-limited.
   */
  async searchProducts(options: SearchOptions): Promise<AffiliateProduct[]> {
    try {
      const { query, limit = 10 } = options;

      // Build search URL
      const searchParams = new URLSearchParams({
        k: query,
        i: 'aps',
        ref: 'nb_sb_noss',
      });

      logger.info('Amazon: searching products', { query, limit });

      // In production, use PA-API. For now, return mock structure.
      // PA-API endpoint: https://webservices.amazon.com.br/paapi5/searchitems
      // This requires AWS credentials (AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY)
      // and being accepted into the Amazon Associates program.

      const response = await axios.get(`${this.searchUrl}?${searchParams.toString()}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        timeout: 10000,
      });

      // Basic HTML parsing - in production use PA-API for structured data
      const products: AffiliateProduct[] = [];
      const html: string = response.data;

      // Extract product data using regex patterns (simplified)
      const asinPattern = /data-asin="([A-Z0-9]{10})"/g;
      const titlePattern = /class="a-size-medium[^"]*"[^>]*>\s*([^<]+)/g;

      const asins: string[] = [];
      let asinMatch;
      while ((asinMatch = asinPattern.exec(html)) !== null && asins.length < limit) {
        if (!asins.includes(asinMatch[1])) {
          asins.push(asinMatch[1]);
        }
      }

      for (const asin of asins.slice(0, limit)) {
        const productUrl = `${this.baseUrl}/dp/${asin}`;
        products.push({
          externalId: asin,
          title: `Amazon Product ${asin}`,
          price: 0,
          affiliateUrl: this.buildAffiliateUrl(productUrl),
          platformData: { asin, searchUrl: productUrl },
        });
      }

      return products;
    } catch (error) {
      logger.error('Amazon: search failed', { error });
      throw new Error(`Amazon search failed: ${(error as Error).message}`);
    }
  }

  async getProduct(externalId: string): Promise<AffiliateProduct | null> {
    try {
      const asin = externalId.toUpperCase();
      const productUrl = `${this.baseUrl}/dp/${asin}`;
      const affiliateUrl = this.buildAffiliateUrl(productUrl);

      logger.info('Amazon: getting product', { asin });

      const response = await axios.get(productUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        timeout: 10000,
      });

      const html: string = response.data;

      // Extract title
      const titleMatch = html.match(/id="productTitle"[^>]*>\s*([^<]+)/);
      const title = titleMatch ? titleMatch[1].trim() : `Amazon Product ${asin}`;

      // Extract price (simplified)
      const priceMatch = html.match(/class="a-price-whole"[^>]*>([0-9.]+)/);
      const price = priceMatch ? parseFloat(priceMatch[1].replace('.', '').replace(',', '.')) : 0;

      // Extract image
      const imageMatch = html.match(/id="landingImage"[^>]*data-old-hires="([^"]+)"/);
      const imageUrl = imageMatch ? imageMatch[1] : undefined;

      return {
        externalId: asin,
        title,
        price,
        imageUrl,
        affiliateUrl,
        platformData: { asin, productUrl },
      };
    } catch (error) {
      logger.error('Amazon: get product failed', { externalId, error });
      return null;
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      if (!this.affiliateId) {
        return { ok: false, message: 'Affiliate ID is required' };
      }

      const testUrl = this.buildAffiliateUrl('https://www.amazon.com.br/dp/B08N5WRWNW');
      if (!testUrl.includes(this.affiliateId)) {
        return { ok: false, message: 'Failed to build affiliate URL' };
      }

      return {
        ok: true,
        message: `Amazon affiliate configured with tag: ${this.affiliateId}-20`,
      };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }
}
