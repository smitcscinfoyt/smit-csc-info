/**
 * Offline Indian mobile-number → operator + circle detector.
 *
 * Uses 4-digit number-series allocations from the TRAI Numbering Plan
 * (pre-MNP). Returns a best-effort guess with `confidence` so the UI can
 * present it as "auto-detected" while still allowing manual override.
 *
 * Operator codes match the A1Topup catalog in `lib/a1topup.ts`:
 *   A=Airtel, V=Vodafone (Vi), I=Idea (Vi), RC=Reliance Jio,
 *   BT=BSNL TopUp, BR=BSNL STV.
 *
 * Circle codes match the A1Topup `CIRCLES` list (numeric strings).
 *
 * NOTE: Indian Mobile Number Portability (MNP) means a number may have been
 * ported away from its original operator. The detection is therefore a hint
 * — the form lets the user override the suggestion before submitting.
 */

export interface PrefixDetection {
  operatorCode: string;
  operatorName: string;
  circleCode: string;
  circleName: string;
  /** "high" = full 4-digit series match; "low" = 3-digit fallback. */
  confidence: "high" | "low";
  /** "prefix" = local TRAI prefix table lookup (NOT MNP-aware). */
  source: "prefix";
}

/** Union of all detection result shapes returned by /recharge/detect. */
export type AnyDetection =
  | PrefixDetection
  | (Omit<PrefixDetection, "source" | "confidence"> & { source: "ezytm"; confidence: "high" });

/** Display name for each operator code we may emit. */
const OP_NAME: Record<string, string> = {
  A:  "Airtel",
  V:  "Vodafone",
  I:  "Idea",
  RC: "Reliance Jio",
  BT: "BSNL TopUp",
};

/** Display name for each circle code we may emit. */
const CIRCLE_NAME: Record<string, string> = {
  "1":  "Punjab",
  "2":  "West Bengal",
  "3":  "Mumbai",
  "4":  "Maharashtra",
  "5":  "Delhi NCR",
  "6":  "Kolkata",
  "7":  "Chennai",
  "8":  "Tamil Nadu",
  "9":  "Karnataka",
  "10": "UP East",
  "11": "UP West",
  "12": "Gujarat",
  "13": "Andhra Pradesh",
  "14": "Kerala",
  "16": "Madhya Pradesh",
  "17": "Bihar",
  "18": "Rajasthan",
  "20": "Haryana",
  "21": "Himachal Pradesh",
  "22": "Jharkhand",
  "23": "Orissa",
  "24": "Assam",
  "25": "Jammu & Kashmir",
  "26": "North East",
  "27": "Chhattisgarh",
};

/**
 * 4-digit prefix → "OP|CIRCLE" lookup.
 *
 * Curated from TRAI numbering-plan allocations covering the highest-traffic
 * series for each major operator. Exhaustive across Gujarat (the primary
 * audience) and includes national Jio/Airtel/Vi/BSNL series.
 *
 * Format kept compact ("OP|CC") to keep this file scannable.
 */
