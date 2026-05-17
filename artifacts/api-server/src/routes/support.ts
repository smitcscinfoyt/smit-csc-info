import { Router, type IRouter } from "express";
import { db, inquiriesTable } from "@workspace/db";
import { eq, desc, and, ne } from "drizzle-orm";
import { requireAdminOrManager, requireAuth, optionalAuth, type AuthRequest } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const VALID_CATEGORIES = new Set([
  // Legacy
  "technical", "prime", "document", "schemes", "other", "recharge",
  // Recharge & Wallet
  "recharge_mobile", "recharge_bill", "wallet", "money_transfer", "kyc", "commission", "tpin",
  // Membership & Payments
  "operator_membership", "payment_phonepe", "refund", "coupon",
  // Digital Tools
  "tool_pdf_editor", "tool_esign", "tool_watermark", "tool_bg_remover",
  "tool_image_upscaler", "tool_id_card", "tool_passport", "tool_prime_studio",
  // Content & Documents
  "live_data", "youtube_pdf",
  // Account & Other
  "account_login", "profile", "feedback",
]);

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const submitHits = new Map<string, number[]>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const list = (submitHits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) {
    submitHits.set(key, list);
    return false;
  }
  list.push(now);
  submitHits.set(key, list);
  if (submitHits.size > 5000) {
    for (const [k, v] of submitHits) {
      const fresh = v.filter((t) => now - t < RATE_WINDOW_MS);
      if (fresh.length === 0) submitHits.delete(k);
      else submitHits.set(k, fresh);
    }
  }
  return true;
}

router.post("/support/submit", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const ipHeader = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
    const rateKey = req.userId ? `u:${req.userId}` : `ip:${ipHeader || req.ip || "unknown"}`;
    if (!checkRateLimit(rateKey)) {
      res.status(429).json({ error: "Too many inquiries from your address. Please try again later." });
      return;
    }
    const body = req.body ?? {};
    const userName = String(body.userName ?? body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const mobileRaw = body.mobile ? String(body.mobile).trim() : "";
    const mobile = mobileRaw ? mobileRaw.replace(/\D/g, "") : null;
    const category = String(body.category ?? "other").trim();
    const message = String(body.message ?? "").trim();
    const subjectRaw = body.subject != null ? String(body.subject).trim() : "";
    const subject = subjectRaw.length > 0 ? subjectRaw.slice(0, 200) : null;
    const transactionIdRaw = body.transactionId != null ? String(body.transactionId).trim() : "";
    const transactionId = transactionIdRaw.length > 0 ? transactionIdRaw.slice(0, 80) : null;
    const txDateRaw = body.txDate != null ? String(body.txDate).trim() : "";
    let txDate: string | null = null;
    if (txDateRaw) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(txDateRaw)) {
        res.status(400).json({ error: "txDate must be YYYY-MM-DD" });
        return;
      }
      const [yy, mm, dd] = txDateRaw.split("-").map(Number);
      const d = new Date(Date.UTC(yy, mm - 1, dd));
      if (
        d.getUTCFullYear() !== yy ||
        d.getUTCMonth() !== mm - 1 ||
        d.getUTCDate() !== dd
      ) {
        res.status(400).json({ error: "txDate is not a valid calendar date" });
        return;
      }
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "txDate is invalid" });
        return;
      }
      txDate = txDateRaw;
    }

    if (userName.length < 2 || userName.length > 120) {
      res.status(400).json({ error: "Full name is required (2–120 chars)" });
      return;
    }
    if (
      !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email) ||
      email.length > 200
    ) {
      res.status(400).json({ error: "A valid email is required (e.g. name@example.com)" });
      return;
    }
    // Catch common typos like '@gmail.co' (probably meant .com)
    if (/@(gmail|yahoo|hotmail|outlook|live|rediffmail|icloud|googlemail|ymail)\.(co|cm|om|con|coom|cim)$/i.test(email)) {
      res.status(400).json({ error: "Email looks incomplete. Did you mean .com?" });
      return;
    }
    if (mobile) {
      const mobileDigits = mobile.replace(/\D/g, "");
      if (!/^[6-9]\d{9}$/.test(mobileDigits)) {
        res.status(400).json({ error: "Mobile number must be a 10-digit Indian number starting with 6, 7, 8 or 9" });
        return;
      }
    }
    if (!VALID_CATEGORIES.has(category)) {
      res.status(400).json({ error: "Invalid query category" });
      return;
    }
    const wordCount = message.split(/\s+/).filter(Boolean).length;
    if (wordCount < 25) {
      res.status(400).json({ error: `Message must be at least 25 words (you wrote ${wordCount}).` });
      return;
    }
    if (wordCount > 300) {
      res.status(400).json({ error: `Message must be at most 300 words (you wrote ${wordCount}).` });
      return;
    }
    if (message.length > 4000) {
      res.status(400).json({ error: "Message is too long" });
      return;
    }

    const [created] = await db
      .insert(inquiriesTable)
      .values({
        userName,
        email,
        mobile,
        category,
        subject,
        transactionId,
        txDate,
        message,
        userId: req.userId ?? null,
      })
      .returning();

    res.status(201).json({ id: created.id, status: created.status });
  } catch (err) {
    logger.error({ err }, "Failed to submit inquiry");
    res.status(500).json({ error: "Could not submit your inquiry. Please try again." });
  }
});

