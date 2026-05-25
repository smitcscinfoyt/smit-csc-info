import { Router } from "express";
import { db, walletsTable, walletLedgerTable, walletTopupsTable, kycRecordsTable, paymentsTable } from "@workspace/db";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { creditWallet, ensureWallet, WalletError } from "../lib/wallet-engine";
import { getGlobalSettings } from "../lib/recharge-config";
import { initiatePhonePePayment, checkPhonePeStatus, isPhonePeConfigured, getCallbackBaseUrl, verifyV1Callback } from "../lib/phonepe";
import { hasTpin } from "../lib/tpin";
import { sendWalletTopupSuccessEmail } from "../lib/mailer";
import { usersTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

function genTopupTxn(userId: number): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WLT${userId}T${ts}${rnd}`;
}

// ─── GET /wallet — current balance + KYC + caps ──────────────────────────────
router.get("/wallet", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const w = await ensureWallet(userId);
  const settings = await getGlobalSettings();
  const [kyc] = await db.select().from(kycRecordsTable).where(eq(kycRecordsTable.userId, userId));
  const tpinSet = await hasTpin(userId);

  const cap = kyc?.status === "verified" ? settings.walletCapKycPaise : settings.walletCapNoKycPaise;

  res.json({
    balancePaise: Number(w.balancePaise),
    kycLevel: w.kycLevel,
    kycStatus: kyc?.status ?? "none",
    tpinSet,
    tpinRequiredFromPaise: Number(w.tpinRequiredFromPaise),
    isFrozen: !!w.isFrozen,
    freezeReason: w.freezeReason,
    capPaise: cap,
    minTopupPaise: settings.minTopupPaise,
    maxTopupPaise: settings.maxTopupPaise,
  });
});

// ─── GET /wallet/ledger — paginated ledger ───────────────────────────────────
router.get("/wallet/ledger", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const limit = Math.min(parseInt(String(req.query.limit ?? "50")) || 50, 200);
  const offset = parseInt(String(req.query.offset ?? "0")) || 0;
  const rows = await db
    .select()
    .from(walletLedgerTable)
    .where(eq(walletLedgerTable.userId, userId))
    .orderBy(desc(walletLedgerTable.createdAt), desc(walletLedgerTable.id))
    .limit(limit)
    .offset(offset);
  res.json({
    entries: rows.map((r) => ({
      id: r.id,
      direction: r.direction,
      type: r.type,
      amountPaise: Number(r.amountPaise),
      balanceAfterPaise: Number(r.balanceAfterPaise),
      refType: r.refType,
      refId: r.refId,
      refCode: r.refCode,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

// ─── GET /wallet/ledger/range — full ledger between two IST dates (inclusive) ─
// Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD ; results capped at 5000 rows.
router.get("/wallet/ledger/range", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const fromStr = String(req.query.from ?? "").trim();
  const toStr = String(req.query.to ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    res.status(400).json({ error: "from and to must be YYYY-MM-DD" });
    return;
  }
  const IST_OFFSET_MS = 330 * 60 * 1000;
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  const fromUtc = new Date(Date.UTC(fy, fm - 1, fd) - IST_OFFSET_MS);
  const toExclusiveUtc = new Date(Date.UTC(ty, tm - 1, td) - IST_OFFSET_MS + 24 * 60 * 60 * 1000);
  if (toExclusiveUtc <= fromUtc) {
    res.status(400).json({ error: "Invalid date range" });
    return;
  }

  // Opening balance just before the window
  const [openingRow] = await db.select({ bal: walletLedgerTable.balanceAfterPaise })
    .from(walletLedgerTable)
    .where(and(eq(walletLedgerTable.userId, userId), lt(walletLedgerTable.createdAt, fromUtc)))
    .orderBy(desc(walletLedgerTable.createdAt))
    .limit(1);
  const openingBalancePaise = Number(openingRow?.bal ?? 0);

  // Full-range aggregate (independent of the 5000-row display cap)
  const { sql } = await import("drizzle-orm");
  const [agg] = await db.select({
    creditPaise: sql<number>`coalesce(sum(${walletLedgerTable.amountPaise}) filter (where ${walletLedgerTable.direction} = 'credit'), 0)::bigint`,
    debitPaise: sql<number>`coalesce(sum(${walletLedgerTable.amountPaise}) filter (where ${walletLedgerTable.direction} = 'debit'), 0)::bigint`,
    totalCount: sql<number>`count(*)::int`,
  })
    .from(walletLedgerTable)
    .where(and(eq(walletLedgerTable.userId, userId), gte(walletLedgerTable.createdAt, fromUtc), lt(walletLedgerTable.createdAt, toExclusiveUtc)));
  const creditPaise = Number(agg?.creditPaise ?? 0);
  const debitPaise = Number(agg?.debitPaise ?? 0);
  const totalCount = Number(agg?.totalCount ?? 0);

  // Closing balance: last ledger row strictly before window end (full-range, not the display cap)
  const [closingRow] = await db.select({ bal: walletLedgerTable.balanceAfterPaise })
    .from(walletLedgerTable)
    .where(and(eq(walletLedgerTable.userId, userId), lt(walletLedgerTable.createdAt, toExclusiveUtc)))
    .orderBy(desc(walletLedgerTable.createdAt))
    .limit(1);
  const closingBalancePaise = Number(closingRow?.bal ?? openingBalancePaise);

  // Display rows (capped). Note: summary numbers above already cover the full range.
  const rows = await db.select().from(walletLedgerTable)
    .where(and(eq(walletLedgerTable.userId, userId), gte(walletLedgerTable.createdAt, fromUtc), lt(walletLedgerTable.createdAt, toExclusiveUtc)))
    .orderBy(asc(walletLedgerTable.createdAt), asc(walletLedgerTable.id))
    .limit(5000);

  res.json({
    range: { from: fromStr, to: toStr, fromUtc: fromUtc.toISOString(), toExclusiveUtc: toExclusiveUtc.toISOString(), tz: "Asia/Kolkata" },
    summary: { openingBalancePaise, closingBalancePaise, creditPaise, debitPaise, count: totalCount, displayed: rows.length },
    entries: rows.map((r) => ({
      id: r.id,
      direction: r.direction,
      type: r.type,
      amountPaise: Number(r.amountPaise),
      balanceAfterPaise: Number(r.balanceAfterPaise),
      refType: r.refType,
      refId: r.refId,
      refCode: r.refCode,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

// ─── POST /wallet/topup/init — start a PhonePe top-up ────────────────────────
const topupInitBody = z.object({
  amountPaise: z.number().int().positive(),
});

router.post("/wallet/topup/init", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = topupInitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  const amountPaise = parsed.data.amountPaise;
  const settings = await getGlobalSettings();

  if (amountPaise < settings.minTopupPaise || amountPaise > settings.maxTopupPaise) {
    res.status(400).json({
      error: `Top-up amount must be between ₹${settings.minTopupPaise / 100} and ₹${settings.maxTopupPaise / 100}`,
    });
    return;
  }

  const w = await ensureWallet(userId);
  const [kyc] = await db.select().from(kycRecordsTable).where(eq(kycRecordsTable.userId, userId));
  const cap = kyc?.status === "verified" ? settings.walletCapKycPaise : settings.walletCapNoKycPaise;
  if (Number(w.balancePaise) + amountPaise > cap) {
    res.status(400).json({
      error: `Wallet limit (₹${cap / 100}) would be exceeded. Complete KYC to increase the limit.`,
      code: "WALLET_CAP_EXCEEDED",
    });
    return;
  }

  if (!isPhonePeConfigured()) {
    res.status(503).json({ error: "PhonePe payment gateway not configured" });
    return;
  }

  const transactionId = genTopupTxn(userId);
  await db.insert(walletTopupsTable).values({
    userId,
    amountPaise,
    transactionId,
    status: "pending",
  });

  const base = getCallbackBaseUrl();
  // BASE_PATH for the smit-csc-info artifact (e.g. "/" or "/smit-csc-info")
  const appBase = (process.env.SMIT_CSC_BASE_PATH ?? "/").replace(/\/$/, "");
  const redirectUrl = `${base}${appBase}/wallet/return?txn=${transactionId}`;
  const callbackUrl = `${base}/api/wallet/topup/phonepe/callback`;

  try {
    const { phonePeRedirectUrl } = await initiatePhonePePayment({
      merchantTransactionId: transactionId,
      merchantUserId: `user-${userId}`,
      amount: amountPaise / 100,
      redirectUrl,
      callbackUrl,
    });
    res.json({ transactionId, redirectUrl: phonePeRedirectUrl, amountPaise });
  } catch (err: any) {
    await db.update(walletTopupsTable)
      .set({ status: "failed", errorReason: err?.message ?? "init failed", updatedAt: new Date() })
      .where(eq(walletTopupsTable.transactionId, transactionId));
    req.log.error({ err }, "[wallet/topup] PhonePe init failed");
    res.status(502).json({ error: err?.message ?? "Payment initiation failed" });
  }
});

// ─── PhonePe callback for wallet top-ups ─────────────────────────────────────
async function handleWalletPhonePeCallback(req: any, res: any): Promise<void> {
  const base = getCallbackBaseUrl();
  const appBase = (process.env.SMIT_CSC_BASE_PATH ?? "/").replace(/\/$/, "");
  try {
    req.log?.info({ q: req.query, b: req.body }, "[wallet/cb] in");

    const xVerify = req.headers["x-verify"] as string | undefined;
    const callbackResponse = req.body?.response as string | undefined;
    if (callbackResponse && xVerify) {
      const valid = verifyV1Callback(callbackResponse, xVerify);
      req.log?.info({ valid }, "[wallet/cb] v1 X-VERIFY");
    }

       // Extract the transaction ID from all locations PhonePe may send it
    let merchantTransactionId: string | undefined =
      (req.query?.txn             as string | undefined) ||
      (req.query?.merchantOrderId as string | undefined) ||
      (req.query?.orderId         as string | undefined) ||
      (req.body?.merchantOrderId  as string | undefined) ||
      (req.body?.orderId          as string | undefined) ||
      (req.body?.payload?.merchantOrderId as string | undefined) ||
      (req.body?.payload?.orderId         as string | undefined);

    if (!txn && req.body?.response) {
      try {
        const decoded = Buffer.from(req.body.response, "base64").toString("utf-8");
        const parsed = JSON.parse(decoded);
        txn = parsed.merchantTransactionId;
      } catch {}
    }
    if (!txn) {
      txn = req.body?.merchantTransactionId || req.query?.transactionId || req.query?.merchantTransactionId;
    }

    if (!txn) {
      res.redirect(`${base}${appBase}/wallet?status=pending`);
      return;
    }
    if (!isPhonePeConfigured()) {
      res.redirect(`${base}${appBase}/wallet/return?txn=${txn}&status=pending`);
      return;
    }

    await reconcileTopup(String(txn));
    res.redirect(`${base}${appBase}/wallet/return?txn=${txn}`);
  } catch (err) {
    req.log?.error({ err }, "[wallet/cb] error");
    res.redirect(`${base}${appBase}/wallet?status=pending`);
  }
}
router.post("/wallet/topup/phonepe/callback", handleWalletPhonePeCallback);
router.get("/wallet/topup/phonepe/callback", handleWalletPhonePeCallback);

// ─── POST /wallet/topup/:txn/verify — manual re-check ────────────────────────
router.post("/wallet/topup/:txn/verify", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const txn = String(req.params.txn);
  const [t] = await db.select().from(walletTopupsTable).where(and(eq(walletTopupsTable.transactionId, txn), eq(walletTopupsTable.userId, userId)));
  if (!t) {
    res.status(404).json({ error: "Top-up not found" });
    return;
  }
  if (t.status === "success") {
    res.json({ status: "success", transactionId: txn, amountPaise: Number(t.amountPaise) });
    return;
  }
  if (!isPhonePeConfigured()) {
    res.status(503).json({ error: "Payment gateway not configured" });
    return;
  }
  const result = await reconcileTopup(txn);
  res.json({ status: result.status, transactionId: txn, amountPaise: Number(t.amountPaise), error: result.error });
});

/** Idempotently sync a single top-up's status from PhonePe and credit the wallet on success. */
async function reconcileTopup(txn: string): Promise<{ status: string; error?: string }> {
  const [t] = await db.select().from(walletTopupsTable).where(eq(walletTopupsTable.transactionId, txn));
  if (!t) return { status: "not_found" };
  if (t.status === "success") return { status: "success" };

  const { success, state } = await checkPhonePeStatus(txn);

  if (success) {
    // Atomic: update topup row only if still pending; if so credit wallet.
    const [updated] = await db
      .update(walletTopupsTable)
      .set({ status: "success", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(walletTopupsTable.id, t.id), eq(walletTopupsTable.status, "pending")))
      .returning();
    if (updated) {
      const credit = await creditWallet(t.userId, {
        type: "topup",
        amountPaise: Number(t.amountPaise),
        refType: "wallet_topup",
        refId: t.id,
        refCode: txn,
        note: `Wallet top-up via PhonePe`,
      });
            await db.update(walletTopupsTable)
        .set({ ledgerEntryId: credit.ledgerEntryId, updatedAt: new Date() })
        .where(eq(walletTopupsTable.id, t.id));

      // Fire-and-forget success email
      try {
        const [u] = await db.select().from(usersTable).where(eq(usersTable.id, t.userId));
        if (u?.email) {
          sendWalletTopupSuccessEmail({
            toEmail: u.email,
            toName: u.name || "Member",
            amountPaise: Number(t.amountPaise),
            transactionId: t.transactionId,
            completedAt: updated.completedAt ?? new Date(),
            method: t.method ?? "phonepe",
            newBalancePaise: credit.balancePaise,
          }).catch((e) => console.error("[wallet topup] email send failed:", e?.message ?? e));
        }
      } catch (e: any) {
        console.error("[wallet topup] email prep failed:", e?.message ?? e);
      }
    }
    return { status: "success" };
  }
  if (state === "PENDING") return { status: "pending" };

  await db
    .update(walletTopupsTable)
    .set({ status: "failed", errorReason: `PhonePe state: ${state}`, updatedAt: new Date() })
    .where(and(eq(walletTopupsTable.id, t.id), eq(walletTopupsTable.status, "pending")));
  return { status: "failed", error: `PhonePe state: ${state}` };
}

// ─── GET /wallet/payment-info — bank + UPI details for manual top-ups ───────
router.get("/wallet/payment-info", requireAuth, async (_req, res): Promise<void> => {
  res.json({
    bank: {
      bankName: "State Bank of India",
      accountName: "Mr SAGARBHAI DEVASHIBHAI KINDARAKHEDIYA",
      accountNumber: "35064694518",
      ifsc: "SBIN0060198",
      branch: "BALAGAM GHED, KESHOD, JUNAGADH",
    },
    upi: {
      merchantName: "Smit CSC Info",
      qrImageUrl: "/payment/qr.png",
      terminalId: "Q36657429",
      upiId: "Q36657429@ybl",
    },
    notes: [
      "After payment, upload the UTR / Transaction ID and screenshot",
      "Admin will verify and credit your wallet in 5–30 minutes",
      "You are responsible for rejection of any wrong/duplicate entry",
    ],
  });
});

// ─── POST /wallet/topup/manual — submit manual deposit (bank / UPI) ──────────
const manualTopupBody = z.object({
  amountPaise: z.number().int().positive(),
  channel: z.enum(["bank", "upi"]),
  utr: z.string().trim().min(4).max(64),
    proofUrl: z.string().trim().min(1).max(2000).optional().or(z.literal("")),
  userNote: z.string().trim().max(500).optional(),
});

router.post("/wallet/topup/manual", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = manualTopupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { amountPaise, channel, utr, proofUrl, userNote } = parsed.data;
  const settings = await getGlobalSettings();

  if (amountPaise < settings.minTopupPaise || amountPaise > settings.maxTopupPaise) {
    res.status(400).json({
      error: `Top-up amount must be between ₹${settings.minTopupPaise / 100} and ₹${settings.maxTopupPaise / 100}`,
    });
    return;
  }

  const w = await ensureWallet(userId);
  const [kyc] = await db.select().from(kycRecordsTable).where(eq(kycRecordsTable.userId, userId));
  const cap = kyc?.status === "verified" ? settings.walletCapKycPaise : settings.walletCapNoKycPaise;
  if (Number(w.balancePaise) + amountPaise > cap) {
    res.status(400).json({
      error: `Wallet limit (₹${cap / 100}) would be exceeded. Complete KYC to increase the limit.`,
      code: "WALLET_CAP_EXCEEDED",
    });
    return;
  }

  // Reject obvious duplicate UTRs from same user (within last 30d) at insert time
  const trimmedUtr = utr.trim().toUpperCase();
  const dup = await db
    .select({ id: walletTopupsTable.id })
    .from(walletTopupsTable)
    .where(and(eq(walletTopupsTable.userId, userId), eq(walletTopupsTable.utr, trimmedUtr)))
    .limit(1);
  if (dup.length > 0) {
    res.status(409).json({ error: "This UTR has already been submitted" });
    return;
  }

  const transactionId = `MAN${userId}T${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const [row] = await db
    .insert(walletTopupsTable)
    .values({
      userId,
      amountPaise,
      transactionId,
      status: "awaiting_review",
      method: channel === "bank" ? "manual_bank" : "manual_upi",
      channel,
      utr: trimmedUtr,
      proofUrl: proofUrl || null,
      userNote: userNote ?? null,
    })
    .returning();

  res.json({
    transactionId,
    id: row.id,
    status: row.status,
    amountPaise,
    message: "Your request has been submitted. Wallet will be credited after admin verification.",
  });
});

// ─── GET /wallet/topups — recent top-up history ──────────────────────────────
router.get("/wallet/topups", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(walletTopupsTable)
    .where(eq(walletTopupsTable.userId, userId))
    .orderBy(desc(walletTopupsTable.createdAt))
    .limit(50);
  res.json({
    topups: rows.map((r) => ({
      id: r.id,
      transactionId: r.transactionId,
      amountPaise: Number(r.amountPaise),
      status: r.status,
      method: r.method,
      channel: r.channel,
      utr: r.utr,
      proofUrl: r.proofUrl,
      userNote: r.userNote,
      adminNote: r.adminNote,
      errorReason: r.errorReason,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    })),
  });
});

export default router;
// avoid unused import warning
void paymentsTable;
void walletsTable;
