import { db, contentTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const YT_BASE = "https://www.googleapis.com/youtube/v3";
const CHANNEL_HANDLE = "SmitCSCInfo";

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
  // Try forHandle first (modern handle resolution)
  let r = await ytFetch<YTChannel>("channels", {
    part: "id,snippet,contentDetails",
    forHandle: `@${CHANNEL_HANDLE}`,
  });
  if (r.items.length === 0) {
    // Fallback to forUsername (legacy)
    r = await ytFetch<YTChannel>("channels", {
      part: "id,snippet,contentDetails",
      forUsername: CHANNEL_HANDLE,
    });
  }
  if (r.items.length === 0) {
    throw new Error(`YouTube channel "@${CHANNEL_HANDLE}" not found`);
  }
  return r.items[0];
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

/**
 * Pull every playlist + video from the configured YouTube channel and upsert
 * them into the content table. Existing rows are matched by youtubeVideoId
 * and have title/description/playlist/thumbnail refreshed; new videos are
 * inserted as free (isPrime=false). Manual fields (isPrime, titleGu) on
 * existing rows are preserved.
 */
export async function syncYoutubeChannel(): Promise<SyncResult> {
  const channel = await resolveChannel();
  logger.info({ channelId: channel.id, title: channel.snippet.title }, "[youtube-sync] resolved channel");

  // Get all playlists for the channel
  const playlists = await fetchAllPages<YTPlaylist>("playlists", {
    part: "id,snippet",
    channelId: channel.id,
  });

  // Always include the special "uploads" playlist so videos NOT in any
  // user-defined playlist still come through.
  const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
  const sources: { id: string; title: string }[] = playlists.map((p) => ({
    id: p.id,
    title: p.snippet.title,
  }));
  if (uploadsId && !sources.some((s) => s.id === uploadsId)) {
    sources.push({ id: uploadsId, title: "All Videos" });
  }

  // Build a map of videoId -> chosen playlist (prefer non-uploads playlist).
  // A video may live in multiple playlists; we keep the first user-defined
  // playlist we encounter, falling back to "All Videos".
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
        // Never let the uploads pseudo-playlist overwrite an existing entry.
        if (isUploads) continue;
        // If the existing entry is already from a real (non-uploads) playlist,
        // keep the first one we saw — don't shuffle videos between playlists.
        if (existing.playlistId !== uploadsId) continue;
        // Else: existing is uploads, current is a real playlist → upgrade.
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
          // Keep category in sync with playlist title for backward compat with
          // the existing category filter UI.
          category: v.playlistTitle,
          // Preserve isPrime, titleGu — those are admin-curated.
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

  return {
    playlists: playlists.length,
    videos: videoMap.size,
    inserted,
    updated,
  };
}
