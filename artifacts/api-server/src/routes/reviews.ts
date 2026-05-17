import { Router } from "express";
import { db, reviewsTable, usersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, requireAdminOrManager, type AuthRequest } from "../lib/auth";
import { z } from "zod";

const router = Router();

const CreateReviewBody = z.object({
  rating:     z.number().int().min(1).max(5),
  reviewText: z.string().min(5).max(500),
  state:      z.string().trim().min(1).max(80).optional().nullable(),
  city:       z.string().trim().min(1).max(80).optional().nullable(),
});

function serializeReview(r: typeof reviewsTable.$inferSelect) {
  return {
    id:         r.id,
    userId:     r.userId,
    userName:   r.userName,
    rating:     r.rating,
    reviewText: r.reviewText,
    state:      r.state ?? null,
    city:       r.city  ?? null,
    isPinned:   r.isPinned,
    createdAt:  r.createdAt.toISOString(),
  };
}

router.get("/reviews", async (_req, res): Promise<void> => {
  const reviews = await db
    .select()
    .from(reviewsTable)
    .orderBy(desc(reviewsTable.isPinned), desc(reviewsTable.createdAt));

  res.json(reviews.map(serializeReview));
});

router.post("/reviews", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid review data" });
    return;
  }

  const userId = req.userId!;

  const [user] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [review] = await db
    .insert(reviewsTable)
    .values({
      userId,
      userName:   user.name,
      rating:     parsed.data.rating,
      reviewText: parsed.data.reviewText,
      state:      parsed.data.state ?? null,
      city:       parsed.data.city  ?? null,
      isPinned:   false,
    })
    .returning();

  res.status(201).json(serializeReview(review));
});

router.get("/admin/reviews", requireAdminOrManager, async (_req, res): Promise<void> => {
  const reviews = await db
    .select()
    .from(reviewsTable)
    .orderBy(desc(reviewsTable.isPinned), desc(reviewsTable.createdAt));

  res.json(reviews.map(serializeReview));
});

router.delete("/admin/reviews/:id", requireAdminOrManager, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  await db.delete(reviewsTable).where(eq(reviewsTable.id, id));
  res.json({ success: true });
});

router.patch("/admin/reviews/:id/pin", requireAdminOrManager, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [current] = await db
    .select({ isPinned: reviewsTable.isPinned })
    .from(reviewsTable)
    .where(eq(reviewsTable.id, id))
    .limit(1);

  if (!current) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  const [updated] = await db
    .update(reviewsTable)
    .set({ isPinned: !current.isPinned })
    .where(eq(reviewsTable.id, id))
    .returning();

  res.json({ id: updated.id, isPinned: updated.isPinned });
});

export default router;
