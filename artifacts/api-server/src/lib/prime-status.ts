import { db, paymentsTable, type Payment } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

export const GRACE_PERIOD_DAYS = 3;

export type PrimeStatus = {
  payment: Payment | null;
  isActive: boolean;
  isInGracePeriod: boolean;
  isExpired: boolean;
  hasEverBeenPrime: boolean;
  daysUntilExpiry: number | null;
  daysSinceExpiry: number | null;
  expiryDate: Date | null;
  graceEndsAt: Date | null;
};

export async function getPrimeStatus(userId: number): Promise<PrimeStatus> {
  // Use the most-recently-created successful payment as authoritative.
  // (Renewal intent: a newer payment supersedes older ones, even if its expiry is shorter.)
  const [latest] = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.userId, userId), eq(paymentsTable.status, "success")))
    .orderBy(desc(paymentsTable.createdAt), desc(paymentsTable.id))
    .limit(1);

  if (!latest || !latest.expiryDate) {
    return {
      payment: null,
      isActive: false,
      isInGracePeriod: false,
      isExpired: false,
      hasEverBeenPrime: !!latest,
      daysUntilExpiry: null,
      daysSinceExpiry: null,
      expiryDate: null,
      graceEndsAt: null,
    };
  }

  const now = new Date();
  const expiry = new Date(latest.expiryDate);
  const graceEndsAt = new Date(expiry.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const msPerDay = 1000 * 60 * 60 * 24;

  if (now < expiry) {
    return {
      payment: latest,
      isActive: true,
      isInGracePeriod: false,
      isExpired: false,
      hasEverBeenPrime: true,
      daysUntilExpiry: Math.ceil((expiry.getTime() - now.getTime()) / msPerDay),
      daysSinceExpiry: null,
      expiryDate: expiry,
      graceEndsAt,
    };
  }

  if (now < graceEndsAt) {
    return {
      payment: latest,
      isActive: false,
      isInGracePeriod: true,
      isExpired: false,
      hasEverBeenPrime: true,
      daysUntilExpiry: 0,
      daysSinceExpiry: Math.floor((now.getTime() - expiry.getTime()) / msPerDay),
      expiryDate: expiry,
      graceEndsAt,
    };
  }

  return {
    payment: latest,
    isActive: false,
    isInGracePeriod: false,
    isExpired: true,
    hasEverBeenPrime: true,
    daysUntilExpiry: null,
    daysSinceExpiry: Math.floor((now.getTime() - expiry.getTime()) / msPerDay),
    expiryDate: expiry,
    graceEndsAt,
  };
}

/** Returns true if the user should currently get full Prime access (active OR in grace). */
export function hasPrimeAccess(s: PrimeStatus): boolean {
  return s.isActive || s.isInGracePeriod;
}
