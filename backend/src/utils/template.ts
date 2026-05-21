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
 *  {{name}}             - product title
 *  {{description}}      - product description
 *  {{price}}            - formatted current price in BRL  (ex: R$ 51,90)
 *  {{priceRaw}}         - current price numbers only      (ex: 51,90)
 *  {{originalPrice}}    - formatted original price in BRL (ex: R$ 79,90) — empty if not set
 *  {{originalPriceRaw}} - original price numbers only     (ex: 79,90) — empty if not set
 *  {{original_price}}   - alias for {{originalPrice}}
 *  {{priceBlock}}       - smart block: "De ~~R$ X~~ por *R$ Y*" or just "*R$ Y*" if no original
 *  {{url}}              - affiliate URL cadastrado pelo usuário (campo affiliateUrl)
 *  {{link}}             - alias for {{url}}
 *  {{trackingUrl}}      - URL de rastreamento de cliques (se gerada); cai back para affiliateUrl
 *  {{image}}            - image URL
 *  {{category}}         - product category
 *  {{discount}}         - discount percentage (ex: 35%) — empty if no original price
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

  // Raw numeric price strings (no currency symbol)
  const priceRaw = product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const originalPriceRaw = product.originalPrice
    ? product.originalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  // Short description — first 120 chars (no mid-word cut), ideal for post size limits
  const fullDesc = product.description ?? '';
  const shortDescription = fullDesc.length > 120
    ? fullDesc.substring(0, fullDesc.lastIndexOf(' ', 120) || 120) + '…'
    : fullDesc;

  // Smart price block — two styles:

  // Style A: strikethrough (WhatsApp Markdown)
  //   With original:  "De ~~R$ 79,98~~ por *R$ 43,99*"
  //   Without:        "*R$ 43,99*"
  const priceBlock =
    product.originalPrice && product.originalPrice > product.price
      ? `De ~~${originalPrice}~~ por *${price}*`
      : `*${price}*`;

  // Style B: two-line clean format (no strikethrough)
  //   With original:  "de: R$ 79,98\n💰 Por: R$ 43,99"
  //   Without:        "💰 Por: R$ 43,99"
  const priceBlockLines =
    product.originalPrice && product.originalPrice > product.price
      ? `de: ${originalPrice}\n💰 Por: *${price}*`
      : `💰 Por: *${price}*`;

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

  // 2. Remove "De ~~R$ ~~ por " block when originalPrice was empty.
  //    Pattern only removes the block when content inside ~~ is purely empty/R$+spaces.
  //    Does NOT remove when there's actual price text like "R$ 79,90" inside.
  result = result.replace(/De\s+~~(R\$)?\s*~~\s+por\s+/gi, '');

  // 3. Any remaining completely empty strikethrough: "~~~~" → ""
  result = result.replace(/~~\s*~~/g, '');

  // 4. Clean up multiple consecutive blank lines that can appear after removals
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
};

export default parseTemplate;
