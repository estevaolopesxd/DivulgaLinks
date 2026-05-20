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
}

/**
 * Parse a CSV buffer into an array of product objects.
 * Expected headers: title, description, price, originalPrice, imageUrl, affiliateUrl, category, tags
 * The `tags` column should be a comma-separated list inside the cell, e.g. "eletronico,promoção"
 */
export const parseProductsCSV = (buffer: Buffer): Promise<CSVParseResult> => {
  return new Promise((resolve) => {
    const products: ParsedProduct[] = [];
    const errors: { row: number; message: string }[] = [];
    let rowIndex = 1;

    const stream = Readable.from(buffer);

    stream
      .pipe(
        csvParser({
          headers: [
            'title',
            'description',
            'price',
            'originalPrice',
            'imageUrl',
            'affiliateUrl',
            'category',
            'tags',
          ],
          skipComments: true,
          skipLines: 1, // skip header row
        }),
      )
      .on('data', (row: Record<string, string>) => {
        rowIndex++;

        // Validate required fields
        if (!row.title || row.title.trim() === '') {
          errors.push({ row: rowIndex, message: 'Missing required field: title' });
          return;
        }

        if (!row.affiliateUrl || row.affiliateUrl.trim() === '') {
          errors.push({ row: rowIndex, message: 'Missing required field: affiliateUrl' });
          return;
        }

        const price = parseFloat(row.price?.replace(',', '.') ?? '');
        if (isNaN(price) || price < 0) {
          errors.push({ row: rowIndex, message: `Invalid price value: "${row.price}"` });
          return;
        }

        const originalPrice = row.originalPrice
          ? parseFloat(row.originalPrice.replace(',', '.'))
          : undefined;

        const tags = row.tags
          ? row.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [];

        products.push({
          title: row.title.trim(),
          description: row.description?.trim() || undefined,
          price,
          originalPrice: originalPrice && !isNaN(originalPrice) ? originalPrice : undefined,
          imageUrl: row.imageUrl?.trim() || undefined,
          affiliateUrl: row.affiliateUrl.trim(),
          category: row.category?.trim() || undefined,
          tags,
        });
      })
      .on('error', (err) => {
        errors.push({ row: rowIndex, message: `CSV parse error: ${err.message}` });
        resolve({ products, errors });
      })
      .on('end', () => {
        resolve({ products, errors });
      });
  });
};

export default parseProductsCSV;
