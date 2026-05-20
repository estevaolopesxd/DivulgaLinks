import { Product } from '@prisma/client';

/**
 * Format a number as Brazilian Real (BRL) currency string
 */
export const formatBRL = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

/**
 * Parse and replace template variables with product data.
 *
 * Available variables:
 *  {{name}}           - product title
 *  {{description}}    - product description
 *  {{price}}          - formatted current price in BRL
 *  {{original_price}} - formatted original price in BRL (or empty string)
 *  {{url}}            - tracking URL (falls back to affiliateUrl)
 *  {{image}}          - image URL
 *  {{category}}       - product category
 *  {{discount}}       - discount percentage (if originalPrice > price)
 */
export const parseTemplate = (template: string, product: Product): string => {
  const price = formatBRL(product.price);
  const originalPrice = product.originalPrice ? formatBRL(product.originalPrice) : '';

  let discount = '';
  if (product.originalPrice && product.originalPrice > product.price) {
    const pct = Math.round(
      ((product.originalPrice - product.price) / product.originalPrice) * 100,
    );
    discount = `${pct}%`;
  }

  const replacements: Record<string, string> = {
    '{{name}}': product.title,
    '{{title}}': product.title,
    '{{description}}': product.description ?? '',
    '{{price}}': price,
    '{{original_price}}': originalPrice,
    '{{url}}': product.trackingUrl ?? product.affiliateUrl,
    '{{link}}': product.trackingUrl ?? product.affiliateUrl,
    '{{image}}': product.imageUrl ?? '',
    '{{category}}': product.category ?? '',
    '{{discount}}': discount,
  };

  let result = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    // Replace all occurrences, case-insensitive
    result = result.split(placeholder).join(value);
  }

  return result;
};

export default parseTemplate;
