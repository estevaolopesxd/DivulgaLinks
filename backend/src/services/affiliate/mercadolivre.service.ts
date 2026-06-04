import axios, { AxiosInstance } from 'axios';
import { BaseAffiliateService, AffiliateProduct, SearchOptions } from './base';
import { logger } from '../../utils/logger';

// ── Interfaces da ML API ───────────────────────────────────────────────────

interface MLPicture {
  id: string;
  url: string;
  secure_url: string;
  size: string;
  max_size: string;
  quality: string;
}

/** Resultado básico do endpoint de busca (/sites/MLB/search) */
interface MLSearchItem {
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

/** Detalhe completo do item (/items/{id} ou multi-get /items?ids=...) */
interface MLItemDetail extends MLSearchItem {
  pictures: MLPicture[];
  description?: string;
}

interface MLSearchResponse {
  results: MLSearchItem[];
  paging: {
    total: number;
    offset: number;
    limit: number;
  };
}

/** Formato de resposta do multi-get /items?ids=... */
interface MLMultiGetEntry {
  code: number;
  body: MLItemDetail;
}

// ── Service ────────────────────────────────────────────────────────────────

export class MercadoLivreAffiliateService extends BaseAffiliateService {
  private readonly apiBase = 'https://api.mercadolibre.com';
  private readonly siteId = 'MLB'; // Brasil
  private http: AxiosInstance;

  constructor(affiliateId: string, apiKey?: string, apiSecret?: string) {
    super(affiliateId, apiKey, apiSecret);
    this.http = axios.create({
      baseURL: this.apiBase,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer': 'https://www.mercadolivre.com.br/',
        'Origin': 'https://www.mercadolivre.com.br',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    });
  }

  /**
   * Constrói a URL de afiliado usando o parâmetro oficial `matt_tool`
   * do Programa de Afiliados do Mercado Livre.
   *
   * Configure o `affiliateId` da plataforma com o valor `matt_tool`
   * gerado no painel de Afiliados ML (afiliados.mercadolivre.com.br).
   *
   * Parâmetros adicionais opcionais (matt_word, matt_source, matt_campaign)
   * podem ser adicionados via plataforma.
   */
  buildAffiliateUrl(productUrl: string, affiliateId?: string): string {
    const partner = affiliateId ?? this.affiliateId;

    try {
      const url = new URL(productUrl);
      url.searchParams.set('matt_tool', partner);
      url.searchParams.set('matt_source', 'divulgalinks');
      return url.toString();
    } catch {
      const sep = productUrl.includes('?') ? '&' : '?';
      return `${productUrl}${sep}matt_tool=${encodeURIComponent(partner)}&matt_source=divulgalinks`;
    }
  }

  /**
   * Busca produtos no catálogo ML.
   * Após a busca inicial, faz um multi-get dos detalhes para obter
   * imagens em alta qualidade (pictures[0].secure_url) em vez de
   * usar apenas o thumbnail de baixa resolução.
   */
  async searchProducts(options: SearchOptions): Promise<AffiliateProduct[]> {
    const { query, limit = 10, offset = 0, minPrice, maxPrice, sortBy } = options;

    const params: Record<string, string | number> = {
      q: query,
      site_id: this.siteId,
      limit,
      offset,
    };

    if (minPrice !== undefined && maxPrice !== undefined) {
      params['price'] = `${minPrice}-${maxPrice}`;
    } else if (minPrice !== undefined) {
      params['price'] = `${minPrice}-*`;
    } else if (maxPrice !== undefined) {
      params['price'] = `*-${maxPrice}`;
    }

    if (sortBy === 'price_asc')  params['sort'] = 'price_asc';
    if (sortBy === 'price_desc') params['sort'] = 'price_desc';

    try {
      logger.info('MercadoLivre: searching products', { query, limit, offset });

      const searchRes = await this.http.get<MLSearchResponse>('/sites/MLB/search', { params });
      const results = searchRes.data.results;

      if (results.length === 0) return [];

      // ── Multi-get de detalhes para imagens HD ──────────────────────────
      const ids = results.map((r) => r.id);
      const detailMap = await this.fetchItemDetails(ids);

      return results.map((item) => {
        const detail = detailMap.get(item.id);
        return this.mapProduct(detail ?? item);
      });
    } catch (error) {
      logger.error('MercadoLivre: search failed', { error });
      throw new Error(`MercadoLivre search failed: ${(error as Error).message}`);
    }
  }

