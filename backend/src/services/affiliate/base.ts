export interface AffiliateProduct {
  externalId: string;
  title: string;
  description?: string;
  price: number;
  originalPrice?: number;
  imageUrl?: string;
  affiliateUrl: string;
  category?: string;
  tags?: string[];
  platformData?: Record<string, unknown>;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'relevance';
}

export abstract class BaseAffiliateService {
  protected affiliateId: string;
  protected apiKey?: string;
  protected apiSecret?: string;

  constructor(affiliateId: string, apiKey?: string, apiSecret?: string) {
    this.affiliateId = affiliateId;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  /**
   * Search for products matching the given query
   */
  abstract searchProducts(options: SearchOptions): Promise<AffiliateProduct[]>;

  /**
   * Get a single product by its platform-specific ID
   */
  abstract getProduct(externalId: string): Promise<AffiliateProduct | null>;

  /**
   * Build an affiliate URL for the given product URL
   */
  abstract buildAffiliateUrl(productUrl: string, affiliateId?: string): string;

  /**
   * Test the connection / credentials
   */
  abstract testConnection(): Promise<{ ok: boolean; message: string }>;
}
