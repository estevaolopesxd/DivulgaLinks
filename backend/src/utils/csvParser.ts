import csvParser from 'csv-parser';
import { Readable } from 'stream';

export interface ParsedProduct {
  title: string;
  description?: string;
  price: number;
  originalPrice?: number;
  imageUrl?: string;
  affiliateUrl: string;
  category?: string;
  tags: string[];
}

export interface CSVParseResult {
  products: ParsedProduct[];
  errors: { row: number; message: string }[];
  detectedFormat?: string;
}

// ─── Column name aliases ──────────────────────────────────────────────────────
// Lists ordered by priority. First non-empty match wins.
const ALIASES: Record<keyof ParsedProduct | 'externalId', string[]> = {
  title: [
    // Shopee
    'Item Name', 'Product Name', 'Nome do Produto', 'Nome do produto',
    // Generic
    'title', 'name', 'produto', 'Título', 'titulo',
  ],
  description: [
    'Description', 'Descrição', 'descricao',
    'description', 'desc', 'Details',
  ],
  price: [
    // Shopee
    'Selling Price', 'Item Price', 'Sale Price', 'Current Price',
    // Generic
    'price', 'Price', 'Preço', 'preco', 'valor', 'Valor',
  ],
  originalPrice: [
    'Original Price', 'Market Price', 'List Price', 'Regular Price',
    'originalPrice', 'original_price', 'Preço Original', 'preco_original',
  ],
  imageUrl: [
    // Shopee
    'Main Image URL', 'Thumbnail URL', 'Image URL', 'Main Product Image URL',
    'Product Image URL', 'Cover Image',
    // Generic
    'imageUrl', 'image_url', 'image', 'foto', 'imagem', 'Image',
  ],
  affiliateUrl: [
    // Shopee
    'Affiliate URL', 'Product URL', 'Product Link', 'Shop Link',
    'Deep Link', 'Offer URL',
    // Generic
    'affiliateUrl', 'affiliate_url', 'url', 'URL', 'link', 'Link',
    'Product Page URL',
  ],
  category: [
    'Category', 'Categoria', 'category', 'Product Category', 'Type',
  ],
  tags: [
    'Tags', 'tags', 'Keywords', 'keywords', 'Labels',
  ],
  externalId: [
    // Shopee
    'Item ID', 'Product ID', 'SKU', 'SKU Reference No.',
    'Seller SKU', 'Model SKU',
    // Generic
    'externalId', 'external_id', 'id', 'sku',
  ],
};

/**
 * Given a row object (keys = CSV column names) and an alias list,
 * return the first non-empty value found.
 */
const pick = (row: Record<string, string>, aliases: string[]): string => {
  for (const alias of aliases) {
    const val = row[alias];
    if (val !== undefined && val.trim() !== '') {
      return val.trim();
    }
  }
  return '';
};

/**
 * Detect which platform format the CSV is from, for informational purposes.
 */
const detectFormat = (headers: string[]): string => {
  const h = headers.map((x) => x.toLowerCase());
  if (h.some((x) => x.includes('shopee') || x === 'item name' || x === 'item id')) return 'Shopee';
  if (h.some((x) => x.includes('amazon') || x === 'asin')) return 'Amazon';
  if (h.some((x) => x.includes('mercado') || x === 'mlb')) return 'Mercado Livre';
  return 'Genérico';
};

/**
 * Parse a CSV buffer into product objects.
 *
 * Supports:
 *  - Shopee affiliate export (Item Name, Affiliate URL, Item Price, …)
 *  - Generic CSVs with columns: title/name, price, affiliateUrl/url, etc.
 *  - Semicolon-separated CSVs (auto-detected)
 */
export const parseProductsCSV = (buffer: Buffer): Promise<CSVParseResult> => {
  return new Promise((resolve) => {
    const products: ParsedProduct[] = [];
    const errors: { row: number; message: string }[] = [];
    let rowIndex = 0;
    let detectedFormat = 'Genérico';
    let headersRead = false;

    // Detect delimiter: if first line has more semicolons than commas, use semicolon
    const firstLine = buffer.toString('utf-8').split('\n')[0] ?? '';
    const separator = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

    const stream = Readable.from(buffer);

    stream
      .pipe(
        csvParser({
          separator,
          // Do NOT provide a headers array — let csv-parser read them from the file
          mapHeaders: ({ header }) => header.trim(),
        }),
      )
      .on('headers', (hdrs: string[]) => {
        headersRead = true;
        detectedFormat = detectFormat(hdrs);
      })
      .on('data', (row: Record<string, string>) => {
        rowIndex++;

        const title = pick(row, ALIASES.title);
        const affiliateUrl = pick(row, ALIASES.affiliateUrl);
        const priceStr = pick(row, ALIASES.price);

        if (!title) {
          errors.push({ row: rowIndex, message: `Linha ${rowIndex}: campo "título" não encontrado (verificar coluna "Item Name" ou "title")` });
          return;
        }

        if (!affiliateUrl) {
          errors.push({ row: rowIndex, message: `Linha ${rowIndex}: campo "URL afiliado" não encontrado (verificar coluna "Affiliate URL" ou "url")` });
          return;
        }

        if (!priceStr) {
          errors.push({ row: rowIndex, message: `Linha ${rowIndex}: campo "preço" não encontrado` });
          return;
        }

        // Price: handle "44.90", "44,90", "R$ 44,90", "44.90 BRL" etc.
        const priceClean = priceStr.replace(/[^\d.,]/g, '').replace(',', '.');
        const price = parseFloat(priceClean);
        if (isNaN(price) || price <= 0) {
          errors.push({ row: rowIndex, message: `Linha ${rowIndex}: preço inválido "${priceStr}"` });
          return;
        }

        const origStr = pick(row, ALIASES.originalPrice);
        let originalPrice: number | undefined;
        if (origStr) {
          const origClean = origStr.replace(/[^\d.,]/g, '').replace(',', '.');
          const parsed = parseFloat(origClean);
          if (!isNaN(parsed) && parsed > 0) {
            originalPrice = parsed;
          }
        }

        const tagsStr = pick(row, ALIASES.tags);
        const tags = tagsStr
          ? tagsStr.split(/[,;]/).map((t) => t.trim()).filter(Boolean)
          : [];

        products.push({
          title,
          description: pick(row, ALIASES.description) || undefined,
          price,
          originalPrice,
          imageUrl: pick(row, ALIASES.imageUrl) || undefined,
          affiliateUrl,
          category: pick(row, ALIASES.category) || undefined,
          tags,
        });
      })
      .on('error', (err) => {
        errors.push({ row: rowIndex, message: `Erro no CSV: ${err.message}` });
        resolve({ products, errors, detectedFormat });
      })
      .on('end', () => {
        if (!headersRead && rowIndex === 0) {
          errors.push({ row: 0, message: 'CSV vazio ou sem cabeçalho' });
        }
        resolve({ products, errors, detectedFormat });
      });
  });
};

export default parseProductsCSV;
