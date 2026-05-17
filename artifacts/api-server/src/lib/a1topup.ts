/**
 * A1Topup API Client (official Developer API integration).
 *
 * Endpoints:
 *   Recharge:        https://business.a1topup.com/recharge/api
 *   Balance:         https://business.a1topup.com/recharge/balance
 *   Status:          https://business.a1topup.com/recharge/status
 *   Money Transfer:  https://business.a1topup.com/money/api
 *   Sender Reg.:     https://business.a1topup.com/money/sender_registration
 *   Add Beneficiary: https://business.a1topup.com/money/add_beneficiary
 *   Verify Benef.:   https://business.a1topup.com/money/verify_beneficiary
 *   Search Benef.:   https://business.a1topup.com/money/search_beneficiary
 *   Verify Bank:     https://business.a1topup.com/money/verify_bank
 *
 * Auth (per official docs): every request takes `username` + `pwd` as query params.
 * Override base URL with A1TOPUP_BASE_URL.
 */

import crypto from "crypto";
import { logger } from "./logger";

const DEFAULT_BASE = "https://business.a1topup.com";

function username(): string  { return process.env.A1TOPUP_USERNAME ?? process.env.A1TOPUP_API_TOKEN ?? ""; }
function pwd(): string       { return process.env.A1TOPUP_PASSWORD ?? ""; }
function base(): string      { return (process.env.A1TOPUP_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, ""); }
function webhookSecret(): string { return process.env.A1TOPUP_WEBHOOK_SECRET ?? ""; }

export function isA1TopupConfigured(): boolean {
  return !!(username() && pwd());
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic A1 response (recharge / status / balance)
// ─────────────────────────────────────────────────────────────────────────────
export interface A1Response {
  status: "success" | "pending" | "failed";
  rawStatusCode: string;
  message: string;
  a1OrderId?: string;
  operatorRef?: string;
  amount?: number;
  balance?: number;
  raw: Record<string, unknown>;
}

function normaliseStatus(code: string | number | undefined, msg: string): A1Response["status"] {
  const s = String(code ?? "").trim().toUpperCase();
  // A1Topup numeric / textual codes
  if (s === "1" || s === "200" || s === "SUCCESS" || s === "S") return "success";
  if (s === "2" || s === "201" || s === "PENDING" || s === "P" || s === "PROCESSING" || s === "ACCEPTED") return "pending";
  if (s === "3" || s === "FAILED" || s === "F" || s === "FAILURE") return "failed";
  const m = msg.toLowerCase();
  if (m.includes("success")) return "success";
  if (m.includes("accepted") || m.includes("pending") || m.includes("process")) return "pending";
  return "failed";
}

function pick<T = unknown>(o: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    for (const variant of [k, k.toLowerCase(), k.toUpperCase()]) {
      if (o[variant] !== undefined && o[variant] !== null && o[variant] !== "") return o[variant] as T;
    }
  }
  return undefined;
}

function parseA1(raw: Record<string, unknown>): A1Response {
  const message = String(pick(raw, "message", "MESSAGE", "msg") ?? "");
  const statusCode = pick(raw, "status", "STATUS") as string | number | undefined;
  const status = normaliseStatus(statusCode, message);
  const amtRaw = pick(raw, "amount", "AMT") as string | number | undefined;
  const balRaw = pick(raw, "balance", "BAL") as string | number | undefined;
  return {
    status,
    rawStatusCode: String(statusCode ?? ""),
    message,
    a1OrderId: pick<string>(raw, "txid", "TXID", "txnid", "transactionid"),
    operatorRef: pick<string>(raw, "opid", "OPID", "operatorid"),
    amount: amtRaw !== undefined ? Number(amtRaw) : undefined,
    balance: balRaw !== undefined ? Number(balRaw) : undefined,
    raw,
  };
}

