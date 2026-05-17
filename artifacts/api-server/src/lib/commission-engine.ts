/**
 * Commission Engine — tier-share model.
 *
 * Slabs represent the BASE commission rate the admin receives from A1Topup.
 * Users receive a share of that base rate depending on their tier:
 *
 *   free    →  0%  (basic login, no commission)
 *   prime   → 80%  (Gold operator tier)
 *   premium → 90%  (Premium operator tier or active Prime subscription)
 *
 * Slab match priority:
 *   1. Exact (type + operatorCode + tier="base")
 *   2. Wildcard (type + "*" + tier="base")
 *   3. Legacy fallback: tries premium → prime → free tier slabs
 *
 * Returns 0 commission if no slab matches.
 */

import { db, commissionSlabsTable, type CommissionSlab } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";

export type RechargeType = "mobile" | "dth" | "bill";
export type CommissionTier = "free" | "prime" | "premium";

export const TIER_SHARE: Record<CommissionTier, number> = {
  free: 0,
  prime: 80,
  premium: 90,
};

export async function resolveBaseSlab(
  type: RechargeType,
  operatorCode: string,
  amountPaise: number,
): Promise<CommissionSlab | null> {
  const baseSlab = await resolveSlabForTier(type, operatorCode, "base", amountPaise);
  if (baseSlab) return baseSlab;

  for (const t of ["premium", "prime", "free"]) {
    const slab = await resolveSlabForTier(type, operatorCode, t, amountPaise);
    if (slab) return slab;
  }
  return null;
}

async function resolveSlabForTier(
  type: RechargeType,
  operatorCode: string,
  tier: string,
  amountPaise: number,
): Promise<CommissionSlab | null> {
  const slabs = await db
    .select()
    .from(commissionSlabsTable)
    .where(
      and(
        eq(commissionSlabsTable.type, type),
        eq(commissionSlabsTable.tier, tier),
        eq(commissionSlabsTable.isActive, 1),
        or(
          eq(commissionSlabsTable.operatorCode, operatorCode),
          eq(commissionSlabsTable.operatorCode, "*"),
        ),
      ),
    );

  if (slabs.length === 0) return null;

  const sorted = [...slabs].sort((a, b) => {
    if (a.operatorCode === operatorCode && b.operatorCode !== operatorCode) return -1;
    if (b.operatorCode === operatorCode && a.operatorCode !== operatorCode) return 1;
    return 0;
  });

  for (const s of sorted) {
    if (amountPaise >= Number(s.minAmountPaise) && amountPaise <= Number(s.maxAmountPaise)) {
      return s;
    }
  }
  return sorted[0] ?? null;
}

export interface CommissionResult {
  slab: CommissionSlab | null;
  tier: CommissionTier;
  percentBp: number;
  sharePercent: number;
  baseCommissionPaise: number;
  commissionPaise: number;
}

export async function computeCommission(
  type: RechargeType,
  operatorCode: string,
  tier: CommissionTier,
  amountPaise: number,
): Promise<CommissionResult> {
  const slab = await resolveBaseSlab(type, operatorCode, amountPaise);
  const percentBp = slab?.percentBp ?? 0;
  const sharePercent = TIER_SHARE[tier];

  const baseCommissionPaise = Math.floor((amountPaise * percentBp) / 10000);
  const commissionPaise = Math.floor((baseCommissionPaise * sharePercent) / 100);

  return { slab, tier, percentBp, sharePercent, baseCommissionPaise, commissionPaise };
}

export const SLAB_VERSION = 3;

