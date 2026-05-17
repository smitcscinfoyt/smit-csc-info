/**
 * PhonePe Payment Gateway Integration
 *
 * Supports both API versions, auto-detected from PHONEPE_BASE_URL:
 *   v1 (checksum/hermes): PHONEPE_BASE_URL contains "hermes"
 *      - Credentials: PHONEPE_MERCHANT_ID + PHONEPE_CLIENT_SECRET (= saltKey) + PHONEPE_CLIENT_VERSION (= saltIndex)
 *      - Endpoint: POST /pg/v1/pay  with X-VERIFY header
 *
 *   v2 (OAuth/pg): PHONEPE_BASE_URL contains "pg" or not set
 *      - Credentials: PHONEPE_CLIENT_ID + PHONEPE_CLIENT_SECRET + PHONEPE_MERCHANT_ID
 *      - Endpoint: POST /checkout/v2/pay  with O-Bearer token
 */

import crypto from "crypto";

// ─── Env helpers ──────────────────────────────────────────────────────────────
function getMerchantId(): string   { return process.env.PHONEPE_MERCHANT_ID   ?? ""; }
function getClientId(): string     { return process.env.PHONEPE_CLIENT_ID     ?? ""; }
function getClientSecret(): string { return process.env.PHONEPE_CLIENT_SECRET ?? ""; }
function getSaltIndex(): string    { return process.env.PHONEPE_CLIENT_VERSION ?? "1"; }
function getBaseUrl(): string      { return process.env.PHONEPE_BASE_URL ?? ""; }

// ─── API version detection ────────────────────────────────────────────────────
// v2 OAuth credentials have:
//   - PHONEPE_CLIENT_ID  (OAuth client id, e.g. "SU..." for sandbox)
//   - PHONEPE_CLIENT_SECRET (OAuth client secret, UUID format)
//
// v1 checksum credentials have:
//   - No PHONEPE_CLIENT_ID — only PHONEPE_MERCHANT_ID + a salt key in CLIENT_SECRET
//   - PHONEPE_BASE_URL explicitly contains "hermes" or "pg-sandbox"
//
// Rule: if PHONEPE_CLIENT_ID is set → always use v2 OAuth (even if PHONEPE_BASE_URL looks like v1).
function isV1Api(): boolean {
  // If a CLIENT_ID is configured these are v2 OAuth credentials — never use v1 for them.
  if (getClientId()) return false;

  // No CLIENT_ID: fall back to detecting v1 from base URL
  const url = getBaseUrl();
  return url.includes("hermes") || url.includes("pg-sandbox") || url.includes("api-preprod");
}

// ─── URL constants ────────────────────────────────────────────────────────────
const V1_PAY_PATH     = "/pg/v1/pay";
const V1_STATUS_PATH  = "/pg/v1/status";
const V2_OAUTH_URL    = "https://api.phonepe.com/apis/identity-manager/v1/oauth/token";
const V2_PG_BASE      = "https://api.phonepe.com/apis/pg";

// PhonePe-published endpoints:
//   Sandbox v1  → https://api-preprod.phonepe.com/apis/pg-sandbox
//   Production v1 → https://api.phonepe.com/apis/hermes
const V1_SANDBOX_BASE    = "https://api-preprod.phonepe.com/apis/pg-sandbox";
const V1_PRODUCTION_BASE = "https://api.phonepe.com/apis/hermes";

/**
 * Returns true when credentials are for the PhonePe sandbox/UAT environment.
 * PhonePe sandbox OAuth client IDs start with "SU" (Sandbox UAT).
 */
function isSandboxCredentials(): boolean {
  return getClientId().startsWith("SU");
}

function getV1BaseUrl(): string {
  const configured = getBaseUrl();

  // If explicitly configured to sandbox or preprod URL — trust it as-is
  if (configured.includes("api-preprod") || configured.includes("pg-sandbox")) {
    return configured;
  }

  // Auto-correct: sandbox credentials must NOT hit the production endpoint (→ 404).
  // Route them to the PhonePe sandbox environment automatically.
  if (isSandboxCredentials()) {
    console.log(
      `[PhonePe v1] Sandbox credentials detected (client_id starts with "SU"). ` +
      `Auto-routing to sandbox endpoint: ${V1_SANDBOX_BASE}`
    );
    return V1_SANDBOX_BASE;
  }

  // Production credentials — use configured URL or the standard production base
  return configured || V1_PRODUCTION_BASE;
}

function getV2PgBase(): string {
  const base = getBaseUrl();
  if (base && !base.includes("hermes")) return base;
  return V2_PG_BASE;
}

