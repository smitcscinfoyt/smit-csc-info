/**
 * Operator-tier helpers — one-time lifetime memberships (silver/gold/premium)
 * stored on `users.operator_tier`. Distinct from "Prime" content subscription.
 *
 * Mapping to commission engine tier:
 *   silver  → "free"   (default for all users)
 *   gold    → "prime"  (uses existing prime slabs)
 *   premium → "prime"  (uses existing prime slabs; admin can add a richer
 *                       "premium" slab tier later without breaking this map)
 */
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { CommissionTier } from "./commission-engine";
import { hasPrimeAccess, type PrimeStatus } from "./prime-status";

export type OperatorTier = "silver" | "gold" | "premium";

export const OPERATOR_PLANS: Array<{
  id: OperatorTier;
  name: string;
  pricePaise: number;
  tagline: string;
  commissionLabel: string;
  features: string[];
}> = [
  {
    id: "silver",
    name: "Silver",
    pricePaise: 0,
    tagline: "Basic access — get started for free",
    commissionLabel: "0% commission (no earnings)",
    features: [
      "Free lifetime access to recharge portal",
      "Basic Mobile / DTH / Bill recharge",
      "Standard reports",
      "Email support",
    ],
  },
  {
    id: "gold",
    name: "Gold",
    pricePaise: 99900,
    tagline: "Pro access — earn higher commissions",
    commissionLabel: "Earn up to 3.36% commission",
    features: [
      "Lifetime Pro access (one-time payment)",
      "Up to 2.80% on Mobile, up to 3.36% on DTH",
      "Priority recharge processing",
      "WhatsApp + email support",
      "Detailed daily reports",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    pricePaise: 199900,
    tagline: "Expert access — maximum earnings",
    commissionLabel: "Earn up to 3.78% commission",
    features: [
      "Lifetime Expert access (one-time payment)",
      "Up to 3.15% on Mobile, up to 3.78% on DTH",
      "Top-priority processing",
      "Dedicated relationship manager",
      "Advanced analytics & exports",
      "Early access to new operators",
    ],
  },
];

export function getOperatorPlan(id: OperatorTier) {
  return OPERATOR_PLANS.find((p) => p.id === id);
}

/** Reads `operatorTier` for the user, defaulting to 'silver' if missing. */
export async function getUserOperatorTier(userId: number): Promise<OperatorTier> {
  const [u] = await db
    .select({ tier: usersTable.operatorTier })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const t = (u?.tier ?? "silver") as OperatorTier;
  return t === "gold" || t === "premium" ? t : "silver";
}

/**
 * Resolves the commission tier to use for a recharge.
 *
 * Active Prime (content) members automatically get Premium recharge benefits
 * for the duration of their Prime subscription. When Prime expires, they fall
 * back to whatever operator tier they have purchased (silver / gold / premium).
 *
 *   operator = premium                  → premium
 *   has active Prime                    → premium  (auto-perk while Prime is active)
 *   operator = gold                     → prime
 *   else                                → free
 *
 * Commission engine has fallback (premium → prime → free) so Premium tier
 * always earns at least Prime rates even before an admin adds premium slabs.
 */
export function resolveCommissionTier(
  operatorTier: OperatorTier,
  primeStatus: PrimeStatus,
): CommissionTier {
  if (operatorTier === "premium") return "premium";
  if (hasPrimeAccess(primeStatus)) return "premium";
  if (operatorTier === "gold") return "prime";
  return "free";
}

/**
 * Returns the *effective* operator tier as shown to the user, factoring in the
 * active Prime perk. Used by `/operator-membership/status` so the UI can render
 * the correct badge and "auto-active" notice.
 */
export function getEffectiveOperatorTier(
  operatorTier: OperatorTier,
  primeStatus: PrimeStatus,
): { effective: OperatorTier; viaPrime: boolean } {
  if (operatorTier === "premium") return { effective: "premium", viaPrime: false };
  if (hasPrimeAccess(primeStatus)) return { effective: "premium", viaPrime: true };
  return { effective: operatorTier, viaPrime: false };
}
