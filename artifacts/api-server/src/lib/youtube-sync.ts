import { db, contentTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const YT_BASE = "https://www.googleapis.com/youtube/v3";
export const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || "UCTfpdj2mkGxE3c77J3rwIZw";
export const CHANNEL_HANDLE = "SmitCSCInfo";

interface YTResponse<T> {
  items: T[];
  nextPageToken?: string;
}

interface YTChannel {
  id: string;
  snippet: { title: string };
  contentDetails: { relatedPlaylists: { uploads: string } };
}

interface YTPlaylist {
  id: string;
  snippet: { title: string; description?: string };
}

interface YTPlaylistItem {
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    resourceId: { kind: string; videoId: string };
    thumbnails?: {
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
    };
  };
}

async function ytFetch<T>(path: string, params: Record<string, string>): Promise<YTResponse<T>> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not set in environment");
  const search = new URLSearchParams({ ...params, key: apiKey });
  const url = `${YT_BASE}/${path}?${search.toString()}`;
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`YouTube API ${path} failed: ${r.status} ${body.slice(0, 400)}`);
  }
  return (await r.json()) as YTResponse<T>;
}

async function fetchAllPages<T>(
  path: string,
  baseParams: Record<string, string>,
  cap = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const params = { ...baseParams, maxResults: "50", ...(pageToken ? { pageToken } : {}) };
    const r = await ytFetch<T>(path, params);
    out.push(...r.items);
    pageToken = r.nextPageToken;
    if (out.length >= cap) break;
  } while (pageToken);
  return out;
}

async function resolveChannel(): Promise<YTChannel> {
  // 1. Try canonical channel ID first
  try {
    const r = await ytFetch<YTChannel>("channels", {
      part: "id,snippet,contentDetails",
      id: CHANNEL_ID,
    });
    if (r.items.length > 0) return r.items[0];
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[youtube-sync] channel ID resolution failed, trying handle");
  }

  // 2. Try forHandle with and without @
  try {
    let r = await ytFetch<YTChannel>("channels", {
      part: "id,snippet,contentDetails",
      forHandle: `@${CHANNEL_HANDLE}`,
    });
    if (r.items.length > 0) return r.items[0];

    r = await ytFetch<YTChannel>("channels", {
      part: "id,snippet,contentDetails",
      forHandle: CHANNEL_HANDLE,
    });
    if (r.items.length > 0) return r.items[0];

    // 3. Fallback to forUsername
    r = await ytFetch<YTChannel>("channels", {
      part: "id,snippet,contentDetails",
      forUsername: CHANNEL_HANDLE,
    });
    if (r.items.length > 0) return r.items[0];
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[youtube-sync] handle resolution failed");
  }

  throw new Error(`YouTube channel "${CHANNEL_ID}" / "@${CHANNEL_HANDLE}" not found via API`);
}

function pickThumbnail(item: YTPlaylistItem, videoId: string): string {
  return (
    item.snippet.thumbnails?.high?.url ||
    item.snippet.thumbnails?.medium?.url ||
    item.snippet.thumbnails?.default?.url ||
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  );
}

export interface SyncResult {
  playlists: number;
  videos: number;
  inserted: number;
  updated: number;
}

function categorizeTitle(title: string): string {
  if (/યોજના|yojana|scheme|સહાય/i.test(title)) {
    return "સરકારી યોજનાઓ (Government Schemes)";
  }
  if (/ભરતી|bharti|recruitment|sevak|ojas/i.test(title)) {
    return "સરકારી ભરતી (Recruitment)";
  }
  if (/આધાર|aadhaar|pan|ચૂંટણી|voter|ration|રેશન/i.test(title)) {
    return "દસ્તાવેજ અને સેવાઓ (Document Services)";
  }
  if (/digital gujarat|ખેડૂત|ikhedut|jamin|જમીન|7\/12|anyror/i.test(title)) {
    return "ગુજરાત પોર્ટલ અને જમીન (Gujarat Portals)";
  }
  return "CSC & Online Services";
}

/**
 * Public RSS Feed Fallback.
 * YouTube provides an official public Atom/RSS feed for every channel:
 * https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
 * This does not require any API key, has no quota limitation, and always
 * returns the channel's latest videos.
 */
