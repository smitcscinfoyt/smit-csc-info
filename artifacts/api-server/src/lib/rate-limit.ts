import type { Request } from "express";

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/**
 * Creates an in-memory sliding-window rate limiter instance.
 * Automatically cleans up expired keys to prevent memory leaks.
 */
export function createRateLimiter(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 30;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(key);
    }
  }, windowMs).unref();

  return function check(key: string, customMax?: number): { ok: boolean; retryAfter?: number } {
    const limit = customMax ?? max;
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true };
    }
    if (b.count >= limit) {
      return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
    }
    b.count += 1;
    return { ok: true };
  };
}
