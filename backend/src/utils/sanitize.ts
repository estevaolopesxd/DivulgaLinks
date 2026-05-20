/**
 * Utilities to mask/remove sensitive fields before sending API responses.
 * Ensures API keys, secrets, and tokens never appear in plain text in browser inspector.
 */

/** Shows first N chars + asterisks: "sk_live_abc" → "sk_l***" */
export function maskString(value: string | null | undefined, visibleChars = 4): string | null {
  if (!value) return null;
  if (value.length <= visibleChars) return '***';
  return `${value.substring(0, visibleChars)}${'*'.repeat(Math.min(value.length - visibleChars, 8))}`;
}

/** Returns true if value is set (not null/empty), without exposing it */
export function isSet(value: string | null | undefined): boolean {
  return Boolean(value && value.length > 0);
}

/** Sanitize a Platform object for API response */
export function sanitizePlatform(platform: Record<string, any>): Record<string, any> {
  return {
    ...platform,
    apiKey: platform.apiKey ? maskString(platform.apiKey, 6) : null,
    apiSecret: platform.apiSecret ? '***' : null,
    // Add a helper boolean so frontend can show "API configurada" without exposing value
    hasApiKey: isSet(platform.apiKey),
    hasApiSecret: isSet(platform.apiSecret),
  };
}

/** Sanitize a TelegramBot object - never expose the token */
export function sanitizeTelegramBot(bot: Record<string, any>): Record<string, any> {
  return {
    ...bot,
    token: bot.token ? `${maskString(bot.token, 8)}:***` : null,
    hasToken: isSet(bot.token),
  };
}

/** Sanitize WhatsAppAccount - remove QR from list responses */
export function sanitizeWhatsAppAccount(account: Record<string, any>, includeQr = false): Record<string, any> {
  const result = { ...account };
  if (!includeQr) {
    delete result.qrCode;
  }
  return result;
}

/** Strip password from user objects */
export function sanitizeUser(user: Record<string, any>): Record<string, any> {
  const { password, ...safe } = user;
  return safe;
}
