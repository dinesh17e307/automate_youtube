import { logger } from '../../utils/logger';

export function isQuotaOrRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: string }).code).toLowerCase()
    : '';

  return (
    code === 'insufficient_quota' ||
    message.includes('insufficient_quota') ||
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('429')
  );
}

export function logProviderFallback(provider: string, label: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (isQuotaOrRateLimitError(error)) {
    logger.warn(`${provider} ${label} hit quota/rate limit, using fallback`, { message });
    return;
  }
  logger.error(`${provider} ${label} failed, using fallback`, error);
}
