/**
 * Money Transfer (DMT) routes — wraps A1Topup money endpoints.
 *
 * Flow:
 *   1. POST /api/money/sender/lookup       → search existing sender by mobile
 *   2. POST /api/money/sender/register     → register new sender
 *   3. GET  /api/money/beneficiaries       → list local beneficiaries
 *   4. POST /api/money/beneficiaries       → add new beneficiary (calls A1)
 *   5. POST /api/money/beneficiaries/:id/verify → OTP verify
 *   6. POST /api/money/beneficiaries/:id/penny-drop → bank verify
 *   7. POST /api/money/transfer            → IMPS/NEFT transfer
 *   8. GET  /api/money/transfers           → history
 */
import { Router } from "express";
import {
  db, dmtSendersTable, dmtBeneficiariesTable, dmtTransfersTable,
  walletsTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { ensureWallet, debitWallet, creditWallet, WalletError } from "../lib/wallet-engine";
import {
  isA1TopupConfigured,
  dmtSenderRegistration, dmtSearchBeneficiary, dmtAddBeneficiary,
  dmtVerifyBeneficiary, dmtVerifyBank, dmtTransfer,
} from "../lib/a1topup";
import { verifyTpin, hasTpin, tpinRequiredFor } from "../lib/tpin";

const router = Router();

function genOrderId(userId: number, prefix: "DMT" | "VRF" = "DMT"): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}${userId}${ts}${rnd}`;
}

function requireProvider(res: any): boolean {
  if (!isA1TopupConfigured()) {
    res.status(503).json({ error: "Money transfer provider not configured", code: "PROVIDER_UNAVAILABLE" });
    return false;
  }
  return true;
}

// ─── 1. Sender lookup (and pull beneficiaries from A1Topup) ──────────────────
router.post("/money/sender/lookup", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const parse = z.object({ senderMobile: z.string().regex(/^[6-9]\d{9}$/) }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid mobile number" }); return; }
  if (!requireProvider(res)) return;

  const { senderMobile } = parse.data;
  try {
    const r = await dmtSearchBeneficiary({ senderMobile });

    // Persist local sender row if A1Topup recognises this mobile.
    let senderRow = (await db.select().from(dmtSendersTable)
      .where(and(eq(dmtSendersTable.userId, userId), eq(dmtSendersTable.senderMobile, senderMobile))))[0];

    const a1Sender = r.sender;
    if (r.ok && (a1Sender || r.beneficiaries?.length)) {
      if (!senderRow) {
        [senderRow] = await db.insert(dmtSendersTable).values({
          userId,
          senderMobile,
          name: a1Sender?.name ?? "",
          pincode: "",
          a1SenderId: r.senderId ?? null,
          monthlyLimitPaise: a1Sender?.limit ? a1Sender.limit * 100 : null,
          monthlyUsedPaise: a1Sender?.used ? a1Sender.used * 100 : 0,
          status: "registered",
          rawResponse: r.raw,
        }).returning();
      } else {
        await db.update(dmtSendersTable).set({
          name: a1Sender?.name || senderRow.name,
          a1SenderId: r.senderId ?? senderRow.a1SenderId,
          monthlyLimitPaise: a1Sender?.limit ? a1Sender.limit * 100 : senderRow.monthlyLimitPaise,
          monthlyUsedPaise: a1Sender?.used ? a1Sender.used * 100 : senderRow.monthlyUsedPaise,
          status: "registered",
          rawResponse: r.raw,
          updatedAt: new Date(),
        }).where(eq(dmtSendersTable.id, senderRow.id));
      }

      // Sync beneficiaries from A1
      if (senderRow && r.beneficiaries?.length) {
        for (const b of r.beneficiaries) {
          if (!b.accountNumber || !b.ifsc) continue;
          await db.insert(dmtBeneficiariesTable).values({
            userId,
            senderId: senderRow.id,
            a1BenId: b.benId || null,
            benName: b.name || "Beneficiary",
            benMobile: b.mobile ?? null,
            accountNumber: b.accountNumber,
            ifsc: b.ifsc,
            bankName: b.bankName ?? null,
            verified: b.verified ? 1 : 0,
            rawResponse: b.raw,
          }).onConflictDoNothing();
        }
      }
    }

    const sender = senderRow ? (await db.select().from(dmtSendersTable).where(eq(dmtSendersTable.id, senderRow.id)))[0] : null;
    const beneficiaries = sender
      ? await db.select().from(dmtBeneficiariesTable).where(eq(dmtBeneficiariesTable.senderId, sender.id))
      : [];
    res.json({ exists: !!sender, sender, beneficiaries, providerMessage: r.message });
  } catch (err: any) {
    req.log.error({ err }, "[money] sender lookup failed");
    res.status(502).json({ error: err?.message ?? "Sender lookup failed" });
  }
});

// ─── 2. Sender registration ──────────────────────────────────────────────────
router.post("/money/sender/register", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const parse = z.object({
    senderMobile: z.string().regex(/^[6-9]\d{9}$/),
    name: z.string().min(2).max(120),
    pincode: z.string().regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid sender details", details: parse.error.format() }); return; }
  if (!requireProvider(res)) return;

  try {
    const r = await dmtSenderRegistration(parse.data);

    // Detect A1Topup "silent rejection" signature for sender registration:
    //   {txid:null, status:null, message:null, Sender_name:"...", pincode:"...",
    //    sender_mobile:"..."}  ← only echoes inputs, NO sender_id / txid → not registered.
    // This usually means the A1Topup retailer account doesn't have DMT enabled,
    // an OTP-based sender on-boarding step is required, or additional KYC fields
    // are needed. We surface a clear diagnostic instead of a fake success.
    const rawAny = r.raw as Record<string, unknown>;
    const echoedInput =
      typeof rawAny.Sender_name === "string" || typeof rawAny.sender_name === "string" ||
      rawAny.pincode != null || rawAny.sender_mobile != null;
    const senderIdMissing = !r.senderId
      && (rawAny.sender_id === null || rawAny.sender_id === undefined || rawAny.sender_id === "")
      && (rawAny.senderid === null || rawAny.senderid === undefined || rawAny.senderid === "");
    const txidMissing = !r.txid
      && (rawAny.txid === null || rawAny.txid === undefined || rawAny.txid === "");
    const silentlyRejected = !r.ok && echoedInput && senderIdMissing && txidMissing
      && (r.statusCode === "" || r.statusCode === "null");

    if (silentlyRejected) {
      req.log.warn(
        { senderMobile: parse.data.senderMobile, raw: r.raw },
        "[money] sender registration silently rejected (echo-only response, no sender_id/txid)"
      );
      res.status(400).json({
        error: "Sender registration was not accepted by the money-transfer provider. The provider returned an echo-only response without a sender ID. Possible causes: (1) DMT is not enabled on the provider account, (2) the sender requires OTP-based on-boarding which this provider build does not support yet, or (3) additional KYC fields are required. Please contact A1Topup support to enable DMT / confirm the registration flow for this account.",
        code: "SENDER_REGISTRATION_NOT_ACCEPTED",
        providerStatus: r.statusCode,
        providerMessage: r.message,
        raw: r.raw,
      });
      return;
    }

    if (!r.ok) {
      const providerSnippet = (() => {
        try { return JSON.stringify(r.raw).slice(0, 280); } catch { return ""; }
      })();
      const errMsg = r.message
        || (r.statusCode ? `Provider rejected (status: ${r.statusCode})` : "")
        || (providerSnippet ? `Provider response: ${providerSnippet}` : "Registration failed");
      req.log.warn({ providerStatus: r.statusCode, providerMessage: r.message, raw: r.raw }, "[money] sender registration rejected by provider");
      res.status(400).json({ error: errMsg, providerStatus: r.statusCode, providerMessage: r.message, raw: r.raw });
      return;
    }

    const [row] = await db.insert(dmtSendersTable).values({
      userId,
      senderMobile: parse.data.senderMobile,
      name: parse.data.name,
      pincode: parse.data.pincode,
      a1SenderId: r.senderId ?? null,
      status: "registered",
      rawResponse: r.raw,
    }).onConflictDoUpdate({
      target: [dmtSendersTable.userId, dmtSendersTable.senderMobile],
      set: { name: parse.data.name, pincode: parse.data.pincode, a1SenderId: r.senderId ?? null, rawResponse: r.raw, updatedAt: new Date() },
    }).returning();

    res.json({ sender: row, providerMessage: r.message });
  } catch (err: any) {
    req.log.error({ err }, "[money] sender register failed");
    res.status(502).json({ error: err?.message ?? "Registration failed" });
  }
});

// ─── 3. List beneficiaries (local) ───────────────────────────────────────────
router.get("/money/beneficiaries", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const senderId = Number(req.query.senderId);
  if (!senderId) { res.status(400).json({ error: "senderId required" }); return; }
  const [sender] = await db.select().from(dmtSendersTable)
    .where(and(eq(dmtSendersTable.id, senderId), eq(dmtSendersTable.userId, userId)));
  if (!sender) { res.status(404).json({ error: "Sender not found" }); return; }
  const items = await db.select().from(dmtBeneficiariesTable)
    .where(eq(dmtBeneficiariesTable.senderId, senderId)).orderBy(desc(dmtBeneficiariesTable.createdAt));
  res.json({ items });
});

// ─── 4. Add beneficiary ──────────────────────────────────────────────────────
router.post("/money/beneficiaries", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const parse = z.object({
    senderId: z.number().int().positive(),
    benName: z.string().min(2).max(120),
    benMobile: z.string().regex(/^[6-9]\d{9}$/).optional(),
    accountNumber: z.string().min(6).max(25).regex(/^\d+$/),
    ifsc: z.string().min(11).max(11).regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
    bankName: z.string().max(120).optional(),
  }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid beneficiary details", details: parse.error.format() }); return; }
  if (!requireProvider(res)) return;

  const [sender] = await db.select().from(dmtSendersTable)
    .where(and(eq(dmtSendersTable.id, parse.data.senderId), eq(dmtSendersTable.userId, userId)));
  if (!sender) { res.status(404).json({ error: "Sender not found" }); return; }

  try {
    const r = await dmtAddBeneficiary({
      senderMobile: sender.senderMobile,
      benName: parse.data.benName,
      benMobile: parse.data.benMobile,
      accountNumber: parse.data.accountNumber,
      ifsc: parse.data.ifsc,
    });

    // Detect A1Topup "sender not registered" signature:
    //   {status:null, message:null, beneficiaryName:"...", ben_id:null, ifscCode:null, ...}
    // i.e. provider echoed back our input but produced no ben_id and no ifsc back.
    const rawAny = r.raw as Record<string, unknown>;
    const echoedInput =
      typeof rawAny.beneficiaryName === "string" ||
      typeof rawAny.beneficiaryAccountNumber === "string" ||
      typeof rawAny.beneficiaryMobileNumber === "string";
    const benIdMissing = rawAny.ben_id === null || rawAny.ben_id === undefined || rawAny.ben_id === "";
    const ifscMissing = (rawAny.ifscCode === null || rawAny.ifscCode === undefined || rawAny.ifscCode === "")
      && (rawAny.ifsc_code === null || rawAny.ifsc_code === undefined || rawAny.ifsc_code === "");
    const senderNotRegisteredAtProvider = !r.ok && echoedInput && benIdMissing && ifscMissing
      && (r.statusCode === "" || r.statusCode === "null");

    if (senderNotRegisteredAtProvider) {
      // Mark local sender row as not-registered so the UI re-prompts.
      await db.update(dmtSendersTable).set({
        status: "not_registered", updatedAt: new Date(),
      }).where(eq(dmtSendersTable.id, sender.id));

      req.log.warn(
        { senderMobile: sender.senderMobile, raw: r.raw },
        "[money] sender not registered at provider (add_beneficiary echo-only response)"
      );
      res.status(400).json({
        error: "Sender mobile is not registered with the money transfer provider. Please complete Sender Registration first.",
        code: "SENDER_NOT_REGISTERED_AT_PROVIDER",
        providerStatus: r.statusCode,
        providerMessage: r.message,
        raw: r.raw,
      });
      return;
    }

    if (!r.ok) {
      const providerSnippet = (() => {
        try { return JSON.stringify(r.raw).slice(0, 280); } catch { return ""; }
      })();
      const errMsg = r.message
        || (r.statusCode ? `Provider rejected (status: ${r.statusCode})` : "")
        || (providerSnippet ? `Provider response: ${providerSnippet}` : "Add beneficiary failed");
      req.log.warn({ providerStatus: r.statusCode, providerMessage: r.message, raw: r.raw }, "[money] add beneficiary rejected by provider");
      res.status(400).json({ error: errMsg, providerStatus: r.statusCode, providerMessage: r.message, raw: r.raw });
      return;
    }

    const [row] = await db.insert(dmtBeneficiariesTable).values({
      userId,
      senderId: sender.id,
      a1BenId: r.benId ?? null,
      benName: parse.data.benName,
      benMobile: parse.data.benMobile ?? null,
      accountNumber: parse.data.accountNumber,
      ifsc: parse.data.ifsc.toUpperCase(),
      bankName: parse.data.bankName ?? null,
      verified: 0,
      rawResponse: r.raw,
    }).onConflictDoUpdate({
      target: [dmtBeneficiariesTable.senderId, dmtBeneficiariesTable.accountNumber, dmtBeneficiariesTable.ifsc],
      set: {
        a1BenId: r.benId ?? null,
        benName: parse.data.benName,
        benMobile: parse.data.benMobile ?? null,
        rawResponse: r.raw, updatedAt: new Date(),
      },
    }).returning();
    res.json({ beneficiary: row, providerMessage: r.message });
  } catch (err: any) {
    req.log.error({ err }, "[money] add beneficiary failed");
    res.status(502).json({ error: err?.message ?? "Add beneficiary failed" });
  }
});

// ─── 5. Verify beneficiary OTP ───────────────────────────────────────────────
router.post("/money/beneficiaries/:id/verify", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const id = Number(req.params.id);
  const parse = z.object({ otp: z.string().min(4).max(8) }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid OTP" }); return; }
  if (!requireProvider(res)) return;

  const [ben] = await db.select().from(dmtBeneficiariesTable)
    .where(and(eq(dmtBeneficiariesTable.id, id), eq(dmtBeneficiariesTable.userId, userId)));
  if (!ben) { res.status(404).json({ error: "Beneficiary not found" }); return; }
  const [sender] = await db.select().from(dmtSendersTable).where(eq(dmtSendersTable.id, ben.senderId));
  if (!sender) { res.status(404).json({ error: "Sender not found" }); return; }
  if (!ben.a1BenId) { res.status(400).json({ error: "Beneficiary has no provider id; cannot verify" }); return; }

  try {
    const r = await dmtVerifyBeneficiary({ senderMobile: sender.senderMobile, benId: ben.a1BenId, otp: parse.data.otp });
    if (!r.ok) { res.status(400).json({ error: r.message || "Verification failed", raw: r.raw }); return; }
    await db.update(dmtBeneficiariesTable).set({ verified: 1, rawResponse: r.raw, updatedAt: new Date() })
      .where(eq(dmtBeneficiariesTable.id, ben.id));
    res.json({ ok: true, providerMessage: r.message });
  } catch (err: any) {
    req.log.error({ err }, "[money] verify beneficiary failed");
    res.status(502).json({ error: err?.message ?? "Verification failed" });
  }
});

// ─── 6. Penny-drop / bank verify ─────────────────────────────────────────────
router.post("/money/beneficiaries/:id/penny-drop", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const id = Number(req.params.id);
  if (!requireProvider(res)) return;
  const [ben] = await db.select().from(dmtBeneficiariesTable)
    .where(and(eq(dmtBeneficiariesTable.id, id), eq(dmtBeneficiariesTable.userId, userId)));
  if (!ben) { res.status(404).json({ error: "Beneficiary not found" }); return; }
  const [sender] = await db.select().from(dmtSendersTable).where(eq(dmtSendersTable.id, ben.senderId));
  if (!sender) { res.status(404).json({ error: "Sender not found" }); return; }

  try {
    const orderId = genOrderId(userId, "VRF");
    const r = await dmtVerifyBank({
      senderMobile: sender.senderMobile,
      accountNumber: ben.accountNumber,
      ifsc: ben.ifsc,
      orderId,
    });
    res.json({ ok: r.ok, status: r.status, message: r.message, raw: r.raw });
  } catch (err: any) {
    req.log.error({ err }, "[money] penny-drop failed");
    res.status(502).json({ error: err?.message ?? "Bank verification failed" });
  }
});

// ─── 7. Transfer money ───────────────────────────────────────────────────────
router.post("/money/transfer", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const parse = z.object({
    beneficiaryId: z.number().int().positive(),
    amountPaise: z.number().int().min(1000).max(2500000),  // ₹10 to ₹25,000 (DMT cap)
    mode: z.enum(["IMPS", "NEFT"]),
    idempotencyKey: z.string().min(8).max(120),
    tpin: z.string().optional(),
  }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid transfer", details: parse.error.format() }); return; }
  if (!requireProvider(res)) return;

  const { beneficiaryId, amountPaise, mode, idempotencyKey, tpin } = parse.data;

  // Idempotency
  const [existing] = await db.select().from(dmtTransfersTable)
    .where(and(eq(dmtTransfersTable.userId, userId), eq(dmtTransfersTable.idempotencyKey, idempotencyKey)));
  if (existing) { res.json({ transfer: existing }); return; }

  const [ben] = await db.select().from(dmtBeneficiariesTable)
    .where(and(eq(dmtBeneficiariesTable.id, beneficiaryId), eq(dmtBeneficiariesTable.userId, userId)));
  if (!ben) { res.status(404).json({ error: "Beneficiary not found" }); return; }
  const [sender] = await db.select().from(dmtSendersTable).where(eq(dmtSendersTable.id, ben.senderId));
  if (!sender) { res.status(404).json({ error: "Sender not found" }); return; }
  if (!ben.a1BenId) { res.status(400).json({ error: "Beneficiary not registered with provider" }); return; }

  // Charge: 1% (min ₹5, max ₹25) — common DMT slab
  const chargePaise = Math.min(2500, Math.max(500, Math.round(amountPaise * 0.01)));
  const totalDebitPaise = amountPaise + chargePaise;
  // Operator earns ~30% of charge as commission
  const commissionPaise = Math.round(chargePaise * 0.30);

  // Wallet & T-PIN
  const wallet = await ensureWallet(userId);
  if (wallet.isFrozen) { res.status(403).json({ error: wallet.freezeReason || "Wallet frozen", code: "WALLET_FROZEN" }); return; }
  const needTpin = await tpinRequiredFor(userId, totalDebitPaise);
  if (needTpin) {
    if (!(await hasTpin(userId))) { res.status(400).json({ error: "T-PIN must be set up", code: "TPIN_NOT_SET" }); return; }
    if (!tpin) { res.status(400).json({ error: "T-PIN required", code: "TPIN_REQUIRED" }); return; }
    if (!(await verifyTpin(userId, tpin))) { res.status(401).json({ error: "Invalid T-PIN", code: "TPIN_INVALID" }); return; }
  }

  const orderId = genOrderId(userId);
  // Insert pending row
  let row;
  try {
    [row] = await db.insert(dmtTransfersTable).values({
      userId,
      walletId: wallet.id,
      senderId: sender.id,
      beneficiaryId: ben.id,
      mode,
      amountPaise,
      chargePaise,
      commissionPaise,
      netCostPaise: totalDebitPaise - commissionPaise,
      benName: ben.benName,
      accountNumber: ben.accountNumber,
      ifsc: ben.ifsc,
      status: "pending",
      a1RequestId: orderId,
      idempotencyKey,
    }).returning();
  } catch (err: any) {
    const [again] = await db.select().from(dmtTransfersTable)
      .where(and(eq(dmtTransfersTable.userId, userId), eq(dmtTransfersTable.idempotencyKey, idempotencyKey)));
    if (again) { res.json({ transfer: again }); return; }
    throw err;
  }

  // Debit wallet (amount + charge)
  let debitLedgerId: number;
  try {
    const d = await debitWallet(userId, {
      type: "recharge_debit",
      amountPaise: totalDebitPaise,
      refType: "recharge",  // ledger refType reused
      refId: row.id,
      refCode: orderId,
      note: `DMT ${mode} ₹${amountPaise/100} → ${ben.benName} (${ben.accountNumber})`,
    });
    debitLedgerId = d.ledgerEntryId;
    await db.update(dmtTransfersTable).set({ status: "processing", debitLedgerId, updatedAt: new Date() })
      .where(eq(dmtTransfersTable.id, row.id));
  } catch (err: any) {
    await db.update(dmtTransfersTable).set({ status: "failed", errorReason: err?.message ?? "Debit failed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(dmtTransfersTable.id, row.id));
    if (err instanceof WalletError) { res.status(402).json({ error: err.message, code: err.code }); return; }
    throw err;
  }

  // Call A1
  try {
    const r = await dmtTransfer({
      senderMobile: sender.senderMobile,
      benId: ben.a1BenId,
      amountRupees: amountPaise / 100,
      mode,
      orderId,
    });

    if (r.status === "success") {
      await db.update(dmtTransfersTable).set({
        status: "success",
        a1TxnId: r.txid ?? null,
        a1OperatorRef: r.opid ?? null,
        a1ResponseCode: r.statusCode,
        responseRaw: r.raw,
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(dmtTransfersTable.id, row.id));

      // Credit commission
      if (commissionPaise > 0) {
        const c = await creditWallet(userId, {
          type: "commission",
          amountPaise: commissionPaise,
          refType: "recharge",
          refId: row.id,
          refCode: orderId,
          note: `DMT commission: ${ben.benName}`,
        });
        await db.update(dmtTransfersTable).set({ commissionLedgerId: c.ledgerEntryId, updatedAt: new Date() })
          .where(eq(dmtTransfersTable.id, row.id));
      }
    } else if (r.status === "failed") {
      await db.update(dmtTransfersTable).set({
        status: "refunded",
        a1ResponseCode: r.statusCode,
        responseRaw: r.raw,
        errorReason: r.message || "Transfer failed",
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(dmtTransfersTable.id, row.id));

      // Refund full amount + charge
      const ref = await creditWallet(userId, {
        type: "recharge_refund",
        amountPaise: totalDebitPaise,
        refType: "recharge",
        refId: row.id,
        refCode: orderId,
        note: `DMT refund: ${ben.benName} — ${r.message || "failed"}`,
      });
      await db.update(dmtTransfersTable).set({ refundLedgerId: ref.ledgerEntryId, updatedAt: new Date() })
        .where(eq(dmtTransfersTable.id, row.id));
    } else {
      await db.update(dmtTransfersTable).set({
        status: "processing",
        a1TxnId: r.txid ?? null,
        a1OperatorRef: r.opid ?? null,
        a1ResponseCode: r.statusCode,
        responseRaw: r.raw,
        updatedAt: new Date(),
      }).where(eq(dmtTransfersTable.id, row.id));
    }
  } catch (err: any) {
    req.log.error({ err, orderId }, "[money] transfer call failed");
    await db.update(dmtTransfersTable).set({
      status: "processing",
      errorReason: `Provider error: ${err?.message ?? err}`,
      updatedAt: new Date(),
    }).where(eq(dmtTransfersTable.id, row.id));
  }

  const [final] = await db.select().from(dmtTransfersTable).where(eq(dmtTransfersTable.id, row.id));
  res.json({ transfer: final });
});

// ─── 8. Transfer history ─────────────────────────────────────────────────────
router.get("/money/transfers", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const limit = Math.min(100, Number(req.query.limit) || 50);
  const items = await db.select().from(dmtTransfersTable)
    .where(eq(dmtTransfersTable.userId, userId))
    .orderBy(desc(dmtTransfersTable.createdAt))
    .limit(limit);
  res.json({ items });
});

// ─── Bank list (NPCI IMPS member banks — supported by A1Topup DMT) ───────────
// Source: NPCI IMPS bank list (https://www.npci.org.in/what-we-do/imps/live-members)
// All banks below support IMPS / NEFT and are valid for A1Topup money transfer.
const IMPS_BANKS: ReadonlyArray<{ code: string; name: string }> = [
  // Public Sector Banks
  { code: "SBIN", name: "State Bank of India" },
  { code: "PUNB", name: "Punjab National Bank" },
  { code: "BARB", name: "Bank of Baroda" },
  { code: "CNRB", name: "Canara Bank" },
  { code: "UBIN", name: "Union Bank of India" },
  { code: "IOBA", name: "Indian Overseas Bank" },
  { code: "BKID", name: "Bank of India" },
  { code: "CBIN", name: "Central Bank of India" },
  { code: "UCBA", name: "UCO Bank" },
  { code: "MAHB", name: "Bank of Maharashtra" },
  { code: "IDIB", name: "Indian Bank" },
  { code: "PSIB", name: "Punjab & Sind Bank" },
  { code: "IBKL", name: "IDBI Bank" },

  // Major Private Sector Banks
  { code: "HDFC", name: "HDFC Bank" },
  { code: "ICIC", name: "ICICI Bank" },
  { code: "AXIS", name: "Axis Bank" },
  { code: "KKBK", name: "Kotak Mahindra Bank" },
  { code: "INDB", name: "IndusInd Bank" },
  { code: "YESB", name: "Yes Bank" },
  { code: "IDFB", name: "IDFC First Bank" },
  { code: "FDRL", name: "Federal Bank" },
  { code: "RATN", name: "RBL Bank" },
  { code: "BDBL", name: "Bandhan Bank" },
  { code: "CIUB", name: "City Union Bank" },
  { code: "DCBL", name: "DCB Bank" },
  { code: "DLXB", name: "Dhanlaxmi Bank" },
  { code: "ESFB", name: "Equitas Small Finance Bank" },
  { code: "ESMF", name: "ESAF Small Finance Bank" },
  { code: "JAKA", name: "Jammu & Kashmir Bank" },
  { code: "KARB", name: "Karnataka Bank" },
  { code: "KVBL", name: "Karur Vysya Bank" },
  { code: "LAVB", name: "Lakshmi Vilas Bank" },
  { code: "NTBL", name: "Nainital Bank" },
  { code: "SIBL", name: "South Indian Bank" },
  { code: "TMBL", name: "Tamilnad Mercantile Bank" },
  { code: "UTBI", name: "United Bank of India" },

  // Small Finance Banks
  { code: "AUBL", name: "AU Small Finance Bank" },
  { code: "FINO", name: "Fino Payments Bank" },
  { code: "JSFB", name: "Jana Small Finance Bank" },
  { code: "SURY", name: "Suryoday Small Finance Bank" },
  { code: "UJVN", name: "Ujjivan Small Finance Bank" },
  { code: "UTKS", name: "Utkarsh Small Finance Bank" },
  { code: "NESF", name: "North East Small Finance Bank" },
  { code: "CSFB", name: "Capital Small Finance Bank" },
  { code: "UNTY", name: "Unity Small Finance Bank" },
  { code: "SHIV", name: "Shivalik Small Finance Bank" },

  // Payments Banks
  { code: "AIRP", name: "Airtel Payments Bank" },
  { code: "PYTM", name: "Paytm Payments Bank" },
  { code: "IPOS", name: "India Post Payments Bank" },
  { code: "JIOP", name: "Jio Payments Bank" },
  { code: "NSPB", name: "NSDL Payments Bank" },

  // Foreign Banks
  { code: "CITI", name: "Citibank" },
  { code: "SCBL", name: "Standard Chartered Bank" },
  { code: "HSBC", name: "HSBC Bank" },
  { code: "DEUT", name: "Deutsche Bank" },
  { code: "DBSS", name: "DBS Bank India" },
  { code: "BARC", name: "Barclays Bank" },
  { code: "BOFA", name: "Bank of America" },
  { code: "BNPA", name: "BNP Paribas" },
  { code: "RBOS", name: "Royal Bank of Scotland" },
  { code: "MSBC", name: "Mizuho Bank" },
  { code: "SMBC", name: "Sumitomo Mitsui Banking Corporation" },
  { code: "ABNA", name: "RBS N.V." },
  { code: "JPCB", name: "JPMorgan Chase Bank" },
  { code: "AKBK", name: "AB Bank" },
  { code: "SBMB", name: "SBM Bank India" },

  // State / Regional Cooperative Banks
  { code: "ABHY", name: "Abhyudaya Cooperative Bank" },
  { code: "APBL", name: "Apna Sahakari Bank" },
  { code: "BACB", name: "Bharat Cooperative Bank" },
  { code: "BCBM", name: "Bombay Mercantile Cooperative Bank" },
  { code: "COSB", name: "Cosmos Cooperative Bank" },
  { code: "GSCB", name: "Gujarat State Cooperative Bank" },
  { code: "AMCB", name: "Ahmedabad Mercantile Cooperative Bank" },
  { code: "GBCB", name: "Greater Bombay Cooperative Bank" },
  { code: "JSBP", name: "Janata Sahakari Bank Pune" },
  { code: "KJSB", name: "Kalupur Commercial Cooperative Bank" },
  { code: "KCCB", name: "Kalyan Janata Sahakari Bank" },
  { code: "MCBL", name: "Mehsana Urban Cooperative Bank" },
  { code: "MSCI", name: "Maharashtra State Cooperative Bank" },
  { code: "NKGS", name: "NKGSB Cooperative Bank" },
  { code: "PMCB", name: "Punjab & Maharashtra Cooperative Bank" },
  { code: "RSCB", name: "Rajasthan State Cooperative Bank" },
  { code: "SBCI", name: "Saraswat Cooperative Bank" },
  { code: "SVCB", name: "SVC Cooperative Bank" },
  { code: "SCBL_SHA", name: "Shamrao Vithal Cooperative Bank" },
  { code: "TJSB", name: "TJSB Sahakari Bank" },
  { code: "ZCBL", name: "Zoroastrian Cooperative Bank" },
  { code: "RBL_DM", name: "Dombivli Nagari Sahakari Bank" },
  { code: "GPPB", name: "Gopinath Patil Parsik Janata Sahakari Bank" },

  // Regional Rural Banks (RRBs) — major
  { code: "ANDB", name: "Andhra Pragathi Grameena Bank" },
  { code: "APGB", name: "Andhra Pradesh Grameena Vikas Bank" },
  { code: "APGV", name: "Aryavart Bank" },
  { code: "BGGB", name: "Baroda Gujarat Gramin Bank" },
  { code: "BURG", name: "Baroda UP Bank" },
  { code: "BRGB", name: "Baroda Rajasthan Kshetriya Gramin Bank" },
  { code: "CRGB", name: "Chhattisgarh Rajya Gramin Bank" },
  { code: "DGBL", name: "Dakshin Bihar Gramin Bank" },
  { code: "ELGB", name: "Ellaquai Dehati Bank" },
  { code: "HARG", name: "Haryana Gramin Bank" },
  { code: "HPGB", name: "Himachal Pradesh Gramin Bank" },
  { code: "JKGB", name: "J&K Grameen Bank" },
  { code: "KAGB", name: "Karnataka Gramin Bank" },
  { code: "KAVG", name: "Karnataka Vikas Grameena Bank" },
  { code: "KEGB", name: "Kerala Gramin Bank" },
  { code: "MAGB", name: "Madhya Pradesh Gramin Bank" },
  { code: "MAHG", name: "Maharashtra Gramin Bank" },
  { code: "MGBB", name: "Manipur Rural Bank" },
  { code: "MGRB", name: "Meghalaya Rural Bank" },
  { code: "MIRB", name: "Mizoram Rural Bank" },
  { code: "NGRB", name: "Nagaland Rural Bank" },
  { code: "ODGB", name: "Odisha Gramya Bank" },
  { code: "PSGB", name: "Punjab Gramin Bank" },
  { code: "PRGB", name: "Prathama UP Gramin Bank" },
  { code: "PCGB", name: "Paschim Banga Gramin Bank" },
  { code: "RMGB", name: "Rajasthan Marudhara Gramin Bank" },
  { code: "SVGB", name: "Saurashtra Gramin Bank" },
  { code: "TGGB", name: "Telangana Grameena Bank" },
  { code: "TGBL", name: "Tripura Gramin Bank" },
  { code: "TNGB", name: "Tamil Nadu Grama Bank" },
  { code: "UTGB", name: "Uttarakhand Gramin Bank" },
  { code: "UBGB", name: "Utkal Grameen Bank" },
  { code: "VAGB", name: "Vidharbha Konkan Gramin Bank" },

  // Other / niche
  { code: "AAUB", name: "Au Financiers (India) Ltd" },
  { code: "FINB", name: "Fincare Small Finance Bank" },
  { code: "NPBL", name: "North East Small Finance Bank" },
] as const;

router.get("/money/banks", requireAuth, async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  let items: ReadonlyArray<{ code: string; name: string }> = IMPS_BANKS;
  if (q) {
    items = IMPS_BANKS.filter(
      (b) => b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q),
    );
  }
  res.json({ items, total: IMPS_BANKS.length });
});

export default router;
