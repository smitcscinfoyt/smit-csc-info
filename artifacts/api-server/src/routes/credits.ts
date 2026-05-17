import { Router, type IRouter } from "express";
import { db, paymentsTable, userCreditsTable, creditTransactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";
import multer from "multer";
import { logger } from "../lib/logger";
import { getPrimeStatus, hasPrimeAccess } from "../lib/prime-status";

const router: IRouter = Router();
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, or WEBP images are allowed"));
  },
});

const MONTHLY_ALLOWANCE = 10;
const REMOVE_BG_URL = "https://api.remove.bg/v1.0/removebg";

/**
 * Returns the user's Prime payment IF they currently have access (active OR in 3-day grace period).
 * Returns null only when truly expired beyond grace.
 */
export async function getActivePrime(userId: number) {
  const status = await getPrimeStatus(userId);
  return hasPrimeAccess(status) ? status.payment : null;
}

async function ensureCreditsRow(userId: number, isPrime: boolean) {
  const [existing] = await db
    .select()
    .from(userCreditsTable)
    .where(eq(userCreditsTable.userId, userId))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(userCreditsTable)
      .values({
        userId,
        credits: isPrime ? MONTHLY_ALLOWANCE : 0,
        monthlyAllowance: MONTHLY_ALLOWANCE,
      })
      .returning();
    if (isPrime) {
      await db.insert(creditTransactionsTable).values({
        userId,
        delta: MONTHLY_ALLOWANCE,
        reason: "initial_grant",
        balanceAfter: MONTHLY_ALLOWANCE,
      });
    }
    return created;
  }

  // Monthly auto-renewal for Prime members
  if (isPrime) {
    const cycleAgeDays =
      (Date.now() - existing.cycleStart.getTime()) / (1000 * 60 * 60 * 24);
    if (cycleAgeDays >= 30) {
      const [renewed] = await db
        .update(userCreditsTable)
        .set({
          credits: MONTHLY_ALLOWANCE,
          cycleStart: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userCreditsTable.userId, userId))
        .returning();
      await db.insert(creditTransactionsTable).values({
        userId,
        delta: MONTHLY_ALLOWANCE - existing.credits,
        reason: "monthly_renewal",
        balanceAfter: MONTHLY_ALLOWANCE,
      });
      return renewed;
    }
  }
  return existing;
}

router.get("/credits/me", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const active = await getActivePrime(userId);
  const isPrime = !!active;
  const row = await ensureCreditsRow(userId, isPrime);
  const nextRenewal = new Date(row.cycleStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  res.json({
    isPrime,
    credits: isPrime ? row.credits : 0,
    monthlyAllowance: row.monthlyAllowance,
    cycleStart: row.cycleStart.toISOString(),
    nextRenewal: isPrime ? nextRenewal.toISOString() : null,
  });
});

router.get("/user/status", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const active = await getActivePrime(userId);
  const isPrime = !!active;
  const row = await ensureCreditsRow(userId, isPrime);
  res.json({
    is_prime: isPrime,
    hd_credits: isPrime ? row.credits : 0,
    membership_type: isPrime ? "Prime" : "Free",
    expires_at: active?.expiryDate ? new Date(active.expiryDate).toISOString() : null,
  });
});

router.post(
  "/tools/remove-bg-fhd",
  requireAuth,
  upload.single("image"),
  async (req: AuthRequest, res): Promise<void> => {
    const userId = req.userId!;

    if (!req.file) {
      res.status(400).json({ error: "Image file is required" });
      return;
    }

    const apiKey = process.env.REMOVE_BG_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "Premium engine is not configured. Please contact support." });
      return;
    }

    // Verify Prime + has credits
    const active = await getActivePrime(userId);
    if (!active) {
      res.status(402).json({ error: "Prime membership required for FHD downloads" });
      return;
    }
    const row = await ensureCreditsRow(userId, true);
    if (row.credits <= 0) {
      res.status(402).json({ error: "No FHD credits remaining for this cycle" });
      return;
    }

    // Atomically deduct first to prevent race; refund on failure.
    const [deducted] = await db
      .update(userCreditsTable)
      .set({ credits: sql`${userCreditsTable.credits} - 1`, updatedAt: new Date() })
      .where(and(eq(userCreditsTable.userId, userId), gte(userCreditsTable.credits, 1)))
      .returning();
    if (!deducted) {
      res.status(402).json({ error: "No FHD credits remaining for this cycle" });
      return;
    }

    try {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(req.file.buffer)], {
        type: req.file.mimetype || "image/jpeg",
      });
      form.append("image_file", blob, req.file.originalname || "input.jpg");
      form.append("size", "auto");
      form.append("format", "png");
      const bgColor = (req.body?.bgColor as string | undefined)?.replace(/[^0-9a-fA-F]/g, "");
      if (bgColor && bgColor.length >= 3) {
        form.append("bg_color", bgColor);
      }

      const upstream = await fetch(REMOVE_BG_URL, {
        method: "POST",
        headers: { "X-Api-Key": apiKey },
        body: form,
      });

      if (!upstream.ok) {
        const text = await upstream.text();
        logger.warn({ status: upstream.status, body: text.slice(0, 400) }, "remove.bg failed");
        // Refund credit
        await db
          .update(userCreditsTable)
          .set({ credits: sql`${userCreditsTable.credits} + 1`, updatedAt: new Date() })
          .where(eq(userCreditsTable.userId, userId));
        res
          .status(502)
          .json({ error: "Premium engine returned an error. Your credit was not used." });
        return;
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      await db.insert(creditTransactionsTable).values({
        userId,
        delta: -1,
        reason: "remove_bg_fhd",
        balanceAfter: deducted.credits,
      });

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", 'attachment; filename="result.png"');
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("X-Credits-Remaining", String(deducted.credits));
      res.setHeader("Cache-Control", "no-store");
      res.end(buffer);
    } catch (err) {
      logger.error({ err }, "remove.bg call failed");
      // Refund credit on transport failure
      await db
        .update(userCreditsTable)
        .set({ credits: sql`${userCreditsTable.credits} + 1`, updatedAt: new Date() })
        .where(eq(userCreditsTable.userId, userId));
      res
        .status(502)
        .json({ error: "Could not reach premium engine. Your credit was not used." });
    }
  },
);

export default router;
