/**
 * Wallet Engine — atomic credit/debit operations with ledger logging.
 *
 * Every balance change MUST go through `creditWallet` or `debitWallet`,
 * which open a transaction, lock the wallet row FOR UPDATE, mutate the
 * balance, and write a wallet_ledger entry — all atomically.
 *
 * Amounts are stored and operated on in PAISE (integer). Never use floats.
 */

import { db, walletsTable, walletLedgerTable, type Wallet } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export type LedgerType =
  | "topup"             // PhonePe wallet top-up
  | "recharge_debit"    // money taken out for a recharge
  | "recharge_refund"   // automatic refund on failed recharge
  | "commission"        // commission credited back after success
  | "admin_credit"      // manual admin top-up
  | "admin_debit"       // manual admin deduction
  | "reversal";         // misc reversal

export type LedgerRefType =
  | "wallet_topup"
  | "recharge"
  | "admin"
  | "system";

export interface LedgerWriteInput {
  type: LedgerType;
  amountPaise: number;
  refType: LedgerRefType;
  refId?: number | null;
  refCode?: string | null;
  note?: string | null;
}

export class WalletError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "WalletError";
  }
}

/** Get-or-create a wallet for the user. Idempotent. */
export async function ensureWallet(userId: number): Promise<Wallet> {
  const [existing] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  if (existing) return existing;
  const [created] = await db
    .insert(walletsTable)
    .values({ userId, balancePaise: 0 })
    .onConflictDoNothing({ target: walletsTable.userId })
    .returning();
  if (created) return created;
  // Race lost — re-read.
  const [again] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  if (!again) throw new WalletError("WALLET_INIT_FAILED", "Failed to initialise wallet");
  return again;
}

/**
 * Credit money into a wallet atomically. Returns the new balance and the
 * ledger entry id.
 */
export async function creditWallet(
  userId: number,
  input: LedgerWriteInput,
): Promise<{ balancePaise: number; ledgerEntryId: number }> {
  if (input.amountPaise <= 0) {
    throw new WalletError("INVALID_AMOUNT", "Credit amount must be positive");
  }

  return db.transaction(async (tx) => {
    // Ensure wallet exists outside the lock first, then re-lock.
    await ensureWallet(userId);
    const [w] = await tx
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, userId))
      .for("update");
    if (!w) throw new WalletError("WALLET_NOT_FOUND", "Wallet not found");

    const newBalance = Number(w.balancePaise) + input.amountPaise;

    await tx
      .update(walletsTable)
      .set({ balancePaise: newBalance, updatedAt: new Date() })
      .where(eq(walletsTable.id, w.id));

    const [entry] = await tx
      .insert(walletLedgerTable)
      .values({
        walletId: w.id,
        userId,
        direction: "credit",
        type: input.type,
        amountPaise: input.amountPaise,
        balanceAfterPaise: newBalance,
        refType: input.refType,
        refId: input.refId ?? null,
        refCode: input.refCode ?? null,
        note: input.note ?? null,
      })
      .returning({ id: walletLedgerTable.id });

    return { balancePaise: newBalance, ledgerEntryId: entry.id };
  });
}

/**
 * Debit money from a wallet atomically. Throws WalletError("INSUFFICIENT_BALANCE")
 * if the wallet does not have enough money. Returns new balance + ledger id.
 */
export async function debitWallet(
  userId: number,
  input: LedgerWriteInput,
): Promise<{ balancePaise: number; ledgerEntryId: number }> {
  if (input.amountPaise <= 0) {
    throw new WalletError("INVALID_AMOUNT", "Debit amount must be positive");
  }

  return db.transaction(async (tx) => {
    await ensureWallet(userId);
    const [w] = await tx
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, userId))
      .for("update");
    if (!w) throw new WalletError("WALLET_NOT_FOUND", "Wallet not found");
    if (w.isFrozen) {
      throw new WalletError("WALLET_FROZEN", w.freezeReason || "Wallet is frozen");
    }

    const current = Number(w.balancePaise);
    if (current < input.amountPaise) {
      throw new WalletError(
        "INSUFFICIENT_BALANCE",
        `Insufficient wallet balance. Available ₹${(current / 100).toFixed(2)}, required ₹${(input.amountPaise / 100).toFixed(2)}`,
      );
    }

    const newBalance = current - input.amountPaise;

    await tx
      .update(walletsTable)
      .set({ balancePaise: newBalance, updatedAt: new Date() })
      .where(eq(walletsTable.id, w.id));

    const [entry] = await tx
      .insert(walletLedgerTable)
      .values({
        walletId: w.id,
        userId,
        direction: "debit",
        type: input.type,
        amountPaise: input.amountPaise,
        balanceAfterPaise: newBalance,
        refType: input.refType,
        refId: input.refId ?? null,
        refCode: input.refCode ?? null,
        note: input.note ?? null,
      })
      .returning({ id: walletLedgerTable.id });

    return { balancePaise: newBalance, ledgerEntryId: entry.id };
  });
}

/** Read-only: fetch the user's current balance (creates wallet if missing). */
export async function getBalance(userId: number): Promise<Wallet> {
  return ensureWallet(userId);
}

// Re-export for convenience
export { sql };
