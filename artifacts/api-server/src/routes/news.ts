/**
 * News proxy + cache for the "Latest Updates" tab on /documents.
 *
 * Strategy:
 *   - Frontend hits GET /api/news/latest. We always serve from the
 *     PostgreSQL `news_cache` table — never block on the upstream call.
 *   - On every request, we check the most-recent `fetched_at`. If it's
 *     older than REFRESH_INTERVAL_MS (3 hours) and no in-flight refresh
 *     is running, we kick off a background refresh against newsapi.ai
 *     (Event Registry) and immediately return the current DB rows.
 *   - This is "lazy refresh": no separate cron / scheduler process,
 *     and the user never waits on the upstream API. Token usage is
 *     bounded to ~8 calls/day.
 *
 * Language fallback: gujarati → hindi → english.
 */

import { Router, type IRouter } from "express";
import { db, newsCacheTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

const NEWSAPI_AI_URL = "https://eventregistry.org/api/v1/article/getArticles";
const REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours
const UPSTREAM_TIMEOUT_MS = 10_000; // 10s per language attempt
const EMPTY_CACHE_WAIT_MS = 3_000; // bounded first-load wait

function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function safeDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
// Mix of English topical keywords (newsapi.ai indexes Gujarati publishers
// even on English keywords) AND native-script keywords to catch Gujarati
// publisher articles that lack English tagging. Broad coverage of Gujarat
// state, Indian central government, agriculture and welfare topics so the
// "ગુજરાતી only" feed has enough volume.
// newsapi.ai trial tier allows max 15 keywords per query — keep this list
// at or below 15. Mix of Gujarati script (catches native publishers like
// Divya Bhaskar / Sandesh / Gujarat Samachar) and English topical terms.
// IMPORTANT: newsapi.ai counts WORDS, not phrases — "ગુજરાત સરકાર" = 2 keywords.
// Trial cap is 15 words total. Keep entries to single-word tokens only.
const KEYWORDS = [
  "ગુજરાત",
  "ખેડૂત",
  "યોજના",
  "સહાય",
  "મુખ્યમંત્રી",
  "પ્રધાનમંત્રી",
  "ગાંધીનગર",
  "કૃષિ",
  "મોદી",
  "i-Khedut",
  "PM-KISAN",
  "Gujarat",
  "Khedut",
  "Krishi",
  "Modi",
];
// Gujarati only — per user request, no Hindi/English fallback.
const LANG_FALLBACK = ["guj"] as const;
const PER_LANG_FETCH = 50;
const MAX_ARTICLES = 60;

let refreshInFlight: Promise<void> | null = null;

function getApiKey(): string | null {
  const key = process.env.NEWSAPI_AI_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

type EventRegistryArticle = {
  uri?: string;
  url?: string;
  title?: string;
  body?: string;
  image?: string;
  source?: { title?: string; uri?: string };
  dateTime?: string;
  date?: string;
  lang?: string;
};

type EventRegistryResponse = {
  articles?: {
    results?: EventRegistryArticle[];
    totalResults?: number;
  };
  error?: string;
};

async function fetchArticlesForLang(
  apiKey: string,
  lang: string,
): Promise<EventRegistryArticle[]> {
  const body = {
    action: "getArticles",
    keyword: KEYWORDS,
    keywordOper: "or",
    lang: [lang],
    articlesPage: 1,
    articlesCount: PER_LANG_FETCH,
    articlesSortBy: "date",
    articlesSortByAsc: false,
    dataType: ["news"],
    forceMaxDataTimeWindow: 31,
    resultType: "articles",
    apiKey,
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(NEWSAPI_AI_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`newsapi.ai HTTP ${res.status}`);
    }
    const json = (await res.json()) as EventRegistryResponse;
    if (json.error) throw new Error(`newsapi.ai error: ${json.error}`);
    return json.articles?.results ?? [];
  } finally {
    clearTimeout(timer);
  }
}

function normalize(a: EventRegistryArticle, lang: string) {
  const url = safeUrl(a.url ?? "");
  const title = (a.title ?? "").trim().slice(0, 500);
  if (!url || !title) return null;
  const fullBody = (a.body ?? "").trim().replace(/\s+/g, " ");
  const description = fullBody.slice(0, 600);
  const body = fullBody.slice(0, 20_000); // safety cap, store full article
  const source = (a.source?.title ?? "").trim().slice(0, 200) || null;
  const publishedAt = safeDate(a.dateTime) ?? safeDate(a.date);
  const imageUrl = safeUrl(a.image ?? "");
  return {
    title,
    description: description || null,
    body: body || null,
    imageUrl,
    url,
    source,
    language: lang,
    publishedAt,
  };
}

async function runRefresh(reqLog: import("pino").Logger): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    reqLog.warn("news refresh skipped — NEWSAPI_AI_KEY not set");
    return;
  }
  // Fetch all 3 languages in parallel and combine — gives the user a
  // richer mix instead of stopping at the first language with any hit.
  const perLang: Array<{ lang: string; got: EventRegistryArticle[] }> =
    await Promise.all(
      LANG_FALLBACK.map(async (lang) => {
        try {
          const got = await fetchArticlesForLang(apiKey, lang);
          return { lang, got };
        } catch (err) {
          reqLog.warn({ err, lang }, "news fetch failed for language");
          return { lang, got: [] as EventRegistryArticle[] };
        }
      }),
    );
  const seen = new Set<string>();
  const rows: NonNullable<ReturnType<typeof normalize>>[] = [];
  for (const { lang, got } of perLang) {
    for (const a of got) {
      const n = normalize(a, lang);
      if (!n) continue;
      if (seen.has(n.url)) continue;
      seen.add(n.url);
      rows.push(n);
    }
  }
  if (rows.length === 0) {
    reqLog.warn("news refresh produced 0 articles across all languages");
    return;
  }
  // Upsert by URL — keep history fresh, update fetched_at on existing rows.
  for (const r of rows) {
    try {
      await db
        .insert(newsCacheTable)
        .values({ ...r, fetchedAt: new Date() })
        .onConflictDoUpdate({
          target: newsCacheTable.url,
          set: {
            title: r.title,
            description: r.description,
            body: r.body,
            imageUrl: r.imageUrl,
            source: r.source,
            language: r.language,
            publishedAt: r.publishedAt,
            fetchedAt: new Date(),
          },
        });
    } catch (err) {
      reqLog.warn({ err, url: r.url }, "news upsert failed");
    }
  }
  // Defensive cleanup: drop any non-Gujarati rows left over from previous
  // multi-language feed versions. Gujarati-only is the current product spec.
  await db.execute(sql`DELETE FROM news_cache WHERE language <> 'guj'`);
  // Trim to most recent 100 rows (cheap to keep, but bounded).
  await db.execute(sql`
    DELETE FROM news_cache
    WHERE id NOT IN (
      SELECT id FROM news_cache
      ORDER BY published_at DESC NULLS LAST, fetched_at DESC
      LIMIT 100
    )
  `);
  reqLog.info(
    {
      count: rows.length,
      langs: perLang.map((p) => `${p.lang}:${p.got.length}`).join(","),
    },
    "news cache refreshed",
  );
}