router.get(
  "/admin/inquiries",
  requireAdminOrManager,
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : null;
      const where =
        status === "Pending" || status === "Replied" || status === "Resolved"
          ? eq(inquiriesTable.status, status)
          : undefined;
      const rows = await db
        .select()
        .from(inquiriesTable)
        .where(where)
        .orderBy(desc(inquiriesTable.createdAt))
        .limit(500);
      res.json(rows);
    } catch (err) {
      logger.error({ err }, "Failed to list inquiries");
      res.status(500).json({ error: "Could not load inquiries" });
    }
  },
);

router.get(
  "/admin/inquiries/unread-count",
  requireAdminOrManager,
  async (_req: AuthRequest, res): Promise<void> => {
    try {
      const rows = await db
        .select({ id: inquiriesTable.id })
        .from(inquiriesTable)
        .where(eq(inquiriesTable.status, "Pending"));
      res.json({ count: rows.length });
    } catch (err) {
      logger.error({ err }, "Failed to count pending inquiries");
      res.status(500).json({ error: "Could not load count" });
    }
  },
);

const getMyQueries = async (req: AuthRequest, res: any): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: inquiriesTable.id,
        category: inquiriesTable.category,
        subject: inquiriesTable.subject,
        transactionId: inquiriesTable.transactionId,
        txDate: inquiriesTable.txDate,
        message: inquiriesTable.message,
        adminReply: inquiriesTable.adminReply,
        status: inquiriesTable.status,
        createdAt: inquiriesTable.createdAt,
        repliedAt: inquiriesTable.repliedAt,
        resolvedAt: inquiriesTable.resolvedAt,
      })
      .from(inquiriesTable)
      .where(eq(inquiriesTable.userId, req.userId!))
      .orderBy(desc(inquiriesTable.createdAt))
      .limit(200);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "Failed to load user's inquiries");
    res.status(500).json({ error: "Could not load your support history" });
  }
};

router.get("/support/my", requireAuth, getMyQueries);
router.get("/user/queries", requireAuth, getMyQueries);

router.patch(
  "/admin/inquiries/:id/reply",
  requireAdminOrManager,
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const adminReply = String(req.body?.adminReply ?? "").trim();
      const resolve = req.body?.resolve !== false;
      if (adminReply.length < 2 || adminReply.length > 4000) {
        res.status(400).json({ error: "Reply must be 2–4000 characters" });
        return;
      }
      const updates: Record<string, unknown> = { adminReply, repliedAt: new Date() };
      if (resolve) {
        updates.status = "Resolved";
        updates.resolvedAt = new Date();
      } else {
        updates.status = "Replied";
      }
      const [updated] = await db
        .update(inquiriesTable)
        .set(updates)
        .where(eq(inquiriesTable.id, id))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Inquiry not found" });
        return;
      }
      res.json(updated);
    } catch (err) {
      logger.error({ err }, "Failed to save admin reply");
      res.status(500).json({ error: "Could not save reply" });
    }
  },
);

router.patch(
  "/admin/inquiries/:id/resolve",
  requireAdminOrManager,
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const [updated] = await db
        .update(inquiriesTable)
        .set({ status: "Resolved", resolvedAt: new Date() })
        .where(and(eq(inquiriesTable.id, id), ne(inquiriesTable.status, "Resolved")))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Inquiry not found or already resolved" });
        return;
      }
      res.json(updated);
    } catch (err) {
      logger.error({ err }, "Failed to resolve inquiry");
      res.status(500).json({ error: "Could not resolve inquiry" });
    }
  },
);

router.delete(
  "/admin/inquiries/:id",
  requireAdminOrManager,
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const [deleted] = await db
        .delete(inquiriesTable)
        .where(eq(inquiriesTable.id, id))
        .returning({ id: inquiriesTable.id });
      if (!deleted) {
        res.status(404).json({ error: "Inquiry not found" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to delete inquiry");
      res.status(500).json({ error: "Could not delete inquiry" });
    }
  },
);

export default router;