export async function syncFromRssFallback(channelId = CHANNEL_ID): Promise<SyncResult> {
  logger.info({ channelId }, "[youtube-sync] Starting official YouTube RSS feed fallback");
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const res = await fetch(rssUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SmitCSCInfoBot/1.0)" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch YouTube RSS feed (${res.status} ${res.statusText})`);
  }

  const xml = await res.text();
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;
  let inserted = 0;
  let updated = 0;
  const categories = new Set<string>();

  while ((match = entryRegex.exec(xml)) !== null) {
    const entryXml = match[1];
    const vidMatch = entryXml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const titleMatch = entryXml.match(/<title>([^<]+)<\/title>/);
    const pubMatch = entryXml.match(/<published>([^<]+)<\/published>/);
    const descMatch = entryXml.match(/<media:description>([\s\S]*?)<\/media:description>/);
    const thumbMatch = entryXml.match(/<media:thumbnail[^>]+url="([^"]+)"/);

    if (!vidMatch || !titleMatch) continue;
    const videoId = vidMatch[1].trim();
    const rawTitle = titleMatch[1].trim();
    const title = rawTitle
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    const description = descMatch ? descMatch[1].trim() : "";
    const publishedAt = pubMatch ? new Date(pubMatch[1]) : new Date();
    const thumbnail = thumbMatch ? thumbMatch[1] : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    const category = categorizeTitle(title);
    categories.add(category);

    const link = `https://www.youtube.com/watch?v=${videoId}`;
    const [existing] = await db
      .select()
      .from(contentTable)
      .where(eq(contentTable.youtubeVideoId, videoId))
      .limit(1);

    if (existing) {
      await db
        .update(contentTable)
        .set({
          title,
          description,
          link,
          thumbnailUrl: thumbnail,
          playlistTitle: category,
          category,
          publishedAt,
        })
        .where(eq(contentTable.id, existing.id));
      updated++;
    } else {
      await db.insert(contentTable).values({
        title,
        category,
        type: "video",
        link,
        description,
        isPrime: false,
        thumbnailUrl: thumbnail,
        youtubeVideoId: videoId,
        playlistTitle: category,
        publishedAt,
      });
      inserted++;
    }
  }

  logger.info({ inserted, updated, categoriesCount: categories.size }, "[youtube-sync] RSS fallback sync complete");
  return {
    playlists: categories.size || 1,
    videos: inserted + updated,
    inserted,
    updated,
  };
}

/**
 * Pull every playlist + video from the configured YouTube channel and upsert
 * them into the content table. If the API key is not present or returns quota
 * errors, automatically falls back to YouTube's public channel RSS feed.
 */
export async function syncYoutubeChannel(): Promise<SyncResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    logger.warn("[youtube-sync] YOUTUBE_API_KEY is not set — using official RSS feed fallback");
    return await syncFromRssFallback();
  }

  try {
    const channel = await resolveChannel();
    logger.info({ channelId: channel.id, title: channel.snippet.title }, "[youtube-sync] resolved channel");

    // Get all playlists for the channel
    const playlists = await fetchAllPages<YTPlaylist>("playlists", {
      part: "id,snippet",
      channelId: channel.id,
    });

    const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads || `UU${channel.id.substring(2)}`;
    const sources: { id: string; title: string }[] = playlists.map((p) => ({
      id: p.id,
      title: p.snippet.title,
    }));
    if (uploadsId && !sources.some((s) => s.id === uploadsId)) {
      sources.push({ id: uploadsId, title: "All Videos" });
    }

    const videoMap = new Map<
      string,
      {
        title: string;
        description: string;
        publishedAt: Date;
        thumbnail: string;
        playlistId: string;
        playlistTitle: string;
      }
    >();

    for (const src of sources) {
      let items: YTPlaylistItem[] = [];
      try {
        items = await fetchAllPages<YTPlaylistItem>("playlistItems", {
          part: "snippet",
          playlistId: src.id,
        });
      } catch (e: any) {
        logger.warn({ err: e?.message, playlist: src.title }, "[youtube-sync] playlist fetch failed");
        continue;
      }

      for (const it of items) {
        if (it.snippet.resourceId?.kind !== "youtube#video") continue;
        const vid = it.snippet.resourceId.videoId;
        if (!vid) continue;

        const existing = videoMap.get(vid);
        const isUploads = src.id === uploadsId;
        if (existing) {
          if (isUploads) continue;
          if (existing.playlistId !== uploadsId) continue;
        }

        videoMap.set(vid, {
          title: it.snippet.title,
          description: it.snippet.description || "",
          publishedAt: new Date(it.snippet.publishedAt),
          thumbnail: pickThumbnail(it, vid),
          playlistId: src.id,
          playlistTitle: src.title,
        });
      }
    }

    // Upsert into DB
    let inserted = 0;
    let updated = 0;
    for (const [videoId, v] of videoMap.entries()) {
      const link = `https://www.youtube.com/watch?v=${videoId}`;
      const [existing] = await db
        .select()
        .from(contentTable)
        .where(eq(contentTable.youtubeVideoId, videoId))
        .limit(1);

      if (existing) {
        await db
          .update(contentTable)
          .set({
            title: v.title,
            description: v.description,
            link,
            thumbnailUrl: v.thumbnail,
            playlistId: v.playlistId,
            playlistTitle: v.playlistTitle,
            publishedAt: v.publishedAt,
            category: v.playlistTitle,
          })
          .where(eq(contentTable.id, existing.id));
        updated++;
      } else {
        await db.insert(contentTable).values({
          title: v.title,
          category: v.playlistTitle,
          type: "video",
          link,
          description: v.description,
          isPrime: false,
          thumbnailUrl: v.thumbnail,
          youtubeVideoId: videoId,
          playlistId: v.playlistId,
          playlistTitle: v.playlistTitle,
          publishedAt: v.publishedAt,
        });
        inserted++;
      }
    }

    logger.info({ playlists: playlists.length, videos: videoMap.size, inserted, updated }, "[youtube-sync] API sync completed");
    return {
      playlists: playlists.length,
      videos: videoMap.size,
      inserted,
      updated,
    };
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[youtube-sync] YouTube Data API failed — falling back to RSS sync");
    return await syncFromRssFallback();
  }
}
