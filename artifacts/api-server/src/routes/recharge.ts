import { Router } from "express";
import { db, rechargesTable, walletsTable, kycRecordsTable, walletLedgerTable, walletTopupsTable } from "@workspace/db";
import { and, desc, eq, gte, lt, or, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { ensureWallet, debitWallet, creditWallet, WalletError } from "../lib/wallet-engine";
import { computeCommission, type RechargeType } from "../lib/commission-engine";
import { doRecharge, checkStatus, isA1TopupConfigured, OPERATORS, CIRCLES, verifyWebhookSig, type A1Response } from "../lib/a1topup";
import { getGlobalSettings } from "../lib/recharge-config";
import { getPrimeStatus } from "../lib/prime-status";
import { getUserOperatorTier, resolveCommissionTier } from "../lib/operator-tier";
import { verifyTpin, hasTpin, tpinRequiredFor } from "../lib/tpin";
import { detectMobileOperator } from "../lib/mobile-prefix";
import { detectViaEzytm } from "../lib/ezytm-detect";
import { getPlansForOperator } from "../lib/ezytm-plans";

const router = Router();

function genReqId(userId: number, type: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `R${type[0].toUpperCase()}${userId}${ts}${rnd}`;
}

// ─── GET /recharge/operators — operator + circle catalog ─────────────────────
router.get("/recharge/operators", async (_req, res) => {
  res.json({ operators: OPERATORS, circles: CIRCLES });
});

// ─── GET /recharge/detect — auto-detect operator + circle from mobile no. ────
//
// Best-effort prefix-based detection. Returns 200 with `null` payload when the
// number prefix is unknown (caller should fall back to manual selection).
router.get("/recharge/detect", async (req, res) => {
  const number = String(req.query.number ?? "");
  if (!/^\d{4,10}$/.test(number)) {
    res.status(400).json({ error: "Invalid number" });
    return;
  }

  // Strategy:
  //   1. If Ezytm (planapi.in) is configured AND number is full 10-digits,
  //      try the live MNP-aware lookup first. Cached aggressively (24h).
  //   2. On Ezytm null/undefined (not configured / unknown / network fail),
  //      fall back to the offline TRAI prefix table (best-effort, no MNP).
  if (number.length === 10) {
    try {
      const live = await detectViaEzytm(number);
      if (live) { res.json({ detection: live }); return; }
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, "[recharge/detect] ezytm threw — falling back to prefix");
    }
  }

  const det = detectMobileOperator(number);
  res.json({ detection: det });
});

// ─── GET /recharge/plans — Ezytm plans browser ───────────────────────────────
router.get("/recharge/plans", async (req, res) => {
  const operatorCode = String(req.query.operatorCode ?? "").trim();
  const circleCode = String(req.query.circleCode ?? "12").trim();
  if (!operatorCode) {
    res.status(400).json({ error: "operatorCode required" });
    return;
  }
  try {
    const categories = await getPlansForOperator(operatorCode, circleCode);
    res.json({ categories });
  } catch (err) {
    req.log.warn({ err: (err as Error).message }, "[recharge/plans] failed");
    res.json({ categories: [] });
  }
});

// ─── GET /recharge/quote — preview commission for an amount ──────────────────
router.get("/recharge/quote", requireAuth, async (req: AuthRequest, res) => {
  const type = String(req.query.type ?? "") as RechargeType;
  const operatorCode = String(req.query.operatorCode ?? "");
  const amountPaise = Number(req.query.amountPaise ?? 0);
  if (!["mobile", "dth", "bill"].includes(type) || !operatorCode || !amountPaise) {
    res.status(400).json({ error: "Invalid quote params" });
    return;
  }
  const status = await getPrimeStatus(req.userId!);
  const opTier = await getUserOperatorTier(req.userId!);
  const tier = resolveCommissionTier(opTier, status);
  const c = await computeCommission(type, operatorCode, tier, amountPaise);
  res.json({
    tier,
    percentBp: c.percentBp,
    sharePercent: c.sharePercent,
    baseCommissionPaise: c.baseCommissionPaise,
    commissionPaise: c.commissionPaise,
    netCostPaise: amountPaise - c.commissionPaise,
  });
});