// ─── Configured check ─────────────────────────────────────────────────────────
export function isPhonePeConfigured(): boolean {
  if (isV1Api()) {
    return !!(getMerchantId() && getClientSecret());
  }
  return !!(getClientId() && getClientSecret() && getMerchantId());
}

// ─── Callback base URL ────────────────────────────────────────────────────────
export function getCallbackBaseUrl(): string {
  const domain =
    process.env.REPLIT_DEV_DOMAIN ||
    (process.env.REPLIT_DOMAINS || "").split(",")[0];
  return domain ? `https://${domain}` : "http://localhost:8080";
}

// ─────────────────────────────────────────────────────────────────────────────
//  V1 Implementation (Checksum-based)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute X-VERIFY checksum for v1 pay endpoint:
 *   SHA256(base64Payload + "/pg/v1/pay" + saltKey) + "###" + saltIndex
 */
function computeV1PayChecksum(base64Payload: string): string {
  const saltKey   = getClientSecret();  // PHONEPE_CLIENT_SECRET is the salt key in v1
  const saltIndex = getSaltIndex();     // PHONEPE_CLIENT_VERSION is the salt index (usually "1")
  const hashInput = base64Payload + V1_PAY_PATH + saltKey;
  const sha256    = crypto.createHash("sha256").update(hashInput).digest("hex");
  return `${sha256}###${saltIndex}`;
}

/**
 * Compute X-VERIFY checksum for v1 status endpoint:
 *   SHA256("/pg/v1/status/{merchantId}/{txnId}" + saltKey) + "###" + saltIndex
 */
function computeV1StatusChecksum(merchantTransactionId: string): string {
  const saltKey   = getClientSecret();
  const saltIndex = getSaltIndex();
  const merchantId = getMerchantId();
  const hashInput = `${V1_STATUS_PATH}/${merchantId}/${merchantTransactionId}${saltKey}`;
  const sha256    = crypto.createHash("sha256").update(hashInput).digest("hex");
  return `${sha256}###${saltIndex}`;
}

async function initiateV1Payment({
  merchantTransactionId,
  merchantUserId,
  amount,
  redirectUrl,
  callbackUrl,
  mobileNumber,
}: {
  merchantTransactionId: string;
  merchantUserId: string;
  amount: number;
  redirectUrl: string;
  callbackUrl: string;
  mobileNumber?: string;
}): Promise<{ phonePeRedirectUrl: string }> {
  const merchantId  = getMerchantId();
  const amountPaisa = Math.round(amount * 100);

  const payload: Record<string, unknown> = {
    merchantId,
    merchantTransactionId,
    merchantUserId,
    amount: amountPaisa,
    redirectUrl,
    redirectMode: "REDIRECT",
    callbackUrl,
    paymentInstrument: { type: "PAY_PAGE" },
  };

  if (mobileNumber) {
    const cleaned = mobileNumber.replace(/\D/g, "").slice(-10);
    if (cleaned.length === 10) payload.mobileNumber = cleaned;
  }

  const payloadJson    = JSON.stringify(payload);
  const base64Payload  = Buffer.from(payloadJson).toString("base64");
  const xVerify        = computeV1PayChecksum(base64Payload);
  const endpoint       = `${getV1BaseUrl()}${V1_PAY_PATH}`;

  console.log(
    `[PhonePe v1] POST ${endpoint}\n` +
    `  merchantId:            ${merchantId}\n` +
    `  merchantTransactionId: ${merchantTransactionId}\n` +
    `  amount:                ₹${amount} = ${amountPaisa} paisa\n` +
    `  redirectUrl:           ${redirectUrl}\n` +
    `  callbackUrl:           ${callbackUrl}\n` +
    `  saltIndex:             ${getSaltIndex()}\n` +
    `  X-VERIFY:              ${xVerify}\n` +
    `  payload (raw):         ${payloadJson}`
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "X-VERIFY":      xVerify,
    },
    body: JSON.stringify({ request: base64Payload }),
  });

  const rawResp = await response.text();
  let data: {
    success?: boolean;
    code?: string;
    message?: string;
    data?: {
      merchantId?: string;
      merchantTransactionId?: string;
      instrumentResponse?: {
        type?: string;
        redirectInfo?: { url?: string; method?: string };
      };
    };
  };

  try {
    data = JSON.parse(rawResp);
  } catch {
    throw new Error(`PhonePe v1 non-JSON response (HTTP ${response.status}): ${rawResp}`);
  }

  console.log(
    `[PhonePe v1] Response HTTP ${response.status}:\n` +
    JSON.stringify(data, null, 2)
  );

  const redirectInfoUrl = data?.data?.instrumentResponse?.redirectInfo?.url;

  if (!data.success || !redirectInfoUrl) {
    const detail = data.message ?? data.code ?? rawResp;
    throw new Error(
      `PhonePe v1 initiation failed (HTTP ${response.status}, success=${data.success}): ${detail}`
    );
  }

  // Sandbox detection (UAT URL contains "preprod" or "t2")
  if (redirectInfoUrl.includes("mercury-t2") || redirectInfoUrl.includes("preprod")) {
    console.warn(
      `[PhonePe v1] ⚠️  Payment page is SANDBOX (${redirectInfoUrl}). ` +
      `UPI/QR will NOT work in test mode. Ensure PHONEPE_BASE_URL, PHONEPE_MERCHANT_ID ` +
      `and PHONEPE_CLIENT_SECRET are production values.`
    );
  } else {
    console.log(`[PhonePe v1] ✅ Production payment URL: ${redirectInfoUrl}`);
  }

  return { phonePeRedirectUrl: redirectInfoUrl };
}

