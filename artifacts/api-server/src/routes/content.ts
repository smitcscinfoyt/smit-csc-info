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

router.get("/content", async (req, res): Promise<void> => {
  const parsed = GetContentQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

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

  const items = await query.orderBy(contentTable.createdAt);

  res.json(
    GetContentResponse.parse(
      items.map((i) => ({
        id: i.id,
        title: i.title,
        titleGu: i.titleGu,
        category: i.category,
        type: i.type,
        link: i.link,
        description: i.description,
        isPrime: i.isPrime,
        thumbnailUrl: i.thumbnailUrl,
        youtubeVideoId: i.youtubeVideoId ?? null,
        playlistId: i.playlistId ?? null,
        playlistTitle: i.playlistTitle ?? null,
        publishedAt: i.publishedAt ? i.publishedAt.toISOString() : null,
        createdAt: i.createdAt.toISOString(),
      }))
    )
  );
});

router.get("/content/:id", async (req, res): Promise<void> => {
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

  res.json(
    GetContentItemResponse.parse({
      id: item.id,
      title: item.title,
      titleGu: item.titleGu,
      category: item.category,
      type: item.type,
      link: item.link,
      description: item.description,
      isPrime: item.isPrime,
      thumbnailUrl: item.thumbnailUrl,
      createdAt: item.createdAt.toISOString(),
    })
  );
});

export default router;