// ─── POST /recharge — create + execute a recharge ────────────────────────────
const rechargeBody = z.object({
  type: z.enum(["mobile", "dth", "bill"]),
  operatorCode: z.string().min(1),
  number: z.string().min(3).max(80),
  amountPaise: z.number().int().positive(),
  circleCode: z.string().optional(),
  customerName: z.string().max(200).optional(),
  idempotencyKey: z.string().min(8).max(120),
  tpin: z.string().optional(),
});

router.post("/recharge", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = rechargeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid recharge request", details: parsed.error.format() });
    return;
  }
  const { type, operatorCode, number, amountPaise, circleCode, customerName, idempotencyKey, tpin } = parsed.data;

  // Idempotency: if a recharge with this key already exists, return it.
  const [existing] = await db.select().from(rechargesTable).where(and(eq(rechargesTable.userId, userId), eq(rechargesTable.idempotencyKey, idempotencyKey)));
  if (existing) {
    res.json(serializeRecharge(existing));
    return;
  }

  const settings = await getGlobalSettings();
  if (!settings.rechargeEnabled) {
    res.status(503).json({ error: "Recharge service is currently disabled" });
    return;
  }
  if (type === "mobile" && !settings.mobileEnabled) { res.status(503).json({ error: "Mobile recharge disabled" }); return; }
  if (type === "dth"    && !settings.dthEnabled)    { res.status(503).json({ error: "DTH recharge disabled" });    return; }
  if (type === "bill"   && !settings.billEnabled)   { res.status(503).json({ error: "Bill payment disabled" });    return; }

  if (amountPaise < settings.minRechargePaise || amountPaise > settings.maxRechargePaise) {
    res.status(400).json({
      error: `Amount must be between ₹${settings.minRechargePaise / 100} and ₹${settings.maxRechargePaise / 100}`,
    });
    return;
  }

  if (!isA1TopupConfigured()) {
    res.status(503).json({ error: "Recharge provider not configured", code: "PROVIDER_UNAVAILABLE" });
    return;
  }

  // Find operator name from catalog (server is source-of-truth).
  // For "bill", search across all sub-categories (postpaid, electricity, gas,
  // insurance, fastag, giftcard) since all are routed via the bill type.
  const billCats = ["postpaid", "electricity", "gas", "insurance", "fastag", "giftcard", "bill"] as const;
  const candidateLists: ReadonlyArray<{ code: string; name: string }>[] =
    type === "bill"
      ? billCats.map((c) => OPERATORS[c] as ReadonlyArray<{ code: string; name: string }>)
      : [OPERATORS[type] as ReadonlyArray<{ code: string; name: string }>];
  let op: { code: string; name: string } | undefined;
  for (const list of candidateLists) {
    op = list.find((o) => o.code === operatorCode);
    if (op) break;
  }
  if (!op) { res.status(400).json({ error: "Unknown operator" }); return; }

  // Format-validate account
  const acct = number.trim();
  if (type === "mobile" && !/^[6-9][0-9]{9}$/.test(acct)) { res.status(400).json({ error: "Invalid mobile number" }); return; }
  if (type === "dth" && acct.length < 6) { res.status(400).json({ error: "Invalid DTH customer ID" }); return; }
  if (type === "bill" && acct.length < 4) { res.status(400).json({ error: "Invalid consumer number" }); return; }

  // T-PIN gate
  const wallet = await ensureWallet(userId);
  if (wallet.isFrozen) { res.status(403).json({ error: wallet.freezeReason || "Wallet is frozen", code: "WALLET_FROZEN" }); return; }
  const tpinNeeded = await tpinRequiredFor(userId, amountPaise);
  if (tpinNeeded) {
    const set = await hasTpin(userId);
    if (!set) { res.status(400).json({ error: "T-PIN must be set up for this amount", code: "TPIN_NOT_SET" }); return; }
    if (!tpin) { res.status(400).json({ error: "T-PIN is required", code: "TPIN_REQUIRED" }); return; }
    const ok = await verifyTpin(userId, tpin);
    if (!ok) { res.status(401).json({ error: "Invalid T-PIN", code: "TPIN_INVALID" }); return; }
  }

  // Daily count limit
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const todayCount = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(rechargesTable)
    .where(and(eq(rechargesTable.userId, userId), gte(rechargesTable.createdAt, today0)));
  if ((todayCount[0]?.c ?? 0) >= settings.dailyRechargeCountLimit) {
    res.status(429).json({ error: "Daily recharge limit reached" });
    return;
  }

  // Tier + commission (operator membership tier overrides content Prime)
  const status = await getPrimeStatus(userId);
  const opTier = await getUserOperatorTier(userId);
  const tier = resolveCommissionTier(opTier, status);
  const com = await computeCommission(type, operatorCode, tier, amountPaise);

  // Insert pending recharge first (so we have a row to update on failure)
  const requestId = genReqId(userId, type);
  let rechargeRow;
  try {
    [rechargeRow] = await db.insert(rechargesTable).values({
      userId,
      walletId: wallet.id,
      type,
      operatorCode,
      operatorName: op.name,
      circleCode: circleCode ?? null,
      accountNumber: acct,
      customerName: customerName ?? null,
      amountPaise,
      commissionPaise: com.commissionPaise,
      commissionTier: tier,
      commissionPercentBp: com.percentBp,
      netCostPaise: amountPaise - com.commissionPaise,
      status: "pending",
      a1RequestId: requestId,
      idempotencyKey,
    }).returning();
  } catch (err: any) {
    // unique violation on idempotencyKey → re-read
    const [again] = await db.select().from(rechargesTable).where(and(eq(rechargesTable.userId, userId), eq(rechargesTable.idempotencyKey, idempotencyKey)));
    if (again) { res.json(serializeRecharge(again)); return; }
    throw err;
  }

  // Atomic debit (full amount; commission credited back on success)
  let debitLedgerId: number;
  try {
    const d = await debitWallet(userId, {
      type: "recharge_debit",
      amountPaise,
      refType: "recharge",
      refId: rechargeRow.id,
      refCode: requestId,
      note: `${op.name} ${type} → ${acct}`,
    });
    debitLedgerId = d.ledgerEntryId;
    await db.update(rechargesTable)
      .set({ status: "processing", debitLedgerId, updatedAt: new Date() })
      .where(eq(rechargesTable.id, rechargeRow.id));
  } catch (err: any) {
    await db.update(rechargesTable)
      .set({ status: "failed", errorReason: err?.message ?? "Debit failed", updatedAt: new Date(), completedAt: new Date() })
      .where(eq(rechargesTable.id, rechargeRow.id));
    if (err instanceof WalletError) {
      res.status(402).json({ error: err.message, code: err.code });
      return;
    }
    throw err;
  }

  // Hit A1Topup
  // A1Topup requires `circlecode` for mobile recharges — default to Gujarat (12)
  const effectiveCircle = type === "mobile" ? (circleCode || "12") : circleCode;
  let a1: A1Response;
  try {
    a1 = await doRecharge({
      requestId,
      operatorCode,
      number: acct,
      amountRupees: amountPaise / 100,
      circleCode: effectiveCircle,
    });
  } catch (err: any) {
    // Network/parse error — keep status processing, schedule background reconcile via /status endpoint.
    req.log.error({ err, requestId }, "[recharge] A1Topup call failed");
    await db.update(rechargesTable)
      .set({ status: "processing", errorReason: `Provider call error: ${err?.message ?? err}`, updatedAt: new Date() })
      .where(eq(rechargesTable.id, rechargeRow.id));
    const [row] = await db.select().from(rechargesTable).where(eq(rechargesTable.id, rechargeRow.id));
    res.status(202).json(serializeRecharge(row!));
    return;
  }

  // Apply A1 result
  const finalRow = await applyProviderResult(rechargeRow.id, a1);
  res.json(serializeRecharge(finalRow));
});

