/**
 * Pixabay search proxy.
 *
 * Same security rationale as routes/unsplash.ts: never put PIXABAY_API_KEY
 * in a frontend env var because Vite bundles them into the public JS.
 * All Pixabay traffic goes through this server-side proxy with our key.
 *
 * Endpoint:
 *   GET /api/pixabay/search?q=&page=&per_page=&image_type=
 *     - image_type: "photo" | "illustration" | "vector" | "all" (default: "all")
 *     - We slim Pixabay's payload to a shape that mirrors our Unsplash
 *       proxy so the frontend can interleave both feeds with one type.
 *
 * Pixabay docs: https://pixabay.com/api/docs/
 */

import { Router, type IRouter } from "express";

const router: IRouter = Router();

const PIXABAY_API = "https://pixabay.com/api/";

function getApiKey(): string | null {
  const key = process.env.PIXABAY_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

// Per-IP token-bucket — same shape as the Unsplash limiter. Pixabay's
// hard limit is 100 req/60s per API key (default tier), so 30 req/min
// per IP keeps us well within budget while preventing single-client abuse.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true };
  }
  if (b.count >= RATE_MAX) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of buckets) if (b.resetAt <= now) buckets.delete(ip);
}, RATE_WINDOW_MS).unref();

/**
 * Pull the real client IP for rate-limit bucketing.
 *
 * `req.ip` already respects Express's `trust proxy` setting (configured
 * in app.ts to count = 1). Reading the raw `X-Forwarded-For` header
 * directly is unsafe — anyone can put whatever they like in it and
 * effectively get an unlimited number of "different IPs", bypassing the
 * per-IP throttle that protects our shared Pixabay API quota.
 */
function clientIp(req: import("express").Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

const ALLOWED_TYPES = new Set(["photo", "illustration", "vector", "all"]);

router.get("/pixabay/search", async (req, res) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(503).json({
      error: "pixabay_not_configured",
      message:
        "Pixabay integration is not configured on the server. Set PIXABAY_API_KEY.",
    });
  }

  const rl = rateLimit(clientIp(req));
  if (!rl.ok) {
    if (rl.retryAfter) res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ error: "rate_limited", retryAfter: rl.retryAfter });
  }

  const q = String(req.query.q ?? "").trim();
  if (!q) return res.status(400).json({ error: "missing_query" });

  const page = Math.max(1, Math.min(50, Number(req.query.page) || 1));
  const perPage = Math.max(3, Math.min(50, Number(req.query.per_page) || 24));
  const rawType = String(req.query.image_type ?? "all").trim();
  const imageType = ALLOWED_TYPES.has(rawType) ? rawType : "all";

  const url = new URL(PIXABAY_API);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", q);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("image_type", imageType);
  url.searchParams.set("safesearch", "true");

  try {
    const upstream = await fetch(url.toString());
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return res.status(upstream.status).json({
        error: "upstream_error",
        status: upstream.status,
        details: text.slice(0, 500),
      });
    }
    const data = (await upstream.json()) as {
      total: number;
      totalHits: number;
      hits: Array<{
        id: number;
        pageURL: string;
        type: string;
        tags: string;
        previewURL: string;
        previewWidth: number;
        previewHeight: number;
        webformatURL: string;
        webformatWidth: number;
        webformatHeight: number;
        largeImageURL: string;
        imageWidth: number;
        imageHeight: number;
        user: string;
        userImageURL: string;
      }>;
    };

    // Slim payload — and crucially, name the fields the same as the
    // Unsplash proxy so the frontend can treat them as a single
    // `MediaPhoto` shape.
    res.json({
      total: data.totalHits,
      total_pages: Math.ceil(data.totalHits / perPage),
      results: data.hits.map((h) => ({
        id: `pixabay-${h.id}`,
        source: "pixabay" as const,
        width: h.imageWidth,
        height: h.imageHeight,
        color: null,
        alt: h.tags,
        thumb: h.previewURL,
        small: h.webformatURL,
        regular: h.webformatURL,
        full: h.largeImageURL,
        link: h.pageURL,
        // Pixabay does not require a tracking ping like Unsplash, but
        // keeping the field present makes the union type with Unsplash
        // results trivial on the client.
        downloadLocation: null,
        photographer: {
          name: h.user,
          username: h.user,
          profile: h.pageURL,
        },
      })),
    });
  } catch (err) {
    res.status(502).json({ error: "fetch_failed", message: (err as Error).message });
  }
});

export default router;
