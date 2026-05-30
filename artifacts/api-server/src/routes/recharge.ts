import { Router } from "express";
import { db, rechargesTable, walletsTable, kycRecordsTable, walletLedgerTable, walletTopupsTable, usersTable } from "@workspace/db";
import { sendRechargeSuccessEmail } from "../lib/mailer";
import { and, desc, eq, gte, lt, or, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { ensureWallet, debitWallet, creditWallet, WalletError } from "../lib/wallet-engine";
import { computeCommission, type RechargeType } from "../lib/commission-engine";
import { doRecharge, fetchBill, checkStatus, isA1TopupConfigured, OPERATORS, CIRCLES, verifyWebhookSig, type A1Response } from "../lib/a1topup";
import { getGlobalSettings } from "../lib/recharge-config";
import { getPrimeStatus } from "../lib/prime-status";
import { getUserOperatorTier, resolveCommissionTier } from "../lib/operator-tier";
import { verifyTpin, hasTpin, tpinRequiredFor } from "../lib/tpin";
import { detectMobileOperator } from "../lib/mobile-prefix";
import { detectViaEzytm } from "../lib/ezytm-detect";
import { getPlansForOperator } from "../lib/ezytm-plans";

const router = Router();

// Fire-and-forget recharge success email (looks up user, never throws)
function sendRechargeSuccessEmailSafe(userId: number, row: any): void {
  (async () => {
    try {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (!u?.email) return;
      await sendRechargeSuccessEmail({
        toEmail: u.email,
        toName: u.name || "Member",
        operatorName: row.operatorName,
        type: row.type,
        accountNumber: row.accountNumber,
        amountPaise: Number(row.amountPaise),
        transactionId: row.a1RequestId,
        completedAt: row.completedAt ?? new Date(),
        commissionPaise: Number(row.commissionPaise ?? 0),
      });
    } catch (e: any) {
      console.error("[recharge] email send failed:", e?.message ?? e);
    }
  })();
}

function genReqId(userId: number, type: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `R${type[0].toUpperCase()}${userId}${ts}${rnd}`;
}

// -- GET /recharge/operators -- operator + circle catalog --
router.get("/recharge/operators", async (_req, res) => {
  res.json({ operators: OPERATORS, circles: CIRCLES });
});

// -- GET /recharge/detect -- auto-detect operator + circle from mobile no. --
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
      req.log.warn({ err: (err as Error).message }, "[recharge/detect] ezytm threw -- falling back to prefix");
    }
  }

  const det = detectMobileOperator(number);
  res.json({ detection: det });
});

// -- GET /recharge/plans -- Ezytm plans browser --
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

// -- GET /recharge/quote -- preview commission for an amount --
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

// -- GET /recharge/bill-info -- fetch consumer name + due amount before payment --
router.get("/recharge/bill-info", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const operatorCode = String(req.query.operatorCode ?? "").trim();
  const consumerNumber = String(req.query.consumerNumber ?? "").trim();

  if (!operatorCode || !consumerNumber || consumerNumber.length < 4) {
    res.status(400).json({ error: "operatorCode and consumerNumber required" });
    return;
  }
  if (!isA1TopupConfigured()) {
    res.status(503).json({ error: "Recharge provider not configured" });
    return;
  }
  try {
    const info = await fetchBill({ operatorCode, consumerNumber });
    res.json({
      found: info.found,
      consumerName: info.consumerName ?? null,
      dueAmount: info.dueAmount ?? null,
      dueDate: info.dueDate ?? null,
      billNumber: info.billNumber ?? null,
      session: info.session ?? null,
    });
  } catch (err: any) {
    req.log.warn({ err: err?.message }, "[recharge/bill-info] fetch failed");
    res.json({ found: false, consumerName: null, dueAmount: null, dueDate: null, billNumber: null, session: null });
  }
});

