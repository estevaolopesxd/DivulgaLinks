import { env } from '../config/env';
import { logger } from './logger';

let _warned = false;

/**
 * Returns the public-facing base URL for tracking links.
 * Priority: PUBLIC_URL env var → FRONTEND_URL env var
 *
 * Set PUBLIC_URL in Easypanel to your actual domain, e.g.:
 *   PUBLIC_URL=https://divulgalinks.meudominio.com.br
 */
export const getPublicUrl = (): string => {
  const url = env.PUBLIC_URL ?? env.FRONTEND_URL;

  if (!_warned && (url.includes('localhost') || url.includes('127.0.0.1'))) {
    logger.warn(
      'PUBLIC_URL / FRONTEND_URL está apontando para localhost. ' +
      'Os links de rastreamento vão usar localhost e não funcionarão de fora da rede. ' +
      'Defina a variável PUBLIC_URL no backend com a URL pública do seu app.',
    );
    _warned = true;
  }

  return url;
};
