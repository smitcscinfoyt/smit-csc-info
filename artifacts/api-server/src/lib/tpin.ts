/**
 * Transaction PIN (T-PIN) — bcrypt-hashed 4-digit PIN used to authorise
 * larger wallet debits (≥ wallets.tpinRequiredFromPaise, default ₹500).
 */
import bcrypt from "bcryptjs";
import { db, walletsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureWallet } from "./wallet-engine";

const PIN_REGEX = /^[0-9]{4,6}$/;

export function isValidPinFormat(pin: string): boolean {
  return PIN_REGEX.test(pin);
}

export async function setTpin(userId: number, pin: string): Promise<void> {
  if (!isValidPinFormat(pin)) {
    throw new Error("T-PIN must be 4-6 digits");
  }
  await ensureWallet(userId);
  const hash = await bcrypt.hash(pin, 10);
  await db.update(walletsTable).set({ tpinHash: hash, updatedAt: new Date() }).where(eq(walletsTable.userId, userId));
}

export async function changeTpin(userId: number, oldPin: string, newPin: string): Promise<void> {
  const w = await ensureWallet(userId);
  if (!w.tpinHash) throw new Error("No T-PIN set yet");
  const ok = await bcrypt.compare(oldPin, w.tpinHash);
  if (!ok) throw new Error("Incorrect current T-PIN");
  await setTpin(userId, newPin);
}

export async function verifyTpin(userId: number, pin: string): Promise<boolean> {
  const w = await ensureWallet(userId);
  if (!w.tpinHash) return false;
  return bcrypt.compare(pin, w.tpinHash);
}

export async function hasTpin(userId: number): Promise<boolean> {
  const w = await ensureWallet(userId);
  return !!w.tpinHash;
}

/** Returns true if a debit of `amountPaise` requires a T-PIN. */
export async function tpinRequiredFor(userId: number, amountPaise: number): Promise<boolean> {
  const w = await ensureWallet(userId);
  return amountPaise >= Number(w.tpinRequiredFromPaise);
}
