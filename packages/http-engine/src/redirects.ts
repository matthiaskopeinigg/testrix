import type { HttpRedirectHop } from '@testrix/contracts';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

export function resolveRedirectUrl(currentUrl: string, location: string | undefined): string | null {
  const target = location?.trim();
  if (!target)
    return null;
  try {
    return new URL(target, currentUrl).toString();
  } catch {
    return null;
  }
}

export function redirectMethod(status: number, method: string): string {
  if (status === 303)
    return 'GET';
  if ((status === 301 || status === 302) && method !== 'GET' && method !== 'HEAD')
    return 'GET';
  return method;
}

export function redirectHop(status: number, url: string, location: string, durationMs = 0): HttpRedirectHop {
  return { status, url, location, durationMs };
}