async function callApi(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL(`${base()}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const safe = { ...params } as Record<string, string>;
  for (const k of ["pwd", "password", "otp"]) if (k in safe) safe[k] = "***";
  logger.info({ path, params: safe }, "[A1Topup] →");

  const resp = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
  const text = await resp.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    logger.error({ status: resp.status, text }, "[A1Topup] ← non-JSON");
    // Wrap plain-text error into a structured failed response instead of throwing,
    // so callers can handle it through normal status-code logic.
    const plainMsg = text.trim().slice(0, 300) || "Unknown error";
    return {
      status: "3",
      message: plainMsg,
    } as Record<string, unknown>;
  }
  logger.info({ status: resp.status, body: json }, "[A1Topup] ←");
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recharge / Status / Balance
// ─────────────────────────────────────────────────────────────────────────────
interface RechargeArgs {
  /** our internal idempotent request id */
  requestId: string;
  operatorCode: string;
  /** mobile / customer / bill account */
  number: string;
  /** rupees (whole or 2-decimal) */
  amountRupees: number;
  /** circle code (numeric per A1Topup table) — required for mobile per docs */
  circleCode?: string;
  /** Extra fields for landline / utility (value1, value2 per docs) */
  value1?: string;
  value2?: string;
}

export async function doRecharge(args: RechargeArgs): Promise<A1Response> {
  if (!isA1TopupConfigured()) {
    throw new Error("A1Topup credentials not configured (set A1TOPUP_USERNAME + A1TOPUP_PASSWORD)");
  }
  const params: Record<string, string> = {
    username: username(),
    pwd: pwd(),
    operatorcode: args.operatorCode,
    number: args.number,
    amount: args.amountRupees.toFixed(2),
    orderid: args.requestId,
    format: "json",
  };
  if (args.circleCode) params.circlecode = args.circleCode;
  if (args.value1) params.value1 = args.value1;
  if (args.value2) params.value2 = args.value2;
  const raw = await callApi("/recharge/api", params);
  return parseA1(raw);
}

export async function checkStatus(requestId: string): Promise<A1Response> {
  if (!isA1TopupConfigured()) throw new Error("A1Topup credentials not configured");
  const raw = await callApi("/recharge/status", {
    username: username(),
    pwd: pwd(),
    orderid: requestId,
    format: "json",
  });
  return parseA1(raw);
}

export async function getBalance(): Promise<{ balance: number; raw: A1Response }> {
  if (!isA1TopupConfigured()) throw new Error("A1Topup credentials not configured");
  const raw = await callApi("/recharge/balance", {
    username: username(),
    pwd: pwd(),
    format: "json",
  });
  const r = parseA1(raw);
  return { balance: r.balance ?? 0, raw: r };
}

// ─────────────────────────────────────────────────────────────────────────────
// Money Transfer (DMT) API
// ─────────────────────────────────────────────────────────────────────────────
export interface DmtResponse {
  ok: boolean;
  status: "success" | "pending" | "failed";
  statusCode: string;
  message: string;
  raw: Record<string, unknown>;
  /** transaction id (for transfer) */
  txid?: string;
  /** operator/bank reference id */
  opid?: string;
  /** beneficiary id (for add/search) */
  benId?: string;
  /** account number echoed back */
  accountNumber?: string;
  /** ifsc echoed back */
  ifsc?: string;
  /** sender id (for sender registration) */
  senderId?: string;
  /** beneficiary list (for search_beneficiary) */
  beneficiaries?: Array<{
    benId: string;
    name: string;
    mobile?: string;
    accountNumber: string;
    ifsc: string;
    bankName?: string;
    verified?: boolean;
    raw: Record<string, unknown>;
  }>;
  /** sender info if returned by search */
  sender?: {
    name?: string;
    mobile?: string;
    limit?: number;
    used?: number;
    raw: Record<string, unknown>;
  };
}

function parseDmt(raw: Record<string, unknown>): DmtResponse {
  const status = pick<string | number>(raw, "status", "STATUS");
  const message = String(pick(raw, "message", "MESSAGE", "msg") ?? "");
  const sCode = String(status ?? "");
  let statusNorm = normaliseStatus(status, message);

  // A1Topup quirk: when status/message are both null, infer success ONLY when
  // the response carries *write-proof* fields (server-generated identifiers /
  // structured payloads). Echoed inputs alone (Sender_name, beneficiaryName,
  // pincode, sender_mobile, account_number) prove NOTHING — A1Topup also
  // echoes them on rejected calls. This is the difference between:
  //   • Real success: { txid:"...", ben_id:"...", sender_id:"..." }  → write happened
  //   • Echo-only:   { Sender_name:"...", pincode:"...", txid:null } → silently rejected
  const hasEchoData =
    pick(raw, "sender_details") !== undefined ||                                           // search returned sender object
    pick(raw, "beneficiaryList", "beneficiarylist", "beneficiary_list") !== undefined ||   // search returned ben list
    pick(raw, "ben_id", "benid", "BEN_ID", "beneficiary_id") !== undefined ||              // add_beneficiary write proof
    pick(raw, "txid", "TXID") !== undefined ||                                             // transfer/register write proof
    pick(raw, "sender_id", "senderid") !== undefined ||                                    // sender_registration write proof
    pick(raw, "reference", "reference_id", "ref_id", "request_id", "requestid") !== undefined ||
    pick(raw, "otp_sent", "otp_ref", "otp_reference") !== undefined;

  if (status === undefined || status === null || sCode === "" || sCode === "null") {
    if (hasEchoData) statusNorm = "success";
  }

  // Sender id can also live inside sender_details
  let senderId = pick<string>(raw, "sender_id", "senderid");
  const sd = raw.sender_details as Record<string, unknown> | null | undefined;
  if (!senderId && sd && typeof sd === "object") {
    senderId = pick<string>(sd, "sender_id", "senderid", "id");
  }

  return {
    ok: statusNorm !== "failed",
    status: statusNorm,
    statusCode: sCode,
    message: message || (statusNorm === "success" ? "OK" : ""),
    txid: pick<string>(raw, "txid", "TXID"),
    opid: pick<string>(raw, "opid", "OPID"),
    benId: pick<string>(raw, "ben_id", "benid", "BEN_ID"),
    accountNumber: pick<string>(raw, "number", "account_number"),
    ifsc: pick<string>(raw, "ifsc_code", "ifsc"),
    senderId,
    raw,
  };
}

/** Register a remitter (sender) for DMT. */
export async function dmtSenderRegistration(p: {
  senderMobile: string; name: string; pincode: string;
}): Promise<DmtResponse> {
  if (!isA1TopupConfigured()) throw new Error("A1Topup credentials not configured");
  const raw = await callApi("/money/sender_registration", {
    username: username(),
    pwd: pwd(),
    name: p.name,
    pincode: p.pincode,
    sender_mobile: p.senderMobile,
    format: "json",
  });
  return parseDmt(raw);
}

/** Search for an existing sender (and their beneficiaries). */
export async function dmtSearchBeneficiary(p: { senderMobile: string }): Promise<DmtResponse> {
  if (!isA1TopupConfigured()) throw new Error("A1Topup credentials not configured");
  const raw = await callApi("/money/search_beneficiary", {
    username: username(),
    pwd: pwd(),
    sender_mobile: p.senderMobile,
    format: "json",
  });
  const parsed = parseDmt(raw);
  // Beneficiary list (A1Topup uses `beneficiaryList`; tolerate other shapes too)
  const list = (raw.beneficiaryList ?? raw.beneficiarylist ?? raw.beneficiary_list
    ?? raw.beneficiaries ?? raw.beneficiary ?? raw.data ?? raw.result) as unknown;
  if (Array.isArray(list)) {
    parsed.beneficiaries = (list as Array<Record<string, unknown>>).map((b) => ({
      benId: String(pick(b, "ben_id", "benid", "id") ?? ""),
      name: String(pick(b, "ben_name", "name") ?? ""),
      mobile: pick<string>(b, "ben_mobile", "mobile"),
      accountNumber: String(pick(b, "account_number", "account") ?? ""),
      ifsc: String(pick(b, "ifsc_code", "ifsc") ?? ""),
      bankName: pick<string>(b, "bank_name", "bank"),
      verified: !!pick(b, "is_verified", "verified"),
      raw: b,
    }));
  }
  // Sender info — A1Topup uses `sender_details`
  const sender = (raw.sender_details ?? raw.sender) as Record<string, unknown> | null | undefined;
  if (sender && typeof sender === "object") {
    parsed.sender = {
      name: pick<string>(sender, "name", "sender_name", "Sender_name"),
      mobile: pick<string>(sender, "mobile", "sender_mobile"),
      limit: Number(pick(sender, "limit", "monthly_limit", "remaining_limit") ?? 0) || undefined,
      used: Number(pick(sender, "used", "consumed") ?? 0) || undefined,
      raw: sender,
    };
    if (!parsed.senderId) {
      parsed.senderId = pick<string>(sender, "sender_id", "senderid", "id");
    }
  }
  // If A1Topup returned all-null for an unknown sender, surface that as "not registered"
  if (!parsed.beneficiaries && !parsed.sender && parsed.statusCode === "null") {
    parsed.message = parsed.message || "Sender not found";
  }
  return parsed;
}

/** Add a new beneficiary for an existing sender. */
export async function dmtAddBeneficiary(p: {
  senderMobile: string; benName: string; benMobile?: string;
  accountNumber: string; ifsc: string;
}): Promise<DmtResponse> {
  if (!isA1TopupConfigured()) throw new Error("A1Topup credentials not configured");
  const params: Record<string, string> = {
    username: username(),
    pwd: pwd(),
    sender_mobile: p.senderMobile,
    ben_name: p.benName,
    account_number: p.accountNumber,
    ifsc_code: p.ifsc,
    format: "json",
  };
  if (p.benMobile) params.ben_mobile = p.benMobile;
  const raw = await callApi("/money/add_beneficiary", params);
  return parseDmt(raw);
}

/** Verify a beneficiary OTP after adding (some providers require this). */
export async function dmtVerifyBeneficiary(p: {
  senderMobile: string; benId: string; otp: string;
}): Promise<DmtResponse> {
  if (!isA1TopupConfigured()) throw new Error("A1Topup credentials not configured");
  const raw = await callApi("/money/verify_beneficiary", {
    username: username(),
    pwd: pwd(),
    sender_mobile: p.senderMobile,
    ben_id: p.benId,
    otp: p.otp,
    format: "json",
  });
  return parseDmt(raw);
}

/** Penny-drop / bank verification before transferring. */
export async function dmtVerifyBank(p: {
  senderMobile: string; accountNumber: string; ifsc: string;
  orderId: string; mode?: "VIMPS" | "VNEFT";
}): Promise<DmtResponse> {
  if (!isA1TopupConfigured()) throw new Error("A1Topup credentials not configured");
  const raw = await callApi("/money/verify_bank", {
    username: username(),
    pwd: pwd(),
    sender_mobile: p.senderMobile,
    account_number: p.accountNumber,
    ifsc_code: p.ifsc,
    orderid: p.orderId,
    mode: p.mode ?? "VIMPS",
    format: "json",
  });
  return parseDmt(raw);
}

/** Transfer money to a beneficiary via IMPS/NEFT. */
export async function dmtTransfer(p: {
  senderMobile: string; benId: string; amountRupees: number;
  mode: "IMPS" | "NEFT"; orderId: string;
}): Promise<DmtResponse> {
  if (!isA1TopupConfigured()) throw new Error("A1Topup credentials not configured");
  const raw = await callApi("/money/api", {
    username: username(),
    pwd: pwd(),
    sender_mobile: p.senderMobile,
    mode: p.mode,
    ben_id: p.benId,
    amount: p.amountRupees.toFixed(2),
    orderid: p.orderId,
    format: "json",
  });
  return parseDmt(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook signature verification (HMAC-SHA256, fail-closed)
// ─────────────────────────────────────────────────────────────────────────────
export function verifyWebhookSig(rawBody: string, signature: string | undefined): boolean {
  const secret = webhookSecret();
  if (!secret) return false;
  if (!signature) return false;
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(computed);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─────────────────────────────────────────────────────────────────────────────
// Operator catalog — official A1Topup codes (letters!) per Developer API PDF.
// Codes here are sent verbatim as `operatorcode` to A1Topup.
// ─────────────────────────────────────────────────────────────────────────────
export const OPERATORS = {
  mobile: [
    { code: "A",  name: "Airtel" },
    { code: "RC", name: "Reliance Jio" },
    { code: "V",  name: "Vodafone" },
    { code: "I",  name: "Idea" },
    { code: "BT", name: "BSNL TopUp" },
    { code: "BR", name: "BSNL STV" },
  ],
  dth: [
    { code: "ATV", name: "Airtel Digital TV" },
    { code: "TTV", name: "Tata Sky" },
    { code: "DTV", name: "Dish TV" },
    { code: "VTV", name: "Videocon D2H" },
    { code: "STV", name: "Sun Direct" },
  ],
  postpaid: [
    { code: "PAT", name: "Airtel Postpaid" },
    { code: "VP",  name: "Vodafone Postpaid" },
    { code: "IP",  name: "Idea Postpaid" },
    { code: "JPP", name: "Jio Postpaid" },
    { code: "BP",  name: "BSNL Postpaid" },
    { code: "DP",  name: "Tata Docomo Postpaid" },
  ],
  electricity: [
    // Gujarat
    { code: "PGVCL",      name: "PGVCL — Paschim Gujarat" },
    { code: "MGVCL",      name: "MGVCL — Madhya Gujarat" },
    { code: "UGVCL",      name: "UGVCL — Uttar Gujarat" },
    { code: "DGVCL",      name: "DGVCL — Dakshin Gujarat" },
    { code: "TORRENTAHM", name: "Torrent Power — Ahmedabad" },
    { code: "TORRENTSUR", name: "Torrent Power — Surat" },
    // Other commonly-needed
    { code: "BSES",      name: "BSES Rajdhani — Delhi" },
    { code: "BSESY",     name: "BSES Yamuna — Delhi" },
    { code: "TPD",       name: "Tata Power — Delhi" },
    { code: "TPDM",      name: "Tata Power — Mumbai" },
    { code: "BEST",      name: "BEST — Mumbai" },
    { code: "MSEDC",     name: "MSEDC — Maharashtra" },
    { code: "RELIANCE",  name: "Reliance Energy" },
    { code: "ADANI",     name: "Adani Power" },
  ],
  gas: [
    { code: "GG",     name: "Gujarat Gas" },
    { code: "AG",     name: "Adani Gas" },
    { code: "MG",     name: "Mahanagar Gas" },
    { code: "IG",     name: "Indraprastha Gas" },
    { code: "HPCLGC", name: "HP Gas" },
  ],
  insurance: [
    { code: "LIC", name: "LIC India" },
    { code: "ICP", name: "ICICI Prudential" },
    { code: "TAI", name: "Tata AIA" },
  ],
  giftcard: [
    { code: "GLF", name: "Google Play Gift Card" },
  ],
  fastag: [
    { code: "AXF",   name: "Axis Bank FASTag" },
    { code: "BBF",   name: "Bank of Baroda FASTag" },
    { code: "EFF",   name: "Equitas FASTag" },
    { code: "FDF",   name: "Federal Bank FASTag" },
    { code: "HDF",   name: "HDFC Bank FASTag" },
    { code: "ICF",   name: "ICICI Bank FASTag" },
    { code: "IBF",   name: "IDBI Bank FASTag" },
    { code: "IFF",   name: "IDFC First FASTag" },
    { code: "IHMCF", name: "Indian Highways Management FASTag" },
    { code: "INDF",  name: "Indusind FASTag" },
    { code: "JKF",   name: "J&K Bank FASTag" },
    { code: "KMF",   name: "Kotak Mahindra FASTag" },
    { code: "PTF",   name: "Paytm Payments Bank FASTag" },
    { code: "SBF",   name: "SBI Bank FASTag" },
  ],
  // For backward compatibility with existing `bill` type code paths.
  // Aggregates electricity + gas (was used by recharge-form.tsx historically).
  bill: [
    { code: "PGVCL",      name: "PGVCL — Paschim Gujarat" },
    { code: "MGVCL",      name: "MGVCL — Madhya Gujarat" },
    { code: "UGVCL",      name: "UGVCL — Uttar Gujarat" },
    { code: "DGVCL",      name: "DGVCL — Dakshin Gujarat" },
    { code: "TORRENTAHM", name: "Torrent Power — Ahmedabad" },
    { code: "TORRENTSUR", name: "Torrent Power — Surat" },
    { code: "GG",         name: "Gujarat Gas" },
    { code: "AG",         name: "Adani Gas" },
    { code: "MG",         name: "Mahanagar Gas" },
    { code: "IG",         name: "Indraprastha Gas" },
  ],
} as const;

/** Indian mobile circle codes — official numeric codes per A1Topup PDF. */
export const CIRCLES = [
  { code: "12", name: "Gujarat" },
  { code: "3",  name: "Mumbai" },
  { code: "4",  name: "Maharashtra" },
  { code: "5",  name: "Delhi NCR" },
  { code: "18", name: "Rajasthan" },
  { code: "16", name: "Madhya Pradesh" },
  { code: "13", name: "Andhra Pradesh" },
  { code: "9",  name: "Karnataka" },
  { code: "8",  name: "Tamil Nadu" },
  { code: "2",  name: "West Bengal" },
  { code: "10", name: "UP East" },
  { code: "11", name: "UP West" },
  { code: "1",  name: "Punjab" },
  { code: "20", name: "Haryana" },
  { code: "14", name: "Kerala" },
  { code: "23", name: "Orissa" },
  { code: "17", name: "Bihar" },
  { code: "25", name: "Jammu & Kashmir" },
  { code: "21", name: "Himachal Pradesh" },
  { code: "26", name: "North East" },
  { code: "24", name: "Assam" },
  { code: "6",  name: "Kolkata" },
  { code: "7",  name: "Chennai" },
  { code: "22", name: "Jharkhand" },
  { code: "27", name: "Chhattisgarh" },
] as const;
