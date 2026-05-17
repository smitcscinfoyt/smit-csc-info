/**
 * Unsplash search proxy.
 *
 * Why a server-side proxy (instead of a frontend `.env` access key)?
 *  ─ Anything bundled into the React build (e.g. `VITE_UNSPLASH_KEY`)
 *    ships verbatim to every visitor's browser → the key is publicly
 *    visible in DevTools → instant rate-limit abuse + ToS violation.
 *  ─ Keeping the key in `process.env.UNSPLASH_ACCESS_KEY` on the
 *    Express server means the browser only ever talks to OUR origin;
 *    we attach the key here in trusted code, never in the bundle.
 *
 * Endpoints:
 *   GET /api/unsplash/search?q=&page=&per_page=
 *     → forwards the query to Unsplash's search/photos endpoint and
 *       returns a slimmed-down payload safe for direct UI rendering.
 *   GET /api/unsplash/track-download?url=
 *     → pings Unsplash's `download_location` URL — required by Unsplash's
 *       API guidelines whenever a user actually picks a photo.
 */

import { Router, type IRouter } from "express";

const router: IRouter = Router();

const UNSPLASH_API = "https://api.unsplash.com";

function getAccessKey(): string | null {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

/**
 * Tiny in-memory rate limiter.
 *
 * Why it lives here (not as global middleware): the api-server enables
 * permissive CORS for the public site, so without throttling, anyone
 * could call our /api/unsplash/* endpoints from any origin and burn the
 * shared Unsplash quota. We keep the surface small — token-bucket per
 * client IP, sliding 60-second window. No external dependencies, no
 * Redis; restarts reset the buckets which is acceptable because Unsplash
 * already enforces a hard hourly cap per access key.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30; // 30 req/min/IP across all /api/unsplash/* routes
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

// Periodic cleanup so the map doesn't grow unbounded over time.
setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(ip);
  }
}, RATE_WINDOW_MS).unref();

/**
 * `req.ip` already respects Express's `trust proxy` setting (configured
 * in app.ts to count = 1). Reading the raw `X-Forwarded-For` header
 * directly is unsafe — anyone can spoof it and effectively get an
 * unlimited number of "different IPs", bypassing the per-IP throttle
 * that protects our shared Unsplash API quota.
 */
function clientIp(req: import("express").Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/**
 * GET /api/unsplash/search
 * Query params:
 *   q          — search term (required)
 *   page       — 1-based page number (default 1)
 *   per_page   — results per page, max 30 (default 24)
 *   orientation — "landscape" | "portrait" | "squarish" (optional)
 */
router.get("/unsplash/search", async (req, res) => {
  const accessKey = getAccessKey();
  if (!accessKey) {
    return res.status(503).json({
      error: "unsplash_not_configured",
      message:
        "Unsplash integration is not configured on the server. Set UNSPLASH_ACCESS_KEY.",
    });
  }

  const rl = rateLimit(clientIp(req));
  if (!rl.ok) {
    if (rl.retryAfter) res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({
      error: "rate_limited",
      message: "Too many requests. Please slow down.",
      retryAfter: rl.retryAfter,
    });
  }

  const q = String(req.query.q ?? "").trim();
  if (!q) return res.status(400).json({ error: "missing_query" });

  const page = Math.max(1, Math.min(50, Number(req.query.page) || 1));
  const perPage = Math.max(1, Math.min(30, Number(req.query.per_page) || 24));
  const orientation = String(req.query.orientation ?? "").trim();

  const url = new URL(`${UNSPLASH_API}/search/photos`);
  url.searchParams.set("query", q);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("content_filter", "high");
  if (orientation === "landscape" || orientation === "portrait" || orientation === "squarish") {
    url.searchParams.set("orientation", orientation);
  }

  try {
    const upstream = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
    });
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
      total_pages: number;
      results: Array<{
        id: string;
        width: number;
        height: number;
        color: string | null;
        alt_description: string | null;
        description: string | null;
        urls: { thumb: string; small: string; regular: string; full: string };
        links: { html: string; download_location: string };
        user: { name: string; username: string; links: { html: string } };
      }>;
    };

    // Slim payload — strip fields we don't need on the client.
    res.json({
      total: data.total,
      total_pages: data.total_pages,
      results: data.results.map((p) => ({
        id: p.id,
        width: p.width,
        height: p.height,
        color: p.color,
        alt: p.alt_description ?? p.description ?? "",
        thumb: p.urls.thumb,
        small: p.urls.small,
        regular: p.urls.regular,
        full: p.urls.full,
        link: p.links.html,
        downloadLocation: p.links.download_location,
        photographer: {
          name: p.user.name,
          username: p.user.username,
          profile: p.user.links.html,
        },
      })),
    });
  } catch (err) {
    res.status(502).json({
      error: "fetch_failed",
      message: (err as Error).message,
    });
  }
});

/**
 * GET /api/unsplash/track-download?url=<download_location>
 * Pings Unsplash's tracking URL. Required by Unsplash API ToS whenever
 * a user actually selects an image (i.e. adds it to their canvas).
 * Returns 204 on success, never blocks the UI.
 */
router.get("/unsplash/track-download", async (req, res) => {
  const accessKey = getAccessKey();
  if (!accessKey) return res.status(204).end();

  const rl = rateLimit(clientIp(req));
  if (!rl.ok) {
    if (rl.retryAfter) res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ error: "rate_limited" });
  }

  // Strict allowlist: must be the Unsplash photo download_location URL,
  // i.e. https://api.unsplash.com/photos/<id>/download[?ixid=...].
  // This stops the endpoint being used as a generic key-backed proxy.
  const raw = String(req.query.url ?? "").trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return res.status(400).json({ error: "invalid_url" });
  }
  const isValid =
    parsed.protocol === "https:" &&
    parsed.hostname === "api.unsplash.com" &&
    /^\/photos\/[A-Za-z0-9_-]+\/download\/?$/.test(parsed.pathname);
  if (!isValid) {
    return res.status(400).json({ error: "invalid_url" });
  }

  try {
    await fetch(parsed.toString(), {
      headers: { Authorization: `Client-ID ${accessKey}` },
    });
  } catch {
    // Tracking failures must not surface to the user.
  }
  res.status(204).end();
});

export default router;
