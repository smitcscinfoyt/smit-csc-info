/**
 * Recharge global settings stored in `recharge_settings` (key/value JSON).
 * Lazy-seeded with sensible defaults on first read.
 */
import { db, rechargeSettingsTable, commissionSlabsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { DEFAULT_SLABS, SLAB_VERSION } from "./commission-engine";
import { logger } from "./logger";

export interface RechargeGlobalSettings {
  rechargeEnabled: boolean;
  mobileEnabled: boolean;
  dthEnabled: boolean;
  billEnabled: boolean;
  walletCapNoKycPaise: number;
  walletCapKycPaise: number;
  minRechargePaise: number;
  maxRechargePaise: number;
  minTopupPaise: number;
  maxTopupPaise: number;
  dailyRechargeCountLimit: number;
}

export const DEFAULTS: RechargeGlobalSettings = {
  rechargeEnabled: true,
  mobileEnabled: true,
  dthEnabled: true,
  billEnabled: true,
  walletCapNoKycPaise: 1_000_000,   // ₹10,000
  walletCapKycPaise:   5_000_000,   // ₹50,000
  minRechargePaise:    1_000,        // ₹10
  maxRechargePaise:    500_000,      // ₹5,000
  minTopupPaise:       10_000,       // ₹100
  maxTopupPaise:       2_000_000,    // ₹20,000
  dailyRechargeCountLimit: 100,
};

const KEY = "global";

export async function getGlobalSettings(): Promise<RechargeGlobalSettings> {
  const [row] = await db.select().from(rechargeSettingsTable).where(eq(rechargeSettingsTable.key, KEY));
  if (!row) {
    await db.insert(rechargeSettingsTable).values({ key: KEY, value: DEFAULTS }).onConflictDoNothing();
    return DEFAULTS;
  }
  return { ...DEFAULTS, ...(row.value as Partial<RechargeGlobalSettings>) };
}

export async function updateGlobalSettings(
  patch: Partial<RechargeGlobalSettings>,
  updatedBy: number,
): Promise<RechargeGlobalSettings> {
  const current = await getGlobalSettings();
  const next = { ...current, ...patch };
  await db
    .insert(rechargeSettingsTable)
    .values({ key: KEY, value: next, updatedBy })
    .onConflictDoUpdate({
      target: rechargeSettingsTable.key,
      set: { value: next, updatedBy, updatedAt: new Date() },
    });
  return next;
}

const SLAB_VERSION_KEY = "slabVersion";

async function getStoredSlabVersion(): Promise<number> {
  const [row] = await db.select().from(rechargeSettingsTable).where(eq(rechargeSettingsTable.key, SLAB_VERSION_KEY));
  return (row?.value as any)?.version ?? 0;
}

async function setStoredSlabVersion(version: number): Promise<void> {
  await db.insert(rechargeSettingsTable)
    .values({ key: SLAB_VERSION_KEY, value: { version } })
    .onConflictDoUpdate({ target: rechargeSettingsTable.key, set: { value: { version }, updatedAt: new Date() } });
}

async function seedDefaultSlabs(): Promise<void> {
  await db.insert(commissionSlabsTable).values(
    DEFAULT_SLABS.map((s) => ({
      type: s.type,
      operatorCode: s.operatorCode,
      tier: s.tier,
      percentBp: s.percentBp,
      minAmountPaise: 1_000,
      maxAmountPaise: 500_000,
      isActive: 1,
    })),
  );
}

/**
 * Seed/migrate commission slabs to the latest PLATINUM rates.
 *
 * Uses a version number: if the stored version < SLAB_VERSION, deactivate
 * all existing base slabs and re-seed from DEFAULT_SLABS (PLATINUM rates).
 * Legacy tier-specific slabs (free/prime/premium) are also deactivated.
 */
export async function ensureDefaultSlabs(): Promise<void> {
  const storedVersion = await getStoredSlabVersion();
  if (storedVersion >= SLAB_VERSION) return;

  logger.info({ storedVersion, targetVersion: SLAB_VERSION }, "[SLABS] upgrading commission slabs");

  await db.update(commissionSlabsTable)
    .set({ isActive: 0, updatedAt: new Date() })
    .where(
      or(
        eq(commissionSlabsTable.tier, "base"),
        eq(commissionSlabsTable.tier, "free"),
        eq(commissionSlabsTable.tier, "prime"),
        eq(commissionSlabsTable.tier, "premium"),
      )!,
    );

  await seedDefaultSlabs();
  await setStoredSlabVersion(SLAB_VERSION);
  logger.info({ version: SLAB_VERSION, count: DEFAULT_SLABS.length }, "[SLABS] seeded PLATINUM rates");
}

export async function resetSlabsToDefaults(): Promise<void> {
  await db.update(commissionSlabsTable)
    .set({ isActive: 0, updatedAt: new Date() })
    .where(eq(commissionSlabsTable.tier, "base"));

  await seedDefaultSlabs();
  await setStoredSlabVersion(SLAB_VERSION);
}