async function checkV1Status(merchantTransactionId: string): Promise<{
  success: boolean;
  state: string;
  details?: unknown;
}> {
  const merchantId  = getMerchantId();
  const xVerify     = computeV1StatusChecksum(merchantTransactionId);
  const endpoint    = `${getV1BaseUrl()}${V1_STATUS_PATH}/${merchantId}/${merchantTransactionId}`;

  console.log(
    `[PhonePe v1] GET ${endpoint}\n` +
    `  X-VERIFY: ${xVerify}`
  );

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-VERIFY":     xVerify,
      "X-MERCHANT-ID": merchantId,
    },
  });

  const rawResp = await response.text();
  let data: {
    success?: boolean;
    code?: string;
    message?: string;
    data?: {
      state?: string;
      responseCode?: string;
      merchantTransactionId?: string;
      transactionId?: string;
      amount?: number;
    };
  };

  try {
    data = JSON.parse(rawResp);
  } catch {
    throw new Error(`PhonePe v1 status non-JSON (HTTP ${response.status}): ${rawResp}`);
  }

  console.log(
    `[PhonePe v1] Status response HTTP ${response.status}:\n` +
    JSON.stringify(data, null, 2)
  );

  // v1 success codes: PAYMENT_SUCCESS
  const state   = data?.data?.state ?? data?.data?.responseCode ?? (data.success ? "COMPLETED" : "FAILED");
  const success = data.success === true && (
    state === "COMPLETED" || state === "PAYMENT_SUCCESS"
  );

  return { success, state, details: data };
}

// ─────────────────────────────────────────────────────────────────────────────
//  V2 Implementation (OAuth-based)
// ─────────────────────────────────────────────────────────────────────────────

interface TokenCache { token: string; expiresAt: number; }
let tokenCache: TokenCache | null = null;

