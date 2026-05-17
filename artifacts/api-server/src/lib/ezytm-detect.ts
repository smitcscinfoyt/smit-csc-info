/**
 * Ezytm (planapi.in) live mobile-operator + circle lookup.
 *
 * Endpoint:
 *   GET https://planapi.in/api/Mobile/OperatorFetchNew
 *       ?ApiUserID=<id>&ApiPassword=<pw>&Mobileno=<10digit>
 *
 * Success response (STATUS:"1"):
 *   { ERROR:"0", STATUS:"1", Mobile, Operator, OpCode, Circle, CircleCode, Message }
 *
 * Failure response (STATUS:"3" auth failed, or other):
 *   { ERROR:"3", STATUS:"3", ... Message:"Authentication failed" }
 *
 * Unlike the offline TRAI prefix table, this lookup is MNP-aware (knows about
 * ported numbers). It costs 1 hit per lookup against the Ezytm hit balance.
 *
 * We aggressively cache results in-memory (24h TTL, capped LRU) to maximise
 * the value of the user's purchased hits — a single mobile is unlikely to
 * port operators within a 24h window.
 */

import { logger } from "./logger";

// ── Operator name → A1Topup operator code ───────────────────────────────────
// Ezytm/planapi.in returns operator names that vary widely:
//   • Short:     "AIRTEL", "JIO", "VI", "BSNL"
//   • Corporate: "Reliance Jio Infocomm Limited", "Bharti Airtel Limited",
//                "Vodafone Idea Limited", "Bharat Sanchar Nigam Limited"
// We resolve via substring matching against the upper-cased operator name to
// be resilient to format variations. Order matters — more specific patterns
// (e.g. JIO) must be checked before broader ones.
//
// A1Topup operator codes:
//   A=Airtel, RC=Reliance Jio, V=Vodafone, I=Idea, BT=BSNL TopUp, BR=BSNL STV
const OPERATOR_PATTERNS: ReadonlyArray<{ patterns: RegExp[]; code: string }> = [
  // Reliance Jio (check before "RELIANCE" alone)
  { patterns: [/\bJIO\b/, /RELIANCE\s+JIO/, /JIO\s+INFOCOMM/], code: "RC" },
  // Bharti Airtel
  { patterns: [/\bAIRTEL\b/, /BHARTI/], code: "A" },
  // Vodafone Idea (Vi) — collapsed brand. Default to V (Vodafone) since
  // A1Topup keeps separate catalogs but the merged Vi brand is treated as
  // Vodafone for prepaid recharges (most common path).
  { patterns: [/VODAFONE\s+IDEA/, /\bVI\b/, /\bVODAFONE\b/], code: "V" },
  // Idea standalone (rare since merger but kept)
  { patterns: [/\bIDEA\b/], code: "I" },
  // BSNL — TopUp by default; STV is a separate catalog item the user picks
  // manually if they want a special tariff voucher.
  { patterns: [/\bBSNL\b/, /BHARAT\s+SANCHAR/], code: "BT" },
];

function resolveOperatorCode(name: string): string | undefined {
  const upper = name.toUpperCase();
  for (const { patterns, code } of OPERATOR_PATTERNS) {
    if (patterns.some((p) => p.test(upper))) return code;
  }
  return undefined;
}

// ── Circle name → A1Topup numeric circle code ───────────────────────────────
// Inverse of the CIRCLE_NAME table in mobile-prefix.ts. Names are
// case-insensitive and matched after upper-casing + trimming.
const CIRCLE_MAP: Record<string, string> = {
  PUNJAB: "1",
  "WEST BENGAL": "2",
  MUMBAI: "3",
  MAHARASHTRA: "4",
  "MAHARASHTRA & GOA": "4",
  DELHI: "5",
  "DELHI NCR": "5",
  "DELHI & NCR": "5",
  KOLKATA: "6",
  CHENNAI: "7",
  "TAMIL NADU": "8",
  "TAMILNADU": "8",
  KARNATAKA: "9",
  "UP EAST": "10",
  "UTTAR PRADESH EAST": "10",
  "UP WEST": "11",
  "UTTAR PRADESH WEST": "11",
  "UP WEST & UTTARAKHAND": "11",
  GUJARAT: "12",
  "ANDHRA PRADESH": "13",
  "ANDHRA PRADESH & TELANGANA": "13",
  TELANGANA: "13",
  KERALA: "14",
  "MADHYA PRADESH": "16",
  "MP & CG": "16",
  "MADHYA PRADESH & CHHATTISGARH": "16",
  CHHATTISGARH: "16",
  BIHAR: "17",
  "BIHAR & JHARKHAND": "17",
  RAJASTHAN: "18",
  HARYANA: "20",
  "HIMACHAL PRADESH": "21",
  JHARKHAND: "22",
  ASSAM: "23",
  "NORTH EAST": "24",
  "NORTH-EAST": "24",
  "JAMMU & KASHMIR": "25",
  "JAMMU AND KASHMIR": "25",
  "J&K": "25",
  ORISSA: "26",
  ODISHA: "26",
};

export interface EzytmDetection {
  operatorCode: string;
  operatorName: string;
  circleCode: string;
  circleName: string;
  /** "high" — Ezytm lookup is MNP-aware, always treated as high confidence. */
  confidence: "high";
  /** "ezytm" identifies this as an MNP-aware live lookup. */
  source: "ezytm";
}

interface EzytmRawResponse {
  ERROR?: string;
  STATUS?: string;
  Mobile?: string;
  MOBILENO?: string;
  Operator?: string;
  OpCode?: string;
  Circle?: string;
  CircleCode?: string;
  Message?: string;
}