const PREFIX_4: Record<string, string> = {
  // ══════════════════════════════════════════════════════════════════════
  // GUJARAT (12) — comprehensive coverage (the primary audience)
  // ══════════════════════════════════════════════════════════════════════

  // Vodafone Idea (V) — Gujarat
  "7041": "V|12", "7383": "V|12", "7567": "V|12", "7574": "V|12",
  "7575": "V|12", "7861": "V|12", "7874": "V|12", "7878": "V|12",
  "7984": "V|12", "7990": "V|12",
  "8128": "V|12", "8160": "V|12", "8347": "V|12", "8401": "V|12",
  "8980": "V|12", "8347": "V|12",
  "9099": "V|12", "9408": "V|12", "9409": "V|12",
  "9426": "V|12", "9427": "V|12", "9428": "V|12", "9429": "V|12",
  "9499": "V|12", "9504": "V|12", "9510": "V|12", "9512": "V|12",
  "9558": "V|12", "9574": "V|12", "9586": "V|12", "9601": "V|12",
  "9624": "V|12", "9712": "V|12", "9722": "V|12", "9737": "V|12",
  "9824": "V|12", "9879": "V|12", "9904": "V|12", "9913": "V|12",
  "9924": "V|12", "9974": "V|12", "9979": "V|12",

  // Airtel (A) — Gujarat
  "9106": "A|12", "9173": "A|12", "9265": "A|12",
  "9824": "A|12", "9825": "A|12", "9879": "A|12",
  "9909": "A|12", "9978": "A|12",

  // Reliance Jio (RC) — Gujarat
  "6005": "RC|12", "6006": "RC|12", "6007": "RC|12",
  "6008": "RC|12", "6009": "RC|12",
  "6260": "RC|12", "6261": "RC|12", "6262": "RC|12",
  "6263": "RC|12", "6264": "RC|12", "6265": "RC|12",
  "6266": "RC|12", "6267": "RC|12", "6268": "RC|12", "6269": "RC|12",
  "6354": "RC|12", "6355": "RC|12", "6356": "RC|12",
  "6357": "RC|12", "6358": "RC|12", "6359": "RC|12",
  "7000": "RC|12", "7016": "RC|12", "7202": "RC|12", "7203": "RC|12",
  "7600": "RC|12", "8000": "RC|12", "8141": "RC|12", "8200": "RC|12",
  "8460": "RC|12", "8511": "RC|12", "8758": "RC|12",
  "9090": "RC|12",

  // BSNL (BT) — Gujarat
  "9925": "BT|12",

  // ══════════════════════════════════════════════════════════════════════
  // OTHER CIRCLES — common national prefixes
  // ══════════════════════════════════════════════════════════════════════

  // Reliance Jio — pan-India
  "6396": "RC|10", "6397": "RC|10", "6398": "RC|10", "6399": "RC|10",
  "6201": "RC|17", "6202": "RC|17", "6203": "RC|17", "6204": "RC|17",
  "6299": "RC|17",
  "7008": "RC|23", "7894": "RC|23",
  "7042": "RC|5",  "7011": "RC|5",  "7053": "RC|5",
  "7710": "RC|4",  "7720": "RC|4",
  "7045": "RC|3",  "7506": "RC|3",  "8898": "RC|3",
  "7007": "RC|17", "7488": "RC|17",
  "7800": "RC|10", "7860": "RC|10", "7080": "RC|10",
  "8800": "RC|5",  "8588": "RC|5",  "8369": "RC|5",
  "7405": "RC|9",  "7406": "RC|9",  "7411": "RC|9", "7676": "RC|9",
  "9876": "RC|1",

  // Airtel — pan-India
  "9819": "A|3",  "9820": "A|3",  "9821": "A|3",  "9892": "A|3",
  "9881": "A|4",  "9890": "A|4",
  "9810": "A|5",  "9811": "A|5",  "9818": "A|5",  "9971": "A|5",
  "9999": "A|5",
  "9740": "A|9",  "9741": "A|9",  "9845": "A|9",  "9844": "A|9",
  "9840": "A|7",  "9841": "A|7",  "9952": "A|8",  "9842": "A|8",
  "9831": "A|6",  "9836": "A|6",
  "9849": "A|13", "9866": "A|13",
  "9846": "A|14", "9847": "A|14",
  "9872": "A|1",  "9888": "A|1",
  "9991": "A|20", "9255": "A|20",
  "9928": "A|18", "9929": "A|18",
  "9919": "A|10", "9415": "A|10", "9759": "A|11",
  "9893": "A|16", "9981": "A|16",

  // Vodafone Idea — pan-India
  "9920": "V|3",  "9930": "V|3",
  "9921": "V|4",
  "9899": "V|5",  "9911": "V|5",
  "9886": "V|9",  "9900": "V|9",
  "9894": "V|8",
  "9830": "V|6",
  "9908": "V|13",
  "9914": "V|1",
  "9982": "V|18",
  "9416": "V|20",
  "9412": "V|10", "9756": "V|11",
  "9826": "V|16",

  // BSNL — pan-India
  "9417": "BT|1",
  "9450": "BT|10",
  "9420": "BT|4",
  "9448": "BT|9",
  "9440": "BT|13",
  "9444": "BT|8",
  "9447": "BT|14",
  "9430": "BT|17",
  "9460": "BT|18",
  "9425": "BT|16",
  "9466": "BT|20",
  "9437": "BT|23",
  "9434": "BT|2",
};

/**
 * 3-digit fallback prefix → "OP|CIRCLE" for any 4-digit prefix not explicitly
 * listed above. Used at lower confidence ("verify" badge in UI).
 *
 * Strategy: for the 3-digit series we know is dominantly allocated to one
 * operator+circle (per TRAI numbering plan), provide a reasonable guess.
 * The user can always override.
 */
const PREFIX_3: Record<string, string> = {
  // ── Gujarat broad fallbacks (operator-circle most likely) ──────────
  // 70xx-79xx blocks dominantly Vi/Idea Gujarat
  "704": "V|12", "738": "V|12", "756": "V|12", "757": "V|12",
  "758": "V|12", "786": "V|12", "787": "V|12", "788": "V|12",
  "798": "V|12", "799": "V|12",
  // 81xx-84xx Vi/Jio Gujarat
  "812": "V|12", "816": "V|12", "834": "V|12", "840": "V|12",
  // 90xx-99xx most blocks Vodafone/Airtel Gujarat
  "942": "V|12", "950": "V|12", "951": "V|12", "955": "V|12",
  "957": "V|12", "958": "V|12", "990": "V|12", "991": "V|12",
  "997": "V|12",
  // Airtel-heavy Gujarat blocks
  "910": "A|12", "917": "A|12", "971": "A|12", "982": "A|12",
  // Jio Gujarat (newer 6/7/8-series allocations)
  "600": "RC|12", "626": "RC|12", "635": "RC|12",
  "700": "RC|12", "720": "RC|12", "760": "RC|12",
  "800": "RC|12", "814": "RC|12", "820": "RC|12",
  "846": "RC|12", "851": "RC|12", "875": "RC|12",
  "909": "RC|12",
  // ── Other circles ──────────────────────────────────────────────────
  "639": "RC|10",
  "639": "RC|10",
};

/**
 * Detect operator + circle from a 10-digit Indian mobile number.
 * Returns `null` for unknown numbers (caller should ask the user manually).
 */
export function detectMobileOperator(rawNumber: string): PrefixDetection | null {
  const num = (rawNumber || "").replace(/\D/g, "");
  if (num.length < 4) return null;
  if (!/^[6-9]/.test(num)) return null;

  // Try 4-digit first
  const p4 = num.slice(0, 4);
  let entry = PREFIX_4[p4];
  let confidence: PrefixDetection["confidence"] = "high";

  if (!entry) {
    const p3 = num.slice(0, 3);
    entry = PREFIX_3[p3];
    confidence = "low";
  }

  if (!entry) return null;
  const [op, cc] = entry.split("|");
  const operatorName = OP_NAME[op];
  const circleName = CIRCLE_NAME[cc];
  if (!operatorName || !circleName) return null;

  return {
    operatorCode: op,
    operatorName,
    circleCode: cc,
    circleName,
    confidence,
    source: "prefix",
  };
}