async function getV2AccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const params = new URLSearchParams({
    grant_type:     "client_credentials",
    client_id:      getClientId(),
    client_secret:  getClientSecret(),
    client_version: getSaltIndex(),
  });

  console.log(`[PhonePe v2] Fetching OAuth token — client_id: ${getClientId()}`);

  const response = await fetch(V2_OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const rawResp = await response.text();
  let data: { access_token?: string; expires_in?: number; error?: string; error_description?: string };

  try {
    data = JSON.parse(rawResp);
  } catch {
    throw new Error(`PhonePe v2 OAuth non-JSON (HTTP ${response.status}): ${rawResp}`);
  }

  console.log(`[PhonePe v2] OAuth response HTTP ${response.status}:`, JSON.stringify(data));

  if (!data.access_token) {
    throw new Error(
      `PhonePe v2 OAuth failed (HTTP ${response.status}): ${data.error_description ?? data.error ?? rawResp}`
    );
  }

  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

async function initiateV2Payment({
  merchantTransactionId,
  amount,
  redirectUrl,
  mobileNumber,
}: {
  merchantTransactionId: string;
  merchantUserId: string;
  amount: number;
  redirectUrl: string;
  mobileNumber?: string;
}): Promise<{ phonePeRedirectUrl: string }> {
  const token       = await getV2AccessToken();
  const merchantId  = getMerchantId();
  const amountPaisa = Math.round(amount * 100);

  const body: Record<string, unknown> = {
    merchantOrderId: merchantTransactionId,
    amount: amountPaisa,
    expireAfter: 1200,
    paymentFlow: {
      type: "PG_CHECKOUT",
      message: "Smit CSC Info Membership",
      merchantUrls: { redirectUrl },
    },
  };

  if (merchantId) body.merchantId = merchantId;

  if (mobileNumber) {
    const cleaned = mobileNumber.replace(/\D/g, "").slice(-10);
    if (cleaned.length === 10) body.mobileNumber = cleaned;
  }

  console.log(
    `[PhonePe v2] POST ${getV2PgBase()}/checkout/v2/pay\n` +
    `  merchantOrderId: ${merchantTransactionId}\n` +
    `  amount: ₹${amount} = ${amountPaisa} paisa`
  );

  const response = await fetch(`${getV2PgBase()}/checkout/v2/pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `O-Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const rawResp = await response.text();
  let data: {
    orderId?: string;
    state?: string;
    redirectUrl?: string;
    paymentPages?: Array<{ type: string; redirectUrl: string }>;
    message?: string;
    error?: string;
  };

  try {
    data = JSON.parse(rawResp);
  } catch {
    throw new Error(`PhonePe v2 non-JSON (HTTP ${response.status}): ${rawResp}`);
  }

  console.log(`[PhonePe v2] Response HTTP ${response.status}:\n` + JSON.stringify(data, null, 2));

  const phonePeRedirectUrl = data.redirectUrl ?? data.paymentPages?.[0]?.redirectUrl;

  if (!phonePeRedirectUrl) {
    throw new Error(
      `PhonePe v2 initiation failed (HTTP ${response.status}): ${data.message ?? data.error ?? rawResp}`
    );
  }

  if (phonePeRedirectUrl.includes("mercury-t2")) {
    console.warn(`[PhonePe v2] ⚠️  SANDBOX redirect URL detected. UPI/QR will NOT work.`);
  } else {
    console.log(`[PhonePe v2] ✅ Redirect URL: ${phonePeRedirectUrl}`);
  }

  return { phonePeRedirectUrl };
}

async function checkV2Status(merchantTransactionId: string): Promise<{
  success: boolean;
  state: string;
  details?: unknown;
}> {
  const token = await getV2AccessToken();
  const url   = `${getV2PgBase()}/checkout/v2/order/${merchantTransactionId}/status`;

  console.log(`[PhonePe v2] Checking status: ${merchantTransactionId}`);

  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json", "Authorization": `O-Bearer ${token}` },
  });

  const rawResp = await response.text();
  let data: { state?: string };

  try {
    data = JSON.parse(rawResp);
  } catch {
    throw new Error(`PhonePe v2 status non-JSON (HTTP ${response.status}): ${rawResp}`);
  }

  console.log(`[PhonePe v2] Status HTTP ${response.status}:\n` + JSON.stringify(data, null, 2));

  const state   = data.state ?? "FAILED";
  const success = state === "COMPLETED";
  return { success, state, details: data };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public API — auto-selects v1 or v2
// ─────────────────────────────────────────────────────────────────────────────

export async function initiatePhonePePayment(params: {
  merchantTransactionId: string;
  merchantUserId: string;
  amount: number;
  redirectUrl: string;
  callbackUrl?: string;
  mobileNumber?: string;
}): Promise<{ phonePeRedirectUrl: string }> {
  console.log(`[PhonePe] Using API version: ${isV1Api() ? "v1 (checksum)" : "v2 (OAuth)"}`);
  console.log(`[PhonePe] Base URL: ${getBaseUrl() || "(not set, using default v2)"}`);

  if (isV1Api()) {
    return initiateV1Payment({
      ...params,
      callbackUrl: params.callbackUrl ?? params.redirectUrl,
    });
  }
  return initiateV2Payment(params);
}

export async function checkPhonePeStatus(merchantTransactionId: string): Promise<{
  success: boolean;
  state: string;
  details?: unknown;
}> {
  if (isV1Api()) {
    return checkV1Status(merchantTransactionId);
  }
  return checkV2Status(merchantTransactionId);
}

/**
 * Verify S2S callback checksum from PhonePe (v1 only).
 * Header: X-VERIFY = SHA256(responseBase64 + saltKey) + "###" + saltIndex
 */
export function verifyV1Callback(responseBase64: string, xVerify: string): boolean {
  try {
    const saltKey   = getClientSecret();
    const saltIndex = getSaltIndex();
    const hash      = crypto.createHash("sha256").update(responseBase64 + saltKey).digest("hex");
    return `${hash}###${saltIndex}` === xVerify;
  } catch {
    return false;
  }
}
