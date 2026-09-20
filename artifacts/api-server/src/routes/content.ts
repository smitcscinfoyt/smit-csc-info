import { Router } from "express";
import { db, contentTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { GetContentQueryParams, GetContentResponse, GetContentItemResponse, GetContentCategoriesResponse } from "@workspace/api-zod";
import { optionalAuth, type AuthRequest } from "../lib/auth";
import { getActivePrime } from "./credits";

const router = Router();

async function isRequesterPrime(req: AuthRequest): Promise<boolean> {
  if (!req.userId) return false;
  return !!(await getActivePrime(req.userId));
}

router.get("/content/categories", async (_req, res): Promise<void> => {
  const categories = await db
    .select({
      category: contentTable.category,
      count: sql<number>`count(*)::int`,
    })
    .from(contentTable)
    .groupBy(contentTable.category);

  res.json(GetContentCategoriesResponse.parse(categories));
});

router.get("/content", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = GetContentQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const requesterIsPrime = await isRequesterPrime(req);
  const { category, type, isPrime } = parsed.data;

  let query = db.select().from(contentTable).$dynamic();

  const conditions = [];
  if (category) conditions.push(eq(contentTable.category, category));
  if (type) conditions.push(eq(contentTable.type, type));
  if (isPrime !== null && isPrime !== undefined) conditions.push(eq(contentTable.isPrime, isPrime));

  if (conditions.length > 0) {
    const { and } = await import("drizzle-orm");
    query = query.where(and(...conditions));
  }

  let items = await query.orderBy(contentTable.createdAt);

  if (items.length === 0 && !category && !type && isPrime === undefined) {
    try {
      const { syncYoutubeChannel } = await import("../lib/youtube-sync");
      await syncYoutubeChannel();
      items = await db.select().from(contentTable).orderBy(contentTable.createdAt);
    } catch {
      // Continue with empty array if sync fails
    }
  }

  res.json(
    GetContentResponse.parse(
      items.map((i) => {
        const isLocked = i.isPrime && !requesterIsPrime;
        return {
          id: i.id,
          title: i.title,
          titleGu: i.titleGu,
          category: i.category,
          type: i.type,
          link: isLocked ? "" : i.link,
          description: i.description,
          isPrime: i.isPrime,
          thumbnailUrl: i.thumbnailUrl,
          youtubeVideoId: isLocked ? null : (i.youtubeVideoId ?? null),
          playlistId: isLocked ? null : (i.playlistId ?? null),
          playlistTitle: i.playlistTitle ?? null,
          publishedAt: i.publishedAt ? i.publishedAt.toISOString() : null,
          createdAt: i.createdAt.toISOString(),
        };
      })
    )
  );
});

router.get("/content/:id", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid content ID" });
    return;
  }

  const [item] = await db.select().from(contentTable).where(eq(contentTable.id, id));
  if (!item) {
    res.status(404).json({ error: "Content not found" });
    return;
  }

  const requesterIsPrime = await isRequesterPrime(req);
  const isLocked = item.isPrime && !requesterIsPrime;

  res.json(
    GetContentItemResponse.parse({
      id: item.id,
      title: item.title,
      titleGu: item.titleGu,
      category: item.category,
      type: item.type,
      link: isLocked ? "" : item.link,
      description: item.description,
      isPrime: item.isPrime,
      thumbnailUrl: item.thumbnailUrl,
      youtubeVideoId: isLocked ? null : (item.youtubeVideoId ?? null),
      playlistId: isLocked ? null : (item.playlistId ?? null),
      playlistTitle: item.playlistTitle ?? null,
      publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
      createdAt: item.createdAt.toISOString(),
    })
  );
});

export default router;
