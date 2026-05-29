import { apiFetch } from "@/lib/api";

export type Operator = { code: string; name: string };
export type OperatorsResponse = {
  operators: {
    mobile: Operator[];
    dth: Operator[];
    bill: Operator[];
    postpaid?: Operator[];
    electricity?: Operator[];
    gas?: Operator[];
    insurance?: Operator[];
    fastag?: Operator[];
    giftcard?: Operator[];
  };
  circles: Operator[];
};

export type RechargeType = "mobile" | "dth" | "bill";
export type RechargeStatus = "pending" | "processing" | "success" | "failed" | "refunded";

/** Frontend-facing recharge record (rupees-aware field names retained for UI). */
export interface RechargeRecord {
  id: string;
  type: RechargeType;
  operatorCode: string;
  operatorName: string;
  number: string;
  circleCode?: string | null;
  amount: number;             // paise
  commissionAmount: number;   // paise
  status: RechargeStatus;
  providerRequestId?: string | null;
  providerTxnId?: string | null;
  providerResponse?: any;
  failureReason?: string | null;
  refundedAt?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface WalletInfo {
  balance: number;            // paise
  reservedBalance: number;
  totalCredited: number;
  totalDebited: number;
  isFrozen: boolean;
  cap: number;                // paise
  capRemaining: number;       // paise
  kycStatus: "none" | "pending" | "approved" | "rejected";
  tpinSet: boolean;
  minTopup: number;
  maxTopup: number;
}

export interface LedgerEntry {
  id: string;
  direction: "credit" | "debit";
  amount: number;             // paise
  balanceAfter: number;       // paise
  reason: string;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface CommissionSlab {
  id: string;
  type: RechargeType;
  operatorCode?: string | null;
  tier: string;
  minAmount: number;          // paise
  maxAmount: number;          // paise
  percentBp: number;          // basis points (100bp = 1%)
  active: boolean;
  createdAt?: string;
}

export interface RechargeSettings {
  rechargeEnabled: boolean;
  mobileEnabled: boolean;
  dthEnabled: boolean;
  billEnabled: boolean;
  walletTopupEnabled: boolean;
  minRecharge: number;
  maxRecharge: number;
  minTopup: number;
  maxTopup: number;
  walletCapNoKyc: number;
  walletCapKyc: number;
  dailyTxnLimit: number;
  providerOk?: boolean;
  providerBalance?: number | null;
  providerConfigured?: boolean;
}

// ---------- amount helpers (paise <-> rupees) ----------
export const paiseToRupees = (paise: number): number => Math.round(paise) / 100;
export const formatINR = (paise: number): string => {
  const n = Number.isFinite(paise) ? paise : 0;
  return `₹${(n / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
export const rupeesToPaise = (rupees: number | string): number => {
  const n = typeof rupees === "string" ? parseFloat(rupees) : rupees;
  return Math.round(n * 100);
};

// ---------- KYC status normalisation ----------
function normKycStatus(s: string | undefined | null): WalletInfo["kycStatus"] {
  if (s === "verified" || s === "approved") return "approved";
  if (s === "pending" || s === "manual_pending") return "pending";
  if (s === "rejected") return "rejected";
  return "none";
}

// ---------- Wallet ----------
type RawWallet = {
  balancePaise: number;
  kycLevel?: string;
  kycStatus?: string;
  tpinSet?: boolean;
  isFrozen?: boolean;
  freezeReason?: string | null;
  capPaise: number;
  minTopupPaise?: number;
  maxTopupPaise?: number;
};

export async function getWallet(): Promise<WalletInfo> {
  const w = await apiFetch<RawWallet>("/api/wallet");
  return {
    balance: w.balancePaise,
    reservedBalance: 0,
    totalCredited: 0,
    totalDebited: 0,
    isFrozen: !!w.isFrozen,
    cap: w.capPaise,
    capRemaining: Math.max(0, w.capPaise - w.balancePaise),
    kycStatus: normKycStatus(w.kycStatus),
    tpinSet: !!w.tpinSet,
    minTopup: w.minTopupPaise ?? 1000,
    maxTopup: w.maxTopupPaise ?? 5000000,
  };
}

type RawLedger = {
  entries: Array<{
    id: number;
    direction: "credit" | "debit";
    type: string;
    amountPaise: number;
    balanceAfterPaise: number;
    refType: string | null;
    refId: number | null;
    refCode: string | null;
    note: string | null;
    createdAt: string;
  }>;
};

const LEDGER_REASON: Record<string, string> = {
  topup: "Wallet Top-up",
  recharge_debit: "Recharge",
  recharge_refund: "Recharge Refund",
  commission: "Commission",
  admin_credit: "Admin Credit",
  admin_debit: "Admin Debit",
  reversal: "Reversal",
};

export async function getLedger(limit = 50, offset = 0): Promise<{ items: LedgerEntry[]; total: number }> {
  const r = await apiFetch<RawLedger>(`/api/wallet/ledger?limit=${limit}&offset=${offset}`);
  const entries = r.entries ?? [];
  return {
    items: entries.map((e) => ({
      id: String(e.id),
      direction: e.direction,
      amount: e.amountPaise,
      balanceAfter: e.balanceAfterPaise,
      reason: LEDGER_REASON[e.type] ?? e.type,
      refType: e.refType,
      refId: e.refId == null ? null : String(e.refId),
      note: e.note,
      createdAt: e.createdAt,
    })),
    total: entries.length,
  };
}

export async function initWalletTopup(amountPaise: number) {
  const r = await apiFetch<{ transactionId: string; redirectUrl: string; amountPaise: number }>(
    "/api/wallet/topup/init",
    { method: "POST", body: JSON.stringify({ amountPaise }) },
  );
  return { topupId: r.transactionId, redirectUrl: r.redirectUrl, merchantTransactionId: r.transactionId };
}

export async function verifyWalletTopup(txn: string) {
  const r = await apiFetch<{ status: string; transactionId: string; amountPaise: number; error?: string }>(
    `/api/wallet/topup/${encodeURIComponent(txn)}/verify`,
    { method: "POST" },
  );
  // Pull fresh balance afterwards
  let balance = 0;
  try { balance = (await getWallet()).balance; } catch {/* ignore */}
  const status: "success" | "pending" | "failed" =
    r.status === "success" ? "success" : r.status === "failed" ? "failed" : "pending";
  return { status, topup: r, balance };
}

// ---------- Recharge ----------
export const getOperators = () => apiFetch<OperatorsResponse>("/api/recharge/operators");

export type OperatorDetection = {
  operatorCode: string;
  operatorName: string;
  circleCode: string;
  circleName: string;
  confidence: "high" | "low";
  /** "ezytm" = live MNP-aware lookup; "prefix" = offline TRAI table (best-effort). */
  source: "ezytm" | "prefix";
};

export async function detectOperator(number: string): Promise<OperatorDetection | null> {
  const r = await apiFetch<{ detection: OperatorDetection | null }>(
    `/api/recharge/detect?number=${encodeURIComponent(number)}`,
  );
    return r.detection;
}

// ─── Plan Browser (Ezytm) ─────────────────────────────────────────
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
export async function getPlans(operatorCode: string, circleCode: string) {
  return apiFetch<{ categories: PlanCategory[] }>(
    `/api/recharge/plans?operatorCode=${encodeURIComponent(operatorCode)}&circleCode=${encodeURIComponent(circleCode)}`
  );
}

export async function getQuote(type: RechargeType, operatorCode: string, amountPaise: number) {
  const qs = new URLSearchParams({ type, operatorCode, amountPaise: String(amountPaise) });
  const r = await apiFetch<{ tier: string; percentBp: number; sharePercent: number; baseCommissionPaise: number; commissionPaise: number; netCostPaise: number }>(
    `/api/recharge/quote?${qs}`,
  );
  const basePct = r.percentBp / 100;
  return {
    amount: amountPaise,
    commission: r.commissionPaise,
    baseCommission: r.baseCommissionPaise,
    basePct,
    sharePercent: r.sharePercent,
    tier: r.tier,
  };
}

function rawToRecharge(r: any): RechargeRecord {
  return {
    id: String(r.id),
    type: r.type,
    operatorCode: r.operatorCode,
    operatorName: r.operatorName,
    number: r.accountNumber ?? r.number ?? "",
    circleCode: r.circleCode ?? null,
    amount: Number(r.amountPaise ?? 0),
    commissionAmount: Number(r.commissionPaise ?? 0),
    status: r.status,
    providerRequestId: r.a1RequestId ?? null,
    providerTxnId: r.a1OrderId ?? r.a1OperatorRef ?? null,
    failureReason: r.errorReason ?? null,
    refundedAt: r.status === "refunded" ? (r.completedAt ?? null) : null,
    createdAt: r.createdAt,
    completedAt: r.completedAt ?? null,
  };
}

export async function initRecharge(p: {
  type: RechargeType; operatorCode: string; number: string; amount: number;
  circleCode?: string; customerName?: string; tpin?: string; idempotencyKey: string;
  /** Session token from fetchBill (bill-info) — required by some utility operators (e.g. PGVCL) */
  billSession?: string | null;
}): Promise<RechargeRecord> {
  const r = await apiFetch<any>("/api/recharge", {
    method: "POST",
    body: JSON.stringify({
      type: p.type,
      operatorCode: p.operatorCode,
      number: p.number,
      amountPaise: p.amount,
      circleCode: p.circleCode,
      customerName: p.customerName,
      tpin: p.tpin,
      idempotencyKey: p.idempotencyKey,
      billSession: p.billSession ?? undefined,
    }),
  });
  return rawToRecharge(r);
}

export interface BillInfoResult {
  found: boolean;
  consumerName: string | null;
  dueAmount: number | null;
  dueDate: string | null;
  billNumber: string | null;
  /** Session token from A1Topup fetchbill — must be sent as billSession on payment */
  session: string | null;
}

export async function fetchBillInfo(operatorCode: string, consumerNumber: string): Promise<BillInfoResult> {
  const qs = new URLSearchParams({ operatorCode, consumerNumber });
  return apiFetch<BillInfoResult>(`/api/recharge/bill-info?${qs}`);
}

export async function getRechargeHistory(limit = 50, offset = 0, status?: string) {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (status) qs.set("status", status);
  const r = await apiFetch<{ recharges: any[] }>(`/api/recharge?${qs}`);
  const items = (r.recharges ?? []).filter((x) => !status || x.status === status).map(rawToRecharge);
  return { items, total: items.length };
}

export async function getRechargeReceipt(id: string): Promise<RechargeRecord> {
  const r = await apiFetch<any>(`/api/recharge/${id}`);
  return rawToRecharge(r);
}

export async function pollRechargeStatus(id: string): Promise<RechargeRecord> {
  const r = await apiFetch<any>(`/api/recharge/${id}/status`, { method: "POST" });
  return rawToRecharge(r);
}

// ---------- KYC ----------
export interface KycRecord {
  id: string;
  userId: string;
  status: "pending" | "approved" | "rejected";
  kycMethod: "manual" | "digital";
  fullName: string;
  panNumber: string;
  aadhaarLast4: string;
  panImagePath: string;
  aadhaarFrontPath: string;
  aadhaarBackPath: string;
  selfiePath?: string | null;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  ocrPanExtracted?: string | null;
  ocrNameExtracted?: string | null;
  ocrAadhaarExtracted?: string | null;
  ocrConfidence?: string | null;
}

export interface DigitalKycResponse extends KycRecord {
  ocrResult?: {
    panExtracted: string | null;
    nameExtracted: string | null;
    aadhaarLast4Extracted: string | null;
    confidence: string;
    mismatches: string[];
    verified: boolean;
  };
}

function rawToKyc(r: any): KycRecord {
  return {
    id: String(r.id),
    userId: String(r.userId),
    status: normKycStatus(r.status) as any,
    kycMethod: r.kycMethod ?? "manual",
    fullName: r.fullName ?? "",
    panNumber: r.panNumber ?? "",
    aadhaarLast4: r.aadhaarLast4 ?? "",
    panImagePath: r.panImageUrl ?? r.panImagePath ?? "",
    aadhaarFrontPath: r.aadhaarFrontUrl ?? r.aadhaarFrontPath ?? "",
    aadhaarBackPath: r.aadhaarBackUrl ?? r.aadhaarBackPath ?? "",
    selfiePath: r.selfieUrl ?? r.selfiePath ?? null,
    rejectionReason: r.rejectReason ?? r.rejectionReason ?? null,
    reviewedAt: r.reviewedAt ?? null,
    createdAt: r.submittedAt ?? r.createdAt ?? new Date().toISOString(),
    ocrPanExtracted: r.ocrPanExtracted ?? null,
    ocrNameExtracted: r.ocrNameExtracted ?? null,
    ocrAadhaarExtracted: r.ocrAadhaarExtracted ?? null,
    ocrConfidence: r.ocrConfidence ?? null,
  };
}

export async function getMyKyc(): Promise<KycRecord | null> {
  const r = await apiFetch<any>("/api/kyc");
  if (!r || r.status === "none") return null;
  return rawToKyc(r);
}

export async function submitKyc(body: {
  fullName: string;
  panNumber: string;
  aadhaarLast4: string;
  panImagePath: string;
  aadhaarFrontPath: string;
  aadhaarBackPath: string;
  selfiePath?: string;
  dob?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
}): Promise<KycRecord> {
  const r = await apiFetch<any>("/api/kyc", {
    method: "POST",
    body: JSON.stringify({
      fullName: body.fullName,
      dob: body.dob || "1990-01-01",
      panNumber: body.panNumber.toUpperCase(),
      aadhaarLast4: body.aadhaarLast4,
      addressLine: body.addressLine || "Address pending",
      city: body.city || "Ahmedabad",
      state: body.state || "Gujarat",
      pincode: body.pincode || "380001",
      panImageUrl: body.panImagePath,
      aadhaarFrontUrl: body.aadhaarFrontPath,
      aadhaarBackUrl: body.aadhaarBackPath,
      selfieUrl: body.selfiePath || body.panImagePath,
    }),
  });
  return rawToKyc(r);
}

export async function submitDigitalKyc(body: {
  fullName: string;
  panNumber: string;
  aadhaarLast4: string;
  panImagePath: string;
  aadhaarFrontPath: string;
  aadhaarBackPath: string;
  selfiePath?: string;
  dob?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
}): Promise<DigitalKycResponse> {
  const r = await apiFetch<any>("/api/kyc/digital", {
    method: "POST",
    body: JSON.stringify({
      fullName: body.fullName,
      dob: body.dob || "1990-01-01",
      panNumber: body.panNumber.toUpperCase(),
      aadhaarLast4: body.aadhaarLast4,
      addressLine: body.addressLine || "Address pending",
      city: body.city || "Ahmedabad",
      state: body.state || "Gujarat",
      pincode: body.pincode || "380001",
      panImageUrl: body.panImagePath,
      aadhaarFrontUrl: body.aadhaarFrontPath,
      aadhaarBackUrl: body.aadhaarBackPath,
      selfieUrl: body.selfiePath || body.panImagePath,
    }),
  });
  return { ...rawToKyc(r), ocrResult: r.ocrResult };
}

// ---------- T-PIN ----------
export async function getTpinStatus() {
  const r = await apiFetch<{ tpinSet: boolean }>("/api/tpin/status");
  return { hasPin: !!r.tpinSet };
}
export const setTpin = (pin: string) =>
  apiFetch<{ ok: true }>("/api/tpin/set", { method: "POST", body: JSON.stringify({ pin }) });
export const changeTpin = (oldPin: string, newPin: string) =>
  apiFetch<{ ok: true }>("/api/tpin/change", { method: "POST", body: JSON.stringify({ oldPin, newPin }) });

// ---------- Admin: recharges ----------
export async function adminListRecharges(params: { limit?: number; offset?: number; status?: string; type?: string; q?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.limit) qs.set("limit", String(params.limit));
  const r = await apiFetch<{ items: any[] }>(`/api/admin/recharge?${qs}`);
  let items = (r.items ?? []).map((x) => ({
    ...rawToRecharge(x),
    user: x.user as { id: number; name: string; email: string; mobile: string } | undefined,
  }));
  if (params.type) items = items.filter((i) => i.type === params.type);
  if (params.q) {
    const q = params.q.toLowerCase();
    items = items.filter((i) =>
      i.number.toLowerCase().includes(q) ||
      (i.user?.email ?? "").toLowerCase().includes(q) ||
      (i.user?.mobile ?? "").toLowerCase().includes(q) ||
      (i.providerRequestId ?? "").toLowerCase().includes(q),
    );
  }
  return { items, total: items.length };
}

export const adminRefundRecharge = (id: string, reason: string) =>
  apiFetch<{ ok: true }>(`/api/admin/recharge/${id}/refund`, { method: "POST", body: JSON.stringify({ reason }) });

// ---------- Admin: commission slabs ----------
export async function adminListSlabs() {
  const r = await apiFetch<{ slabs: any[] }>("/api/admin/commission-slabs");
  return {
    items: (r.slabs ?? []).map((s): CommissionSlab => ({
      id: String(s.id),
      type: s.type,
      operatorCode: s.operatorCode === "*" ? null : s.operatorCode,
      tier: s.tier,
      minAmount: Number(s.minAmountPaise ?? 0),
      maxAmount: Number(s.maxAmountPaise ?? 0),
      percentBp: Number(s.percentBp ?? 0),
      active: !!s.isActive,
    })),
  };
}

export async function adminUpsertSlab(s: {
  id?: string;
  type: RechargeType;
  operatorCode?: string | null;
  tier?: string;
  minAmount: number;
  maxAmount: number;
  percentBp?: number;
  active?: boolean;
}) {
  const tier = s.tier ?? "base";
  const percentBp = s.percentBp ?? 0;
  const body = {
    type: s.type,
    operatorCode: s.operatorCode || "*",
    tier,
    percentBp,
    minAmountPaise: s.minAmount,
    maxAmountPaise: s.maxAmount,
    isActive: s.active ?? true,
  };
  if (s.id) {
    await apiFetch<{ ok: true }>(`/api/admin/commission-slabs/${s.id}`, {
      method: "PATCH", body: JSON.stringify(body),
    });
    return { id: s.id };
  }
  return apiFetch<{ id: number }>("/api/admin/commission-slabs", { method: "POST", body: JSON.stringify(body) });
}

export const adminDeleteSlab = (id: string) =>
  apiFetch<{ ok: true }>(`/api/admin/commission-slabs/${id}`, { method: "DELETE" });

export const adminResetSlabs = () =>
  apiFetch<{ ok: true }>("/api/admin/commission-slabs/reset", { method: "POST" });

export const OPERATOR_NAMES: Record<string, string> = {
  "V": "Vodafone", "A": "Airtel", "RC": "Jio", "BT": "BSNL TopUp", "BR": "BSNL STV", "I": "Idea",
  "DTV": "Dish TV", "ATV": "Airtel Digital TV", "STV": "Sun Direct", "VTV": "Videocon D2H", "TTV": "Tata Sky",
  "PAT": "Airtel Postpaid", "VP": "Vodafone Postpaid", "IP": "Idea Postpaid", "JPP": "Jio Postpaid", "BP": "BSNL Postpaid",
  "GG": "Gujarat Gas", "AG": "Adani Gas", "MG": "Mahanagar Gas", "IG": "Indraprastha Gas", "HPCLGC": "HP Gas",
  "AXF": "Axis FASTag", "BBF": "BOB FASTag", "EFF": "Equitas FASTag", "FDF": "Federal FASTag",
  "HDF": "HDFC FASTag", "ICF": "ICICI FASTag", "IBF": "IDBI FASTag", "IFF": "IDFC FASTag",
  "IHMCF": "IHM FASTag", "INDF": "IndusInd FASTag", "JKF": "J&K FASTag", "KMF": "Kotak FASTag",
  "PTF": "Paytm FASTag", "SBF": "SBI FASTag",
  "ICP": "ICICI Prudential", "TAI": "Tata AIA",
  "PGVCL": "PGVCL", "MGVCL": "MGVCL", "UGVCL": "UGVCL", "DGVCL": "DGVCL",
  "TORRENTAHM": "Torrent Ahmedabad", "TORRENTSUR": "Torrent Surat",
};

// ---------- Admin: recharge settings ----------
export async function adminGetSettings(): Promise<RechargeSettings> {
  const r = await apiFetch<any>("/api/admin/recharge-settings");
  return {
    rechargeEnabled: !!r.rechargeEnabled,
    mobileEnabled: !!r.mobileEnabled,
    dthEnabled: !!r.dthEnabled,
    billEnabled: !!r.billEnabled,
    walletTopupEnabled: r.walletTopupEnabled !== false,
    minRecharge: Number(r.minRechargePaise ?? 1000),
    maxRecharge: Number(r.maxRechargePaise ?? 500000),
    minTopup: Number(r.minTopupPaise ?? 1000),
    maxTopup: Number(r.maxTopupPaise ?? 5000000),
    walletCapNoKyc: Number(r.walletCapNoKycPaise ?? 1000000),
    walletCapKyc: Number(r.walletCapKycPaise ?? 5000000),
    dailyTxnLimit: Number(r.dailyRechargeCountLimit ?? 50),
    providerOk: !!r.providerOk,
    providerBalance: r.providerBalance ?? null,
    providerConfigured: !!r.providerConfigured,
  };
}

export async function adminUpdateSettings(p: Partial<RechargeSettings>): Promise<RechargeSettings> {
  const body: Record<string, any> = {};
  if (p.rechargeEnabled !== undefined) body.rechargeEnabled = p.rechargeEnabled;
  if (p.mobileEnabled !== undefined) body.mobileEnabled = p.mobileEnabled;
  if (p.dthEnabled !== undefined) body.dthEnabled = p.dthEnabled;
  if (p.billEnabled !== undefined) body.billEnabled = p.billEnabled;
  if (p.minRecharge !== undefined) body.minRechargePaise = p.minRecharge;
  if (p.maxRecharge !== undefined) body.maxRechargePaise = p.maxRecharge;
  if (p.minTopup !== undefined) body.minTopupPaise = p.minTopup;
  if (p.maxTopup !== undefined) body.maxTopupPaise = p.maxTopup;
  if (p.walletCapNoKyc !== undefined) body.walletCapNoKycPaise = p.walletCapNoKyc;
  if (p.walletCapKyc !== undefined) body.walletCapKycPaise = p.walletCapKyc;
  if (p.dailyTxnLimit !== undefined) body.dailyRechargeCountLimit = p.dailyTxnLimit;
  await apiFetch<any>("/api/admin/recharge-settings", { method: "PATCH", body: JSON.stringify(body) });
  return adminGetSettings();
}

// ---------- Admin: wallets ----------
export async function adminListWallets(_q?: string, limit = 50, _offset = 0) {
  const r = await apiFetch<{ items: any[] }>(`/api/admin/wallets?limit=${limit}`);
  return {
    items: (r.items ?? []).map((w): WalletInfo & { userId: string; user?: any } => ({
      userId: String(w.userId),
      user: w.user,
      balance: Number(w.balancePaise ?? 0),
      reservedBalance: 0,
      totalCredited: 0,
      totalDebited: 0,
      isFrozen: !!w.isFrozen,
      cap: 0,
      capRemaining: 0,
      kycStatus: normKycStatus(w.kycLevel),
      tpinSet: false,
      minTopup: 0,
      maxTopup: 0,
    })),
    total: 0,
  };
}

export const adminAdjustWallet = (
  userId: string, direction: "credit" | "debit", amountPaise: number, reason: string,
) =>
  apiFetch<{ ok: true; balancePaise: number }>(`/api/admin/wallets/${userId}/adjust`, {
    method: "POST",
    body: JSON.stringify({ direction, amountPaise, reason }),
  });

export const adminFreezeWallet = (userId: string, frozen: boolean) =>
  apiFetch<{ ok: true }>(
    `/api/admin/wallets/${userId}/${frozen ? "freeze" : "unfreeze"}`,
    { method: "POST", body: JSON.stringify({ reason: frozen ? "Frozen by admin" : "" }) },
  );

// ---------- Admin: KYC ----------
export async function adminListKyc(status?: string) {
  const qs = new URLSearchParams();
  if (status && status !== "all") qs.set("status", status === "approved" ? "verified" : status);
  const r = await apiFetch<{ items: any[] }>(`/api/admin/kyc?${qs}`);
  return {
    items: (r.items ?? []).map((k) => ({ ...rawToKyc(k), user: k.user })),
  };
}

export const adminApproveKyc = (id: string) =>
  apiFetch<{ ok: true }>(`/api/admin/kyc/${id}/approve`, { method: "POST" });

export const adminRejectKyc = (id: string, reason: string) =>
  apiFetch<{ ok: true }>(`/api/admin/kyc/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });

// ---------- Recharge dashboard (per-operator, today) ----------
export interface RechargeDashboard {
  day: { startUtc: string; nowUtc: string; endUtc?: string; tz: string; isToday?: boolean };
  wallet: { currentBalancePaise: number; openingBalancePaise: number; closingBalancePaise?: number };
  today: {
    totalCount: number;
    successCount: number;
    failedCount: number;
    pendingCount: number;
    refundedCount: number;
    rechargeDebitPaise: number;
    profitPaise: number;
    refundCreditPaise: number;
    walletTopupPaise: number;
    walletTopupCount: number;
  };
  operators: Array<{
    operatorName: string;
    operatorCode: string;
    type: RechargeType;
    successCount: number;
    successAmountPaise: number;
    profitPaise: number;
  }>;
}
export const getRechargeDashboard = (date?: string) =>
  apiFetch<RechargeDashboard>(`/api/recharge/dashboard${date ? `?date=${encodeURIComponent(date)}` : ""}`);

// ---------- Phase 1: Day Book / Ledger Report / My Earning / Search ----------

export interface EarningReport {
  range: { from: string | null; to: string | null; fromUtc: string; toExclusiveUtc: string; tz: string };
  summary: {
    successCount: number;
    successAmountPaise: number;
    profitPaise: number;
    failedCount: number;
    refundedCount: number;
  };
  operators: Array<{
    operatorName: string;
    operatorCode: string;
    type: RechargeType;
    successCount: number;
    successAmountPaise: number;
    profitPaise: number;
  }>;
  days: Array<{ day: string; successCount: number; successAmountPaise: number; profitPaise: number }>;
}
export const getEarningReport = (from: string, to: string) =>
  apiFetch<EarningReport>(`/api/recharge/earning?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

export interface LedgerRangeReport {
  range: { from: string; to: string; fromUtc: string; toExclusiveUtc: string; tz: string };
  summary: { openingBalancePaise: number; closingBalancePaise: number; creditPaise: number; debitPaise: number; count: number; displayed?: number };
  entries: Array<{
    id: number;
    direction: "credit" | "debit";
    type: string;
    amountPaise: number;
    balanceAfterPaise: number;
    refType: string | null;
    refId: number | null;
    refCode: string | null;
    note: string | null;
    createdAt: string;
  }>;
}
export const getLedgerRange = (from: string, to: string) =>
  apiFetch<LedgerRangeReport>(`/api/wallet/ledger/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

export interface SearchRechargeResult {
  query: string;
  count: number;
  recharges: RechargeRecord[];
}
export async function searchRecharge(q: string): Promise<SearchRechargeResult> {
  const r = await apiFetch<{ query: string; count: number; recharges: any[] }>(
    `/api/recharge/search?q=${encodeURIComponent(q)}`,
  );
  return { query: r.query, count: r.count, recharges: (r.recharges ?? []).map(rawToRecharge) };
}

// ---------- Admin: Reports & Analytics ----------
export interface ReportSummary {
  from: string;
  to: string;
  recharges: {
    total: number;
    successCount: number;
    failedCount: number;
    processingCount: number;
    refundedCount: number;
    totalAmountPaise: number;
    totalCommissionPaise: number;
    refundedAmountPaise: number;
    uniqueUsers: number;
  };
  walletTopup: { count: number; amountPaise: number };
}

export interface TimeseriesPoint {
  bucket: string;
  count: number;
  successCount: number;
  failedCount: number;
  amountPaise: number;
  commissionPaise: number;
}

export interface OperatorBreakdown {
  type: RechargeType;
  operatorCode: string;
  operatorName: string;
  count: number;
  successCount: number;
  failedCount: number;
  amountPaise: number;
  commissionPaise: number;
  successRate: number;
}

export interface UserBreakdown {
  userId: number;
  name: string | null;
  email: string;
  mobile: string | null;
  count: number;
  successCount: number;
  amountPaise: number;
  commissionPaise: number;
}

const dateRangeQuery = (from: string, to: string) =>
  new URLSearchParams({ from, to }).toString();

export const adminReportsSummary = (from: string, to: string) =>
  apiFetch<ReportSummary>(`/api/admin/reports/summary?${dateRangeQuery(from, to)}`);

export const adminReportsTimeseries = (from: string, to: string, groupBy: "day" | "month" = "day") =>
  apiFetch<{ from: string; to: string; groupBy: string; points: TimeseriesPoint[] }>(
    `/api/admin/reports/timeseries?${dateRangeQuery(from, to)}&groupBy=${groupBy}`,
  );

export const adminReportsOperators = (from: string, to: string) =>
  apiFetch<{ items: OperatorBreakdown[] }>(`/api/admin/reports/operators?${dateRangeQuery(from, to)}`);

export const adminReportsUsers = (from: string, to: string, limit = 20) =>
  apiFetch<{ items: UserBreakdown[] }>(`/api/admin/reports/users?${dateRangeQuery(from, to)}&limit=${limit}`);

export function adminReportsExportUrl(from: string, to: string, kind: "recharges" | "wallet" = "recharges"): string {
  return `/api/admin/reports/export?${dateRangeQuery(from, to)}&kind=${kind}`;
}

// ---------- Operator membership (lifetime tiers: silver / gold / premium) ----
export type OperatorTier = "silver" | "gold" | "premium";

export interface OperatorPlan {
  id: OperatorTier;
  name: string;
  pricePaise: number;
  tagline: string;
  commissionLabel: string;
  features: string[];
}

export type ServiceRequestKind =
  | "Insurance Payment"
  | "Money Transfer"
  | "Sender Registration"
  | "Add Beneficiary"
  | "Verify Beneficiary"
  | "Search Beneficiary"
  | "NSDL PAN Card"
  | "NSDL New PAN"
  | "NSDL PAN Correction"
  | "Postpaid Bill"
  | "Electricity Bill"
  | "Gas Bill";

export async function submitServiceRequest(service: ServiceRequestKind, fields: Record<string, string>) {
  return apiFetch<{ status: string; message: string }>("/api/service-request", {
    method: "POST",
    body: JSON.stringify({ service, fields }),
  });
}

export async function getOperatorMembershipPlans(): Promise<OperatorPlan[]> {
  const r = await apiFetch<{ plans: OperatorPlan[] }>("/api/operator-membership/plans");
  return r.plans;
}

export interface OperatorMembershipStatus {
  tier: OperatorTier;            // effective tier (factors in active Prime)
  purchasedTier: OperatorTier;   // what they actually paid for
  viaPrime: boolean;             // true → premium is auto-active via Prime sub
  primeActive: boolean;
  plan: OperatorPlan | null;
}
export async function getOperatorMembershipStatus(): Promise<OperatorMembershipStatus> {
  return apiFetch<OperatorMembershipStatus>("/api/operator-membership/status");
}

export async function initOperatorMembership(planId: OperatorTier) {
  return apiFetch<{ status?: string; tier?: OperatorTier; transactionId?: string; redirectUrl?: string; amountPaise?: number; plan?: OperatorTier }>(
    "/api/operator-membership/init",
    { method: "POST", body: JSON.stringify({ planId }) },
  );
}

export async function verifyOperatorMembership(txn: string) {
  return apiFetch<{ status: string; tier: OperatorTier; error?: string }>(
    `/api/operator-membership/${encodeURIComponent(txn)}/verify`,
    { method: "POST" },
  );
}

// ---------- Manual wallet top-up ----------
export interface PaymentInfo {
  bank: { bankName: string; accountName: string; accountNumber: string; ifsc: string; branch: string };
  upi: { merchantName: string; qrImageUrl: string; terminalId: string; upiId: string };
  notes: string[];
}
export async function getPaymentInfo() {
  return apiFetch<PaymentInfo>("/api/wallet/payment-info");
}
export async function submitManualTopup(args: {
  amountPaise: number;
  channel: "bank" | "upi";
  utr: string;
  proofUrl: string;
  userNote?: string;
}) {
  return apiFetch<{ transactionId: string; id: number; status: string; amountPaise: number; message: string }>(
    "/api/wallet/topup/manual",
    { method: "POST", body: JSON.stringify(args) },
  );
}

export interface ManualTopupAdminItem {
  id: number;
  transactionId: string;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  userMobile: string | null;
  amountPaise: number;
  method: string;
  channel: string | null;
  utr: string | null;
  proofUrl: string | null;
  userNote: string | null;
  adminNote: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
}
export async function adminListManualTopups(status: string = "awaiting_review") {
  return apiFetch<{ items: ManualTopupAdminItem[] }>(
    `/api/admin/manual-topups?status=${encodeURIComponent(status)}`,
  );
}
export async function adminApproveManualTopup(id: number, note?: string) {
  return apiFetch<{ ok: boolean; balancePaise?: number }>(
    `/api/admin/manual-topups/${id}/approve`,
    { method: "POST", body: JSON.stringify({ note }) },
  );
}
export async function adminRejectManualTopup(id: number, reason: string) {
  return apiFetch<{ ok: boolean }>(
    `/api/admin/manual-topups/${id}/reject`,
    { method: "POST", body: JSON.stringify({ note: reason }) },
  );
}

// ---------- Object Storage upload helper ----------
export async function uploadFileToStorage(file: File): Promise<string> {
  const reqRes = await apiFetch<{ uploadURL?: string; url?: string; objectPath?: string; publicUrl?: string }>(
    "/api/storage/uploads/request-url",
    {
      method: "POST",
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    },
  );
  const uploadUrl = reqRes.uploadURL ?? reqRes.url;
  if (!uploadUrl) throw new Error("No upload URL");
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error("Upload failed");
  return reqRes.publicUrl ?? reqRes.objectPath ?? uploadUrl.split("?")[0];
}
