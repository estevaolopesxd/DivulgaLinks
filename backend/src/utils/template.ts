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
 * Generates a "display original price" when the product has no originalPrice set.
 * Returns a value ~25–50% higher than the current price, rounded to a natural
 * Brazilian retail price ending (e.g. R$ 79,90 instead of R$ 81,35).
 *
 * The multiplier scales down as prices get higher so the fake discount
 * looks realistic across all price ranges.
 */
const computeDisplayOriginalPrice = (price: number): number => {
  let factor: number;
  if (price < 20)       factor = 1.50;
  else if (price < 50)  factor = 1.42;
  else if (price < 100) factor = 1.35;
  else if (price < 300) factor = 1.30;
  else                  factor = 1.25;

  const raw = price * factor;
  // Round to the nearest R$ 10, then subtract R$ 0,10 to get a .90 ending.
  // e.g. R$ 60 * 1.35 = 81 → round to 80 → R$ 79,90
  const rounded = Math.round(raw / 10) * 10;
  const result = rounded - 0.10;
  // Safety: never return a value less than or equal to the current price
  return result > price ? result : Math.ceil(price * 1.25 / 10) * 10 - 0.10;
};

/**
 * Parse and replace template variables with product data.
 *
 * Available variables:
 *  {{name}}             - product title
 *  {{description}}      - product description
 *  {{price}}            - formatted current price in BRL  (ex: R$ 51,90)
 *  {{priceRaw}}         - current price numbers only      (ex: 51,90)
 *  {{originalPrice}}    - formatted "de" price in BRL (ex: R$ 79,90).
 *                         Uses product.originalPrice when set; otherwise a computed
 *                         display price ~25–50% above the current price.
 *  {{originalPriceRaw}} - "de" price numbers only (ex: 79,90)
 *  {{original_price}}   - alias for {{originalPrice}}
 *  {{priceBlock}}       - "De ~~R$ X~~ por *R$ Y*" — always shows a discount
 *  {{priceBlockLines}}  - two-line version: "de: R$ X\n💰 Por: *R$ Y*" — always shows a discount
 *  {{url}}              - affiliate URL cadastrado pelo usuário (campo affiliateUrl)
 *  {{link}}             - alias for {{url}}
 *  {{trackingUrl}}      - URL de rastreamento de cliques (se gerada); cai back para affiliateUrl
 *  {{image}}            - image URL
 *  {{category}}         - product category
 *  {{discount}}         - discount percentage (ex: 35%) — always present
 */
export const parseTemplate = (template: string, product: Product): string => {
  const price = formatBRL(product.price);

  // ── Effective original price ──────────────────────────────────────────────
  // Use the real originalPrice when it exists and is greater than current price.
  // Otherwise compute a display price to always show a "De X por Y" discount.
  const effectiveOriginal =
    product.originalPrice && product.originalPrice > product.price
      ? product.originalPrice
      : computeDisplayOriginalPrice(product.price);

  const originalPrice = formatBRL(effectiveOriginal);

  const pct = Math.round(((effectiveOriginal - product.price) / effectiveOriginal) * 100);
  const discount = `${pct}%`;

  // Raw numeric price strings (no currency symbol)
  const priceRaw = product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const originalPriceRaw = effectiveOriginal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Short description — first 120 chars (no mid-word cut), ideal for post size limits
  const fullDesc = product.description ?? '';
  const shortDescription = fullDesc.length > 120
    ? fullDesc.substring(0, fullDesc.lastIndexOf(' ', 120) || 120) + '…'
    : fullDesc;

  // Smart price block — always shows discount (effectiveOriginal is always > price)

  // Style A: strikethrough (WhatsApp Markdown)
  //   "De ~~R$ 79,90~~ por *R$ 43,99*"
  const priceBlock = `De ~~${originalPrice}~~ por *${price}*`;

  // Style B: two-line clean format
  //   "de: R$ 79,90\n💰 Por: *R$ 43,99*"
  const priceBlockLines = `de: ${originalPrice}\n💰 Por: *${price}*`;

  const replacements: Record<string, string> = {
    '{{name}}': product.title,
    '{{title}}': product.title,
    '{{description}}': product.description ?? '',
    '{{shortDescription}}': shortDescription,
    '{{price}}': price,
    '{{priceRaw}}': priceRaw,
    '{{original_price}}': originalPrice,
    '{{originalPrice}}': originalPrice,
    '{{originalPriceRaw}}': originalPriceRaw,
    '{{priceBlock}}': priceBlock,
    '{{priceBlockLines}}': priceBlockLines,
    // {{url}} e {{link}} usam SEMPRE o affiliateUrl cadastrado pelo usuário
    '{{url}}': product.affiliateUrl,
    '{{link}}': product.affiliateUrl,
    // {{trackingUrl}} disponível opcionalmente para quem quiser rastrear cliques
    '{{trackingUrl}}': product.trackingUrl ?? product.affiliateUrl,
    '{{image}}': product.imageUrl ?? '',
    '{{category}}': product.category ?? '',
    '{{discount}}': discount,
  };

  let result = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.split(placeholder).join(value);
  }

  // ── Post-processing: fix legacy template issues ─────────────────────────
  // 1. Double currency symbol: "R$ R$ 79,90" → "R$ 79,90"
  //    Happens when template was "R$ {{price}}" and {{price}} already includes "R$"
  result = result.replace(/R\$\s+R\$/g, 'R$');

  // 2. Clean up multiple consecutive blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
};

export default parseTemplate;
