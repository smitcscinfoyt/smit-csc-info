/**
 * Ezytm (planapi.in) live mobile recharge plans lookup.
 *
 * Endpoint:
 *   GET https://planapi.in/api/Mobile/Operatorplan
 *       ?apimember_id=<id>&api_password=<pw>&cricle=<code>&operatorcode=<code>
 *
 * Response:
 *   { STATUS:"1", ERROR:"0", Operator, RDATA:{ Topup:[], Combo:[], Data:[], ... } }
 */

import { logger } from "./logger";

export interface PlanItem {
  amount: number;        // Rupees (integer)
  validity: string;      // e.g. "28 days", "Existing"
  description: string;   // plan benefits text
  category: string;      // "Topup" | "Combo" | "Data" | "SMS" | "FRC" | "Roaming" | "ISD" | "FULLTT"
  lastUpdate?: string;
}

export interface PlansResult {
  operatorName: string;
  plans: PlanItem[];
}

// A1Topup operator code → Ezytm plan operator code (numeric).
// Ezytm uses different numeric codes for plans than for detection.
const EZYTM_PLAN_CODE: Record<string, string> = {
  A:  "2",   // Airtel
  RC: "11",  // Reliance Jio
  V:  "23",  // Vodafone (Vi)
  I:  "4",   // Idea (Vi — legacy)
  BT: "5",   // BSNL TopUp
  BR: "6",   // BSNL STV
};

interface EzytmPlanRow {
  rs?: string | number;
  desc?: string;
  validity?: string;
  last_update?: string;
}

interface EzytmPlansResponse {
  STATUS?: string;
  ERROR?: string;
  Operator?: string;
  Message?: string;
  RDATA?: Record<string, EzytmPlanRow[]>;
}

// ── In-memory cache (operator+circle → plans). 6h TTL. ──────────────────────
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;

interface CacheEntry { data: PlansResult | null; expiresAt: number; }
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): PlansResult | null | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) { cache.delete(key); return undefined; }
  cache.delete(key);
  cache.set(key, e);
  return e.data;
}

function cacheSet(key: string, data: PlansResult | null): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { data,