function maybeKickRefresh(
  reqLog: import("pino").Logger,
  lastFetchedAt: Date | null,
): void {
  const now = Date.now();
  const stale =
    !lastFetchedAt || now - lastFetchedAt.getTime() > REFRESH_INTERVAL_MS;
  if (!stale) return;
  if (refreshInFlight) return;
  refreshInFlight = runRefresh(reqLog)
    .catch((err) => {
      reqLog.error({ err }, "news refresh crashed");
    })
    .finally(() => {
      refreshInFlight = null;
    });
}

router.get("/news/latest", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(newsCacheTable)
      .where(eq(newsCacheTable.language, "guj"))
      .orderBy(desc(newsCacheTable.publishedAt), desc(newsCacheTable.fetchedAt))
      .limit(MAX_ARTICLES);

    const lastFetched = rows.reduce<Date | null>((acc, r) => {
      if (!r.fetchedAt) return acc;
      return !acc || r.fetchedAt > acc ? r.fetchedAt : acc;
    }, null);

    maybeKickRefresh(req.log, lastFetched);

    // If the cache is empty AND no key is set, return a clear 503 so the
    // frontend can render a helpful message instead of an empty grid.
    if (rows.length === 0 && !getApiKey()) {
      return res.status(503).json({
        error: "News service is not yet configured. Please try again later.",
        code: "news_not_configured",
      });
    }

    // If empty AND a refresh is in flight, await it briefly (bounded) so
    // first-time users don't see a blank tab. If the upstream is slow,
    // bail out and return refreshing:true so the client can poll.
    if (rows.length === 0 && refreshInFlight) {
      const settled = await Promise.race([
        refreshInFlight.then(() => true),
        new Promise<boolean>((r) =>
          setTimeout(() => r(false), EMPTY_CACHE_WAIT_MS),
        ),
      ]);
      if (settled) {
        const filled = await db
          .select()
          .from(newsCacheTable)
          .where(eq(newsCacheTable.language, "guj"))
          .orderBy(
            desc(newsCacheTable.publishedAt),
            desc(newsCacheTable.fetchedAt),
          )
          .limit(MAX_ARTICLES);
        return res.json({
          count: filled.length,
          lastFetchedAt:
            filled.length > 0 ? filled[0]?.fetchedAt ?? null : null,
          articles: filled,
          refreshing: false,
        });
      }
      return res.json({
        count: 0,
        lastFetchedAt: null,
        articles: [],
        refreshing: true,
      });
    }

    return res.json({
      count: rows.length,
      lastFetchedAt: lastFetched,
      articles: rows,
    });
  } catch (err) {
    req.log.error({ err }, "GET /news/latest failed");
    return res
      .status(500)
      .json({ error: "internal_error", message: (err as Error).message });
  }
});

router.get("/news/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "invalid_id" });
  }
  try {
    const rows = await db
      .select()
      .from(newsCacheTable)
      .where(eq(newsCacheTable.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    return res.json({ article: row });
  } catch (err) {
    req.log.error({ err, id }, "GET /news/:id failed");
    return res
      .status(500)
      .json({ error: "internal_error", message: (err as Error).message });
  }
});

export default router;