// ── In-memory LRU cache ─────────────────────────────────────────────────────
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const CACHE_MAX = 10_000;

interface CacheEntry { hit: EzytmDetection | null; expiresAt: number; }
const cache = new Map<string, CacheEntry>();

function cacheGet(num: string): EzytmDetection | null | undefined {
  const e = cache.get(num);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) { cache.delete(num); return undefined; }
  // refresh LRU position
  cache.delete(num);
  cache.set(num, e);
  return e.hit;
}

function cacheSet(num: string, hit: EzytmDetection | null): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(num, { hit, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Test hook — clears the in-memory cache. */
export function _clearEzytmCache(): void { cache.clear(); }

export function isEzytmConfigured(): boolean {
  return !!(process.env.EZYTM_API_USERID && process.env.EZYTM_API_PASSWORD);
}

/**
 * Live operator + circle lookup via Ezytm.
 *   • Returns `null` if the number prefix is unknown or the API rejects.
 *   • Returns `undefined` if Ezytm is not configured (caller should fall back).
 *   • Returns the cached value if available (within TTL).
 *
 * Network errors / non-200 responses are treated as `null` (caller falls back
 * to the offline prefix table). We never throw.
 */
export async function detectViaEzytm(rawNumber: string): Promise<EzytmDetection | null | undefined> {
  if (!isEzytmConfigured()) return undefined;

  const num = (rawNumber || "").replace(/\D/g, "");
  if (num.length !== 10 || !/^[6-9]/.test(num)) return null;

  const cached = cacheGet(num);
  if (cached !== undefined) return cached;

  const userId = process.env.EZYTM_API_USERID!;
  const password = process.env.EZYTM_API_PASSWORD!;
  const url =
    `https://planapi.in/api/Mobile/OperatorFetchNew` +
    `?ApiUserID=${encodeURIComponent(userId)}` +
    `&ApiPassword=${encodeURIComponent(password)}` +
    `&Mobileno=${encodeURIComponent(num)}`;

  let raw: EzytmRawResponse;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const resp = await fetch(url, { method: "GET", signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) {
      logger.warn({ status: resp.status, num: num.slice(0, 4) + "******" }, "[ezytm] non-200 response");
      return null;
    }
    raw = (await resp.json()) as EzytmRawResponse;
  } catch (e) {
    logger.warn({ err: (e as Error).message, num: num.slice(0, 4) + "******" }, "[ezytm] fetch failed");
    return null;
  }

  const status = String(raw.STATUS ?? "").trim();
  const errorCode = String(raw.ERROR ?? "").trim();
  const opNameRaw = String(raw.Operator ?? "").trim();
  const circleNameRaw = String(raw.Circle ?? "").trim();

  // Ezytm quirk: even on auth/IP errors they often return STATUS:"1" but with
  // ERROR != "0" and empty Operator/Circle fields. We must check BOTH.
  // True success requires:  ERROR === "0" AND STATUS === "1" AND Operator+Circle non-empty.
  const looksAuthOrIpError =
    errorCode !== "0" || !opNameRaw || !circleNameRaw ||
    /invalid ip|authentication failed|ip address/i.test(String(raw.Message ?? ""));
  if (status !== "1" || looksAuthOrIpError) {
    logger.warn(
      {
        status, errorCode, message: raw.Message,
        opName: opNameRaw, circleName: circleNameRaw,
        num: num.slice(0, 4) + "******",
      },
      "[ezytm] lookup unsuccessful — falling back to prefix",
    );
    // Don't cache transient errors (auth/IP/network) so they retry next time.
    // Only cache "real" empty-result responses (when API confirmed unknown number).
    return null;
  }

  const circleName = circleNameRaw.toUpperCase();
  const operatorCode = resolveOperatorCode(opNameRaw);
  const circleCode = CIRCLE_MAP[circleName];

  if (!operatorCode || !circleCode) {
    logger.warn(
      { opName: opNameRaw, circleName, num: num.slice(0, 4) + "******" },
      "[ezytm] unknown operator/circle in response — extend mapping",
    );
    cacheSet(num, null);
    return null;
  }

  // Pretty operator name from A1Topup catalog (preferred over Ezytm raw name)
  const a1Names: Record<string, string> = {
    A: "Airtel", RC: "Reliance Jio", V: "Vodafone", I: "Idea",
    BT: "BSNL TopUp", BR: "BSNL STV",
  };
  const a1CircleNames: Record<string, string> = {
    "1": "Punjab", "2": "West Bengal", "3": "Mumbai", "4": "Maharashtra",
    "5": "Delhi NCR", "6": "Kolkata", "7": "Chennai", "8": "Tamil Nadu",
    "9": "Karnataka", "10": "UP East", "11": "UP West", "12": "Gujarat",
    "13": "Andhra Pradesh", "14": "Kerala", "16": "Madhya Pradesh",
    "17": "Bihar", "18": "Rajasthan", "20": "Haryana", "21": "Himachal Pradesh",
    "22": "Jharkhand", "23": "Assam", "24": "North East",
    "25": "Jammu & Kashmir", "26": "Odisha",
  };

  const result: EzytmDetection = {
    operatorCode,
    operatorName: a1Names[operatorCode] ?? opName,
    circleCode,
    circleName: a1CircleNames[circleCode] ?? circleName,
    confidence: "high",
    source: "ezytm",
  };
  cacheSet(num, result);
  return result;
}