export const DEFAULT_SLABS: Array<{
  type: RechargeType; operatorCode: string; tier: string; percentBp: number;
}> = [
  // ── Mobile (PLATINUM rates from A1Topup) ──
  { type: "mobile", operatorCode: "V",  tier: "base", percentBp: 350 },  // Vodafone  3.50%
  { type: "mobile", operatorCode: "A",  tier: "base", percentBp: 100 },  // Airtel    1.00%
  { type: "mobile", operatorCode: "RC", tier: "base", percentBp:  65 },  // Jio       0.65%
  { type: "mobile", operatorCode: "BT", tier: "base", percentBp: 280 },  // BSNL TopUp 2.80%
  { type: "mobile", operatorCode: "BR", tier: "base", percentBp: 280 },  // BSNL STV  2.80%
  { type: "mobile", operatorCode: "I",  tier: "base", percentBp: 350 },  // Idea      3.50%

  // ── DTH ──
  { type: "dth", operatorCode: "DTV", tier: "base", percentBp: 380 },  // Dish TV         3.80%
  { type: "dth", operatorCode: "ATV", tier: "base", percentBp: 420 },  // Airtel Dig. TV  4.20%
  { type: "dth", operatorCode: "STV", tier: "base", percentBp: 350 },  // Sun Direct      3.50%
  { type: "dth", operatorCode: "VTV", tier: "base", percentBp: 420 },  // Videocon D2H    4.20%
  { type: "dth", operatorCode: "TTV", tier: "base", percentBp: 320 },  // Tata Sky        3.20%

  // ── Bill — wildcard 0% (postpaid / electricity default) ──
  { type: "bill", operatorCode: "*", tier: "base", percentBp: 0 },

  // ── Bill — Gas Cylinder 0.40% ──
  { type: "bill", operatorCode: "GG",    tier: "base", percentBp: 40 },  // Gujarat Gas
  { type: "bill", operatorCode: "AG",    tier: "base", percentBp: 40 },  // Adani Gas
  { type: "bill", operatorCode: "MG",    tier: "base", percentBp: 40 },  // Mahanagar Gas
  { type: "bill", operatorCode: "IG",    tier: "base", percentBp: 40 },  // Indraprastha Gas
  { type: "bill", operatorCode: "HPCLGC", tier: "base", percentBp: 40 }, // HP Gas

  // ── Bill — FASTag 0.15% ──
  { type: "bill", operatorCode: "AXF",   tier: "base", percentBp: 15 },
  { type: "bill", operatorCode: "BBF",   tier: "base", percentBp: 15 },
  { type: "bill", operatorCode: "EFF",   tier: "base", percentBp: 15 },
  { type: "bill", operatorCode: "FDF",   tier: "base", percentBp: 15 },
  { type: "bill", operatorCode: "HDF",   tier: "base", percentBp: 15 },
  { type: "bill", operatorCode: "ICF",   tier: "base", percentBp: 15 },
  { type: "bill", operatorCode: "IBF",   tier: "base", percentBp: 15 },
  { type: "bill", operatorCode: "IFF",   tier: "base", percentBp: 15 },
  { type: "bill", operatorCode: "IHMCF", tier: "base", percentBp: 15 },
  { type: "bill", operatorCode: "INDF",  tier: "base", percentBp: 15 },
  { type: "bill", operatorCode: "JKF",   tier: "base", percentBp: 15 },
  { type: "bill", operatorCode: "KMF",   tier: "base", percentBp: 15 },
  { type: "bill", operatorCode: "PTF",   tier: "base", percentBp: 15 },
  { type: "bill", operatorCode: "SBF",   tier: "base", percentBp: 15 },

  // ── Bill — Insurance / LIC 0.40% ──
  { type: "bill", operatorCode: "LIC", tier: "base", percentBp: 40 },  // LIC India
  { type: "bill", operatorCode: "ICP", tier: "base", percentBp: 40 },  // ICICI Prudential
  { type: "bill", operatorCode: "TAI", tier: "base", percentBp: 40 },  // Tata AIA

  // ── Bill — Postpaid (mobile postpaid bills) — wildcard 0% by default ──
  { type: "bill", operatorCode: "PAT", tier: "base", percentBp: 0 },  // Airtel Postpaid
  { type: "bill", operatorCode: "VP",  tier: "base", percentBp: 0 },  // Vodafone Postpaid
  { type: "bill", operatorCode: "IP",  tier: "base", percentBp: 0 },  // Idea Postpaid
  { type: "bill", operatorCode: "JPP", tier: "base", percentBp: 0 },  // Jio Postpaid
  { type: "bill", operatorCode: "BP",  tier: "base", percentBp: 0 },  // BSNL Postpaid
  { type: "bill", operatorCode: "DP",  tier: "base", percentBp: 0 },  // Tata Docomo Postpaid

  // ── Bill — Google Play Gift Card 2.00% ──
  { type: "bill", operatorCode: "GLF", tier: "base", percentBp: 200 },
];