  async getProduct(externalId: string): Promise<AffiliateProduct | null> {
    try {
      logger.info('MercadoLivre: getting product', { externalId });

      const response = await this.http.get<MLItemDetail>(`/items/${externalId}`);
      return this.mapProduct(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      logger.error('MercadoLivre: get product failed', { externalId, error });
      throw new Error(`MercadoLivre get product failed: ${(error as Error).message}`);
    }
  }

  /**
   * Multi-get de detalhes de itens (até 20 por requisição).
   * Retorna um Map<id, MLItemDetail> para lookup rápido.
   *
   * Endpoint: GET /items?ids=MLB1,MLB2,...
   * Atributos solicitados: id, title, price, original_price,
   *   thumbnail, permalink, pictures, category_id, condition
   */
  private async fetchItemDetails(ids: string[]): Promise<Map<string, MLItemDetail>> {
    const detailMap = new Map<string, MLItemDetail>();

    // ML suporta até 20 itens por multi-get
    const chunkSize = 20;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);

      try {
        const response = await this.http.get<MLMultiGetEntry[]>('/items', {
          params: {
            ids: chunk.join(','),
            attributes: 'id,title,price,original_price,thumbnail,permalink,pictures,category_id,condition',
          },
        });

        for (const entry of response.data) {
          if (entry.code === 200 && entry.body?.id) {
            detailMap.set(entry.body.id, entry.body);
          }
        }

        logger.info('MercadoLivre: item details fetched', {
          requested: chunk.length,
          received: detailMap.size,
        });
      } catch (error) {
        // multi-get falhou — continua sem imagens HD para este chunk
        logger.warn('MercadoLivre: multi-get failed, falling back to thumbnails', {
          chunk,
          error: (error as Error).message,
        });
      }
    }

    return detailMap;
  }

  /**
   * Extrai a melhor imagem disponível de um item:
   * 1. pictures[0].secure_url  (HD, HTTPS) — preferido
   * 2. pictures[0].url         (HD, HTTP fallback)
   * 3. thumbnail com upgrade de resolução (-I → -O no sufixo)
   */
  private getBestImageUrl(item: MLSearchItem | MLItemDetail): string | undefined {
    if ('pictures' in item && Array.isArray(item.pictures) && item.pictures.length > 0) {
      const pic = item.pictures[0];
      if (pic.secure_url) return pic.secure_url;
      if (pic.url)        return pic.url;
    }

    if (item.thumbnail) {
      // O sufixo '-I.jpg' (small) pode ser substituído por '-O.jpg' (original)
      // nos thumbs que seguem o padrão D_NQ_NP_*-I.jpg
      return item.thumbnail
        .replace(/-I\.jpg$/i, '-O.jpg')
        .replace(/_I\.jpg$/i, '_O.jpg')
        .replace(/I\.jpg$/,    'O.jpg');  // compatibilidade com formato antigo
    }

    return undefined;
  }

  private mapProduct(item: MLSearchItem | MLItemDetail): AffiliateProduct {
    const tags: string[] = [];
    if (item.condition) tags.push(item.condition);

    return {
      externalId: item.id,
      title: item.title,
      price: item.price,
      originalPrice: item.original_price ?? undefined,
      imageUrl: this.getBestImageUrl(item),
      affiliateUrl: this.buildAffiliateUrl(item.permalink),
      category: item.category_id,
      tags,
      platformData: {
        mlId: item.id,
        permalink: item.permalink,
        condition: item.condition,
        pictureCount: 'pictures' in item ? (item.pictures?.length ?? 0) : 0,
      },
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await this.http.get('/sites/MLB');
      if (response.status === 200) {
        return {
          ok: true,
          message: `Mercado Livre API conectada. matt_tool (ID de Afiliado): ${this.affiliateId}`,
        };
      }
      return { ok: false, message: 'Resposta inesperada da API do Mercado Livre' };
    } catch (error) {
      return {
        ok: false,
        message: `Falha na conexão: ${(error as Error).message}`,
      };
    }
  }
}