// --- GET /recharge/debug-fetchbill  (admin only) ----------------------------
// Returns the full raw A1Topup fetchbill response so you can diagnose
// exactly what an operator (e.g. PGVCL) sends back and verify the session
// token is being captured correctly.
// Usage: GET /api/recharge/debug-fetchbill?operatorCode=PGVCL&consumerNumber=35211005414
router.get("/recharge/debug-fetchbill", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const operatorCode = String(req.query.operatorCode ?? "").trim();
  const consumerNumber = String(req.query.consumerNumber ?? "").trim();
  if (!operatorCode || !consumerNumber || consumerNumber.length < 4) {
    res.status(400).json({ error: "operatorCode and consumerNumber required" });
    return;
  }
  if (!isA1TopupConfigured()) {
    res.status(503).json({ error: "A1Topup not configured" });
    return;
  }
  try {
    const info = await fetchBill({ operatorCode, consumerNumber });
    res.json({
      found: info.found,
      consumerName: info.consumerName ?? null,
      dueAmount: info.dueAmount ?? null,
      dueDate: info.dueDate ?? null,
      billNumber: info.billNumber ?? null,
      session: info.session ?? null,
      sessionCaptured: !!info.session,
      // Full raw A1Topup response -- every field returned by the operator
      rawResponse: info.raw,
      rawKeys: Object.keys(info.raw),
      // All string values long enough to be a session token
      potentialSessionFields: Object.fromEntries(
        Object.entries(info.raw).filter(([, v]) => typeof v === "string" && (v as string).length >= 6)
      ),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "fetchbill failed" });
  }
});


// -- POST /recharge -- create + execute a recharge --
const rechargeBody = z.object({
  type: z.enum(["mobile", "dth", "bill"]),
  operatorCode: z.string().min(1),
  number: z.string().min(3).max(80),
  amountPaise: z.number().int().positive(),
  circleCode: z.string().optional(),
  customerName: z.string().max(200).optional(),
  idempotencyKey: z.string().min(8).max(120),
  tpin: z.string().optional(),
  /** Session token from fetchbill -- required by some utility operators (e.g. PGVCL) as value2 */
  billSession: z.string().optional(),
  /**
   * Override for A1Topup `value1`. When provided this replaces the default
   * (consumer/account number). Used for:
   *   - Insurance: Date of Birth (DD-MM-YYYY)
   *   - Mahanagar Gas: Bill Group Number
   *   - MSEDC Electricity: Billing Unit
   *   - Landline: STD Code
   */
  value1Override: z.string().optional(),
  /**
   * Override for A1Topup `value2`. When provided this replaces the default
   * (fetchbill session). Used for:
   *   - MSEDC Electricity: Processing Cycle
   *   - BSNL Landline: Account Number
   */
  value2Override: z.string().optional(),
});

