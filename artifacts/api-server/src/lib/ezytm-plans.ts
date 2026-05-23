import { logger } from "./logger";

const BASE = "https://planapi.in/api/Mobile/Operatorplan";

export interface EzytmPlan {
  rs: string;
  desc: string;
  validity: string;
  last_update?: string;
}

export interface PlanCategory {
  category: string;
  plans: EzytmPlan[];
}

// A1 operator code → Ezytm operator code (planapi.in numeric codes)
const A1_TO_EZYTM_OP: Record<string, string> = {
  A:  "2",   // Airtel
  RC: "11",  // Jio
  V:  "23",  // Vi (Vodafone+Idea merged)
  I:  "23",  // Idea legacy → Vi
  BT: "5",   // BSNL Topup
  BR: "5",   // BSNL STV
};

// A1 circle code → Ezytm circle code (mostly same numbering)
const A1_TO_EZYTM_CIRCLE: Record<string, string> = {
  "12": "12", // Gujarat
  "10": "10", "11": "11", "13": "13", "14": "14", "15": "15",
  "16": "16", "17": "17", "18": "18", "19": "19", "20": "20",
  "21": "21", "22": "22", "23": "23", "24": "24", "25": "25",
  "26": "26", "27": "27", "28": "28", "29": "29",
};

interface CacheEntry {
  data: PlanCategory[];
  expires: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function getEnv() {
  const userId = process.env.EZYTM_API_USERID;
  const password = process.env.EZYTM_API_PASSWORD;
  if (!userId || !password) return null;
  return { userId, password };
}

export async function getPlansForOperator(
  a1OperatorCode: string,
  a1CircleCode: string
): Promise<PlanCategory[]> {
  const opCode = A1_TO_EZYTM_OP[a1OperatorCode];
  const circleCode = A1_TO_EZYTM_CIRCLE[a1CircleCode] ?? a1CircleCode;

  if (!opCode) {
    logger.info({ a1OperatorCode }, "ezytm-plans: no Ezytm code mapping");
    return [];
  }

  const cacheKey = `${opCode}:${circleCode}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const env = getEnv();
  if (!env) {
    logger.warn("ezytm-plans: EZYTM_API_USERID/PASSWORD not set");
    return [];
  }

  const url = `${BASE}?ApiUserID=${encodeURIComponent(env.userId)}&ApiPassword=${encodeURIComponent(env.password)}&operatorcode=${opCode}&circle=${circleCode}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      logger.warn({ status: res.status, opCode, circleCode }, "ezytm-plans: HTTP error");
      return [];
    }
    const json: any = await res.json();

    if (json.STATUS !== 0 && json.STATUS !== "0" && !json.RDATA) {
      logger.warn({ json, opCode, circleCode }, "ezytm-plans: API error");
      return [];
    }

    const rdata = json.RDATA ?? {};
    const categories: PlanCategory[] = [];

    for (const [catName, plansRaw] of Object.entries(rdata)) {
      if (!Array.isArray(plansRaw)) continue;
      const plans: EzytmPlan[] = plansRaw
        .map((p: any) => ({
          rs: String(p.rs ?? p.Rs ?? p.amount ?? ""),
          desc: String(p.desc ?? p.Desc ?? p.description ?? ""),
          validity: String(p.validity ?? p.Validity ?? ""),
          last_update: p.last_update ?? p.LastUpdate ?? undefined,
        }))
        .filter((p) => p.rs && !isNaN(Number(p.rs)));
      if (plans.length) categories.push({ category: catName, plans });
    }

    cache.set(cacheKey, { data: categories, expires: Date.now() + CACHE_TTL_MS });
    return categories;
  } catch (err: any) {
    logger.error({ err: err?.message, opCode, circleCode }, "ezytm-plans: fetch failed");
    return [];
  }
}