/**
 * Idempotently apply a provider response (initial or polled) to a recharge row.
 * - success → mark success, credit commission, set completedAt
 * - failed  → mark failed, refund full amount, set completedAt
 * - pending → keep processing, store provider order id
 */
export async function applyProviderResult(rechargeId: number, a1: A1Response) {
  const [row] = await db.select().from(rechargesTable).where(eq(rechargesTable.id, rechargeId));
  if (!row) throw new Error(`Recharge ${rechargeId} not found`);
  if (row.status === "success" || row.status === "failed" || row.status === "refunded") {
    return row;
  }

  const baseUpdate = {
    a1OrderId: a1.a1OrderId ?? row.a1OrderId,
    a1OperatorRef: a1.operatorRef ?? row.a1OperatorRef,
    a1ResponseCode: a1.rawStatusCode || row.a1ResponseCode,
    responseRaw: a1.raw,
    updatedAt: new Date(),
  };

  if (a1.status === "success") {
    // CAS-FIRST to claim the transition exclusively. If we lose, somebody else owns it.
    const [claimed] = await db.update(rechargesTable)
      .set({ ...baseUpdate, status: "success", completedAt: new Date() })
      .where(and(eq(rechargesTable.id, row.id), eq(rechargesTable.status, row.status)))
      .returning();
    if (!claimed) {
      const [latest] = await db.select().from(rechargesTable).where(eq(rechargesTable.id, row.id));
      return latest ?? row;
    }
    // We own the transition. Credit commission, but if it throws, REVERT the CAS so a
    // subsequent /status poll re-finalizes and credits exactly once. Without revert the
    // row would be permanently "success" with no commission.
    if (Number(row.commissionPaise) > 0) {
      try {
        const c = await creditWallet(row.userId, {
          type: "commission",
          amountPaise: Number(row.commissionPaise),
          refType: "recharge",
          refId: row.id,
          refCode: row.a1RequestId,
          note: `Commission: ${row.operatorName} ${row.type}`,
        });
        const [linked] = await db.update(rechargesTable)
          .set({ commissionLedgerId: c.ledgerEntryId, updatedAt: new Date() })
          .where(eq(rechargesTable.id, row.id))
          .returning();
        return linked ?? claimed;
      } catch (e: any) {
        await db.update(rechargesTable)
          .set({ status: "processing", completedAt: null, errorReason: `Commission credit failed, will retry: ${e?.message ?? e}`, updatedAt: new Date() })
          .where(and(eq(rechargesTable.id, row.id), eq(rechargesTable.status, "success")));
        throw e;
      }
    }
    return claimed;
  }

  if (a1.status === "failed") {
    // CAS-FIRST to claim the failed transition.
    const [claimed] = await db.update(rechargesTable)
      .set({ ...baseUpdate, status: "refunded", errorReason: a1.message || "Provider failure", completedAt: new Date() })
      .where(and(eq(rechargesTable.id, row.id), eq(rechargesTable.status, row.status)))
      .returning();
    if (!claimed) {
      const [latest] = await db.select().from(rechargesTable).where(eq(rechargesTable.id, row.id));
      return latest ?? row;
    }
    if (row.debitLedgerId) {
      // Refund must succeed or we revert the CAS so retry can complete it (no user fund loss).
      try {
        const r = await creditWallet(row.userId, {
          type: "recharge_refund",
          amountPaise: Number(row.amountPaise),
          refType: "recharge",
          refId: row.id,
          refCode: row.a1RequestId,
          note: `Refund: ${row.operatorName} ${row.type} failed — ${a1.message || "no msg"}`,
        });
        const [linked] = await db.update(rechargesTable)
          .set({ refundLedgerId: r.ledgerEntryId, updatedAt: new Date() })
          .where(eq(rechargesTable.id, row.id))
          .returning();
        return linked ?? claimed;
      } catch (e: any) {
        await db.update(rechargesTable)
          .set({ status: "processing", completedAt: null, errorReason: `Refund credit failed, will retry: ${e?.message ?? e}`, updatedAt: new Date() })
          .where(and(eq(rechargesTable.id, row.id), eq(rechargesTable.status, "refunded")));
        throw e;
      }
    }
    return claimed;
  }

  // pending
  const [updated] = await db.update(rechargesTable).set({ ...baseUpdate, status: "processing" }).where(eq(rechargesTable.id, row.id)).returning();
  return updated ?? row;
}