router.post("/recharge", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = rechargeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid recharge request", details: parsed.error.format() });
    return;
  }
  const { type, operatorCode, number, amountPaise, circleCode, customerName, idempotencyKey, tpin, billSession, value1Override, value2Override } = parsed.data;

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
      error: `Amount must be between --${settings.minRechargePaise / 100} and --${settings.maxRechargePaise / 100}`,
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
    // unique violation on idempotencyKey -- re-read
    const [again] = await db.select().from(rechargesTable).where(and(eq(rechargesTable.userId, userId), eq(rechargesTable.idempotencyKey, idempotencyKey)));
    if (again) { res.json(serializeRecharge(again)); return; }
    throw err;
  }

  // --- Fresh fetchBill for electricity operators ---
  // A1Topup requires the session token from /recharge/fetchbill as `value2`
  // on the actual recharge call for Gujarat and other electricity operators
  // (PGVCL, MGVCL, DGVCL, UGVCL, etc.).  When this session is missing A1Topup
  // returns "Paramenter is missing" and immediately refunds the transaction.
  //
  // Strategy: always do a FRESH fetchBill call right here (before debiting
  // the wallet) so the session is never stale and the consumer number is
  // validated against the operator one final time.
  //   - Session found     -> use it as value2; proceed to debit + recharge.
  //   - No session + not found -> fail-fast, mark row failed, return 422.
  //     No wallet debit occurs -- user keeps their money.
  //   - fetchBill network error -> log and proceed with whatever session the
  //     frontend already captured (don't hard-block on transient failures).
  const ELECTRICITY_OPS = new Set([
    'PGVCL', 'MGVCL', 'DGVCL', 'UGVCL',
    'TORRENTAHM', 'TORRENTSUR', 'TORRENTSHI', 'TORRENTBHI', 'TORRENTDAH',
    'BSES', 'BSESY', 'TPD', 'TPDM', 'BEST', 'BMESTU', 'NP',
    'HESCOM', 'BESCOM', 'KSEB', 'UPPCLU', 'UPPCLR',
    'WBSEDCL', 'TNEB', 'MSEDC', 'SNDL', 'AJV', 'JVV', 'JDVV',
  ]);
  let resolvedBillSession: string | undefined = billSession?.trim() || undefined;

  if (type === 'bill' && ELECTRICITY_OPS.has(operatorCode) && isA1TopupConfigured()) {
    try {
      // Retry up to 3 times -- A1Topup fetchBill can be intermittent.
      // We also pass value1=acct because some Gujarat operators (PGVCL, MGVCL,
      // DGVCL, UGVCL) require the consumer number in both `number` and `value1`.
      let fb: Awaited<ReturnType<typeof fetchBill>> | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          fb = await fetchBill({ operatorCode, consumerNumber: acct, value1: acct });
          req.log.info({ op: operatorCode, attempt, found: fb.found, hasSession: !!fb.session, rawKeys: Object.keys(fb.raw) }, '[recharge] freshFetchBill attempt');
          if (fb.session || fb.found) break; // Got a useful response -- stop retrying
          if (attempt < 3) await new Promise(r => setTimeout(r, 1500 * attempt));
        } catch (err: any) {
          req.log.warn({ err: err?.message, op: operatorCode, attempt }, '[recharge] freshFetchBill threw');
          if (attempt === 3) fb = null;
          else await new Promise(r => setTimeout(r, 1500 * attempt));
        }
      }

      if (!fb) {
        // All attempts threw -- network error; proceed with existing session if any
        req.log.warn({ op: operatorCode }, '[recharge] freshFetchBill: all attempts failed -- proceeding with existing session');
      } else if (fb.session) {
        resolvedBillSession = fb.session;
        req.log.info({ op: operatorCode, sessionLen: fb.session.length }, '[recharge] freshFetchBill: session captured OK');
      } else if (!fb.found) {
        // fetchBill returned "not found" after all retries.
        // For electricity operators A1Topup requires the session token (value2)
        // from fetchBill. Without it, A1Topup returns "Paramenter is missing"
        // and immediately refunds -- confusing for operators.
        // Fail-fast here (before wallet debit) with a clear error instead.
        if (ELECTRICITY_OPS.has(operatorCode)) {
          req.log.warn({ op: operatorCode, acct }, '[recharge] freshFetchBill: no session after retries -- blocking electricity recharge');
          await db.update(rechargesTable)
            .set({ status: 'failed', errorReason: 'Consumer number could not be verified by the electricity provider. Please double-check the number and try again.', updatedAt: new Date(), completedAt: new Date() })
            .where(eq(rechargesTable.id, rechargeRow.id));
          res.status(422).json({ error: 'Consumer number could not be verified. Please check the number and try again.', code: 'CONSUMER_NOT_FOUND' });
          return;
        }
        // Non-electricity operators: session not required, proceed normally.
        req.log.warn({ op: operatorCode, acct, rawKeys: Object.keys(fb.raw) }, '[recharge] freshFetchBill: not found -- proceeding without session');
      } else {
        // found:true but no session -- operator does not need it; proceed normally
        req.log.info({ op: operatorCode }, '[recharge] freshFetchBill: found but no session -- proceeding without value2');
      }
    } catch (err: any) {
      req.log.warn({ err: err?.message, op: operatorCode }, '[recharge] freshFetchBill outer error -- proceeding with existing session');
    }
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
      note: `${op.name} ${type} -- ${acct}`,
    });
    debitLedgerId = d.ledgerEntryId;
    await db.update(rechargesTable)
      .set({ status: "processing", debitLedgerId, updatedAt: new Date() })
      .where(eq(rechargesTable.id, rechargeRow.id));
  } catch (err: any) {
    await db.update(rechargesTable)
      .set({ 