// ─── GET /recharge — history ─────────────────────────────────────────────────
router.get("/recharge", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const limit = Math.min(parseInt(String(req.query.limit ?? "50")) || 50, 200);
  const offset = parseInt(String(req.query.offset ?? "0")) || 0;
  const rows = await db.select().from(rechargesTable)
    .where(eq(rechargesTable.userId, userId))
    .orderBy(desc(rechargesTable.createdAt))
    .limit(limit).offset(offset);
  res.json({ recharges: rows.map(serializeRecharge) });
});

// ─── GET /recharge/dashboard — Day Book stats for a chosen IST date ──────────
// Optional ?date=YYYY-MM-DD (IST). When omitted, returns "today" up to now.
router.get("/recharge/dashboard", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const userId = req.userId!;
    const dateStr = String(req.query.date ?? "").trim();
    const IST_OFFSET_MS = 330 * 60 * 1000;
    const nowMs = Date.now();
    const istNow = new Date(nowMs + IST_OFFSET_MS);
    const todayKey = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, "0")}-${String(istNow.getUTCDate()).padStart(2, "0")}`;

    let startOfDayUtc: Date;
    let endOfDayUtc: Date; // exclusive day-end (next-day 00:00 IST in UTC)
    let isToday: boolean;

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split("-").map(Number);
      const istStart = new Date(Date.UTC(y, m - 1, d));
      startOfDayUtc = new Date(istStart.getTime() - IST_OFFSET_MS);
      endOfDayUtc = new Date(startOfDayUtc.getTime() + 24 * 60 * 60 * 1000);
      isToday = dateStr === todayKey;
    } else {
      const istStart = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
      startOfDayUtc = new Date(istStart.getTime() - IST_OFFSET_MS);
      endOfDayUtc = new Date(startOfDayUtc.getTime() + 24 * 60 * 60 * 1000);
      isToday = true;
    }
    // For today, cap the upper bound at "now" so KPIs reflect intra-day reality.
    const upperBound = isToday ? new Date(nowMs) : endOfDayUtc;

    // Recharges in window: counts and sums
    const [r] = await db.select({
      total: sql<number>`count(*)::int`,
      successCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'success')::int`,
      failedCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'failed')::int`,
      pendingCount: sql<number>`count(*) filter (where ${rechargesTable.status} in ('pending','processing'))::int`,
      refundedCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'refunded')::int`,
      rechargeDebitPaise: sql<number>`coalesce(sum(${rechargesTable.amountPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
      profitPaise: sql<number>`coalesce(sum(${rechargesTable.commissionPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
      refundCreditPaise: sql<number>`coalesce(sum(${rechargesTable.amountPaise}) filter (where ${rechargesTable.status} = 'refunded'), 0)::bigint`,
    })
      .from(rechargesTable)
      .where(and(eq(rechargesTable.userId, userId), gte(rechargesTable.createdAt, startOfDayUtc), lt(rechargesTable.createdAt, upperBound)));

    // Wallet top-ups (success) in window
    const [t] = await db.select({
      walletTopupPaise: sql<number>`coalesce(sum(${walletTopupsTable.amountPaise}) filter (where ${walletTopupsTable.status} = 'success'), 0)::bigint`,
      walletTopupCount: sql<number>`count(*) filter (where ${walletTopupsTable.status} = 'success')::int`,
    })
      .from(walletTopupsTable)
      .where(and(eq(walletTopupsTable.userId, userId), gte(walletTopupsTable.createdAt, startOfDayUtc), lt(walletTopupsTable.createdAt, upperBound)));

    // Current wallet balance
    const [w] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);
    const currentBalancePaise = Number(w?.balancePaise ?? 0);

    // Opening balance: last ledger entry strictly before start-of-day
    const [openingRow] = await db.select({ bal: walletLedgerTable.balanceAfterPaise })
      .from(walletLedgerTable)
      .where(and(eq(walletLedgerTable.userId, userId), sql`${walletLedgerTable.createdAt} < ${startOfDayUtc}`))
      .orderBy(desc(walletLedgerTable.createdAt))
      .limit(1);
    const openingBalancePaise = Number(openingRow?.bal ?? 0);

    // Closing balance:
    //   - If today: current wallet balance.
    //   - If past day: last ledger entry strictly before end-of-day (fallback to opening).
    let closingBalancePaise = currentBalancePaise;
    if (!isToday) {
      const [closingRow] = await db.select({ bal: walletLedgerTable.balanceAfterPaise })
        .from(walletLedgerTable)
        .where(and(eq(walletLedgerTable.userId, userId), sql`${walletLedgerTable.createdAt} < ${endOfDayUtc}`))
        .orderBy(desc(walletLedgerTable.createdAt))
        .limit(1);
      closingBalancePaise = Number(closingRow?.bal ?? openingBalancePaise);
    }

    // Operator-wise report for the window
    const opRows = await db.select({
      operatorName: rechargesTable.operatorName,
      operatorCode: rechargesTable.operatorCode,
      type: rechargesTable.type,
      successCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'success')::int`,
      successAmountPaise: sql<number>`coalesce(sum(${rechargesTable.amountPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
      profitPaise: sql<number>`coalesce(sum(${rechargesTable.commissionPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
    })
      .from(rechargesTable)
      .where(and(eq(rechargesTable.userId, userId), gte(rechargesTable.createdAt, startOfDayUtc), lt(rechargesTable.createdAt, upperBound)))
      .groupBy(rechargesTable.operatorName, rechargesTable.operatorCode, rechargesTable.type)
      .orderBy(desc(sql`coalesce(sum(${rechargesTable.amountPaise}) filter (where ${rechargesTable.status} = 'success'), 0)`));

    res.json({
      day: { startUtc: startOfDayUtc.toISOString(), nowUtc: upperBound.toISOString(), endUtc: endOfDayUtc.toISOString(), tz: "Asia/Kolkata", isToday },
      wallet: {
        currentBalancePaise,
        openingBalancePaise,
        closingBalancePaise,
      },
      today: {
        totalCount: Number(r?.total ?? 0),
        successCount: Number(r?.successCount ?? 0),
        failedCount: Number(r?.failedCount ?? 0),
        pendingCount: Number(r?.pendingCount ?? 0),
        refundedCount: Number(r?.refundedCount ?? 0),
        rechargeDebitPaise: Number(r?.rechargeDebitPaise ?? 0),
        profitPaise: Number(r?.profitPaise ?? 0),
        refundCreditPaise: Number(r?.refundCreditPaise ?? 0),
        walletTopupPaise: Number(t?.walletTopupPaise ?? 0),
        walletTopupCount: Number(t?.walletTopupCount ?? 0),
      },
      operators: opRows.map((o) => ({
        operatorName: o.operatorName,
        operatorCode: o.operatorCode,
        type: o.type,
        successCount: Number(o.successCount),
        successAmountPaise: Number(o.successAmountPaise),
        profitPaise: Number(o.profitPaise),
      })),
    });
  } catch (e: any) {
    req.log.warn({ err: e?.message }, "recharge/dashboard failed");
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// ─── GET /recharge/earning — date-range commission/profit summary ────────────
// Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (IST, inclusive)
router.get("/recharge/earning", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const userId = req.userId!;
    const fromStr = String(req.query.from ?? "").trim();
    const toStr = String(req.query.to ?? "").trim();
    const IST_OFFSET_MS = 330 * 60 * 1000;
    const nowMs = Date.now();
    const istNow = new Date(nowMs + IST_OFFSET_MS);

    function dayStartUtc(s: string): Date | null {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      const [y, m, d] = s.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
    }
    const fromUtc = dayStartUtc(fromStr) ?? new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - IST_OFFSET_MS);
    const toStartUtc = dayStartUtc(toStr) ?? fromUtc;
    const toExclusiveUtc = new Date(toStartUtc.getTime() + 24 * 60 * 60 * 1000);
    if (toExclusiveUtc <= fromUtc) {
      res.status(400).json({ error: "Invalid date range" });
      return;
    }

    const [agg] = await db.select({
      successCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'success')::int`,
      successAmountPaise: sql<number>`coalesce(sum(${rechargesTable.amountPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
      profitPaise: sql<number>`coalesce(sum(${rechargesTable.commissionPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
      failedCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'failed')::int`,
      refundedCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'refunded')::int`,
    })
      .from(rechargesTable)
      .where(and(eq(rechargesTable.userId, userId), gte(rechargesTable.createdAt, fromUtc), lt(rechargesTable.createdAt, toExclusiveUtc)));

    const opRows = await db.select({
      operatorName: rechargesTable.operatorName,
      operatorCode: rechargesTable.operatorCode,
      type: rechargesTable.type,
      successCount: sql<number>`count(*) filter (where ${rechargesTable.status} = 'success')::int`,
      successAmountPaise: sql<number>`coalesce(sum(${rechargesTable.amountPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
      profitPaise: sql<number>`coalesce(sum(${rechargesTable.commissionPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint`,
    })
      .from(rechargesTable)
      .where(and(eq(rechargesTable.userId, userId), gte(rechargesTable.createdAt, fromUtc), lt(rechargesTable.createdAt, toExclusiveUtc)))
      .groupBy(rechargesTable.operatorName, rechargesTable.operatorCode, rechargesTable.type)
      .orderBy(desc(sql`coalesce(sum(${rechargesTable.commissionPaise}) filter (where ${rechargesTable.status} = 'success'), 0)`));

    // Day-wise (IST) breakdown for charting / row table
    const dayRows = await db.execute<{ day: string; success_count: number; success_amount_paise: string; profit_paise: string }>(sql`
      select to_char((${rechargesTable.createdAt} at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day,
             count(*) filter (where ${rechargesTable.status} = 'success')::int as success_count,
             coalesce(sum(${rechargesTable.amountPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint as success_amount_paise,
             coalesce(sum(${rechargesTable.commissionPaise}) filter (where ${rechargesTable.status} = 'success'), 0)::bigint as profit_paise
      from ${rechargesTable}
      where ${rechargesTable.userId} = ${userId}
        and ${rechargesTable.createdAt} >= ${fromUtc}
        and ${rechargesTable.createdAt} < ${toExclusiveUtc}
      group by 1
      order by 1 desc
    `);

    res.json({
      range: { from: fromStr || null, to: toStr || null, fromUtc: fromUtc.toISOString(), toExclusiveUtc: toExclusiveUtc.toISOString(), tz: "Asia/Kolkata" },
      summary: {
        successCount: Number(agg?.successCount ?? 0),
        successAmountPaise: Number(agg?.successAmountPaise ?? 0),
        profitPaise: Number(agg?.profitPaise ?? 0),
        failedCount: Number(agg?.failedCount ?? 0),
        refundedCount: Number(agg?.refundedCount ?? 0),
      },
      operators: opRows.map((o) => ({
        operatorName: o.operatorName,
        operatorCode: o.operatorCode,
        type: o.type,
        successCount: Number(o.successCount),
        successAmountPaise: Number(o.successAmountPaise),
        profitPaise: Number(o.profitPaise),
      })),
      days: (dayRows.rows ?? []).map((d: any) => ({
        day: d.day,
        successCount: Number(d.success_count),
        successAmountPaise: Number(d.success_amount_paise),
        profitPaise: Number(d.profit_paise),
      })),
    });
  } catch (e: any) {
    req.log.warn({ err: e?.message }, "recharge/earning failed");
    res.status(500).json({ error: "Failed to load earning report" });
  }
});

// ─── GET /recharge/search — find a transaction by number / TXID / order ID ───
// Query: ?q=... (matches accountNumber prefix, a1RequestId, a1OrderId, a1OperatorRef)
router.get("/recharge/search", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const userId = req.userId!;
    const q = String(req.query.q ?? "").trim();
    if (q.length < 3) {
      res.status(400).json({ error: "Enter at least 3 characters" });
      return;
    }
    const like = `%${q}%`;
    const rows = await db.select().from(rechargesTable)
      .where(and(
        eq(rechargesTable.userId, userId),
        or(
          ilike(rechargesTable.accountNumber, like),
          ilike(rechargesTable.a1RequestId, like),
          ilike(rechargesTable.a1OrderId, like),
          ilike(rechargesTable.a1OperatorRef, like),
        )!,
      ))
      .orderBy(desc(rechargesTable.createdAt))
      .limit(50);
    res.json({ query: q, count: rows.length, recharges: rows.map(serializeRecharge) });
  } catch (e: any) {
    req.log.warn({ err: e?.message }, "recharge/search failed");
    res.status(500).json({ error: "Search failed" });
  }
});

// ─── GET /recharge/:id — receipt ─────────────────────────────────────────────
router.get("/recharge/:id", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(rechargesTable).where(and(eq(rechargesTable.id, id), eq(rechargesTable.userId, userId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeRecharge(row));
});

// ─── POST /recharge/:id/status — manual status check (polls provider) ────────
router.post("/recharge/:id/status", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const id = parseInt(String(req.params.id), 10);
  const [row] = await db.select().from(rechargesTable).where(and(eq(rechargesTable.id, id), eq(rechargesTable.userId, userId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (["success", "failed", "refunded"].includes(row.status)) {
    res.json(serializeRecharge(row));
    return;
  }
  if (!isA1TopupConfigured()) {
    res.status(503).json({ error: "Provider unavailable" });
    return;
  }
  try {
    const a1 = await checkStatus(row.a1RequestId);
    const updated = await applyProviderResult(row.id, a1);
    res.json(serializeRecharge(updated));
  } catch (err: any) {
    req.log.error({ err }, "[recharge/status] poll failed");
    res.status(502).json({ error: err?.message ?? "Status poll failed" });
  }
});

// ─── POST /recharge/webhook — A1Topup callback ───────────────────────────────
router.post("/recharge/webhook", async (req, res): Promise<void> => {
  const sig = (req.headers["x-a1-signature"] as string | undefined)
           ?? (req.headers["x-signature"] as string | undefined);
  const raw = JSON.stringify(req.body ?? {});
  if (!verifyWebhookSig(raw, sig)) {
    req.log.warn({ sig }, "[recharge/webhook] bad signature");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  // A1Topup posts the same body shape as the recharge response. Echo orderid.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const orderId =
    (body.orderid as string | undefined) ?? (body.ORDERID as string | undefined) ??
    (body.OrderId as string | undefined);
  if (!orderId) {
    req.log.warn({ body }, "[recharge/webhook] no orderid");
    res.json({ ok: true });
    return;
  }
  const [row] = await db.select().from(rechargesTable).where(eq(rechargesTable.a1RequestId, String(orderId)));
  if (!row) {
    req.log.warn({ orderId }, "[recharge/webhook] no matching recharge");
    res.json({ ok: true });
    return;
  }
  // Build A1Response from raw
  const status = String(body.STATUS ?? body.status ?? "").toUpperCase();
  const a1: A1Response = {
    status: status === "1" || status === "SUCCESS" ? "success" :
            status === "3" || status === "FAILED" || status === "FAILURE" ? "failed" : "pending",
    rawStatusCode: status,
    message: String(body.MESSAGE ?? body.message ?? ""),
    a1OrderId: (body.TXNID ?? body.txnid) as string | undefined,
    operatorRef: (body.OPRID ?? body.oprid) as string | undefined,
    raw: body,
  };
  await applyProviderResult(row.id, a1);
  res.json({ ok: true });
});

function serializeRecharge(r: typeof rechargesTable.$inferSelect) {
  return {
    id: r.id,
    type: r.type,
    operatorCode: r.operatorCode,
    operatorName: r.operatorName,
    circleCode: r.circleCode,
    accountNumber: r.accountNumber,
    customerName: r.customerName,
    amountPaise: Number(r.amountPaise),
    commissionPaise: Number(r.commissionPaise),
    commissionTier: r.commissionTier,
    commissionPercentBp: r.commissionPercentBp,
    netCostPaise: Number(r.netCostPaise),
    status: r.status,
    a1RequestId: r.a1RequestId,
    a1OrderId: r.a1OrderId,
    a1OperatorRef: r.a1OperatorRef,
    errorReason: r.errorReason,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  };
}

export default router;
void walletsTable; void kycRecordsTable;
