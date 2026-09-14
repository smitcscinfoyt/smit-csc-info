/**
 * VyaparGateway Payment Gateway Integration (API v2.1.0)
 * Base URL: https://vyapargateway.com
 */
import crypto from "crypto";

const VYAPAR_BASE_URL =
  process.env.VYAPAR_API_URL ||
  process.env.VYAPARGATEWAY_BASE_URL ||
  "https://vyapargateway.com";

export function getVyaparApiKey(): string {
  return (
    process.env.VYAPAR_API_KEY ||
    process.env.VYAPARGATEWAY_API_KEY ||
    process.env.VYAPARGATEWAY_KEY ||
    ""
  );
}

export function getVyaparWebhookSecret(): string {
  return (
    process.env.VYAPAR_WEBHOOK_SECRET ||
    process.env.VYAPARGATEWAY_WEBHOOK_SECRET ||
    process.env.VYAPARGATEWAY_SECRET ||
    ""
  );
}

export function isVyaparGatewayConfigured(): boolean {
  return !!getVyaparApiKey();
}

/**
 * Resolve public base URL for webhook callbacks and redirects.
 */
export function getCallbackBaseUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const domains = (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (domains.length) return `https://${domains[domains.length - 1]}`;
  if (process.env.NODE_ENV === "production") return "https://smitcscinfo.com";
  return "http://localhost:8080";
}

export interface VyaparCreateOrderParams {
  clientTxnId: string;
  amountRupees: number;
  customerName?: string;
  customerMobile?: string;
  customerEmail?: string;
  productInfo?: string;
  callbackUrl?: string;
  redirectUrl?: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
}

export interface VyaparUpiIntent {
  bhim_link?: string;
  phonepe_link?: string;
  paytm_link?: string;
  gpay_link?: string;
}

export interface VyaparOrderData {
  order_id: string;
  client_txn_id: string;
  amount: number;
  currency?: string;
  status: "pending" | "success" | "failed" | string;
  expires_at?: string;
  expires_in?: string;
  qr_code?: string;
  upi_string?: string;
  upi_intent?: VyaparUpiIntent;
  merchant_upi_id?: string;
  merchant_name?: string;
  payment_url?: string;
}

export interface VyaparOrderResponse {
  status: boolean;
  msg: string;
  data: VyaparOrderData;
}

/**
 * Create a new payment order with dynamic QR and UPI intent links.
 */
export async function createVyaparOrder(
  params: VyaparCreateOrderParams
): Promise<VyaparOrderData> {
  const apiKey = getVyaparApiKey();
  if (!apiKey) {
    throw new Error("VyaparGateway API key is not configured");
  }

  const base = getCallbackBaseUrl();
  const callbackUrl = params.callbackUrl || `${base}/api/webhook/vyapargateway`;
  const redirectUrl = params.redirectUrl || `${base}/wallet`;

  const payload = {
    key: apiKey,
    client_txn_id: params.clientTxnId,
    amount: Number(params.amountRupees.toFixed(2)),
    p_info: params.productInfo || "Recharge / Wallet Payment",
    customer_name: params.customerName || "Customer",
    customer_mobile: params.customerMobile || "9999999999",
    customer_email: params.customerEmail || "noreply@smitcscinfo.com",
    callback_url: callbackUrl,
    redirect_url: redirectUrl,
    udf1: params.udf1 || "",
    udf2: params.udf2 || "",
    udf3: params.udf3 || "",
  };

  const res = await fetch(`${VYAPAR_BASE_URL}/api/v1/create_order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`VyaparGateway HTTP ${res.status}: ${errorText || res.statusText}`);
  }

  const result = (await res.json()) as VyaparOrderResponse;
  if (!result.status || !result.data) {
    throw new Error(result.msg || "VyaparGateway order creation failed");
  }

  return result.data;
}

/**
 * Check order status using VyaparGateway Check Status API.
 */
export async function checkVyaparOrderStatus(orderId: string): Promise<{
  success: boolean;
  status: "success" | "pending" | "failed";
  data?: VyaparOrderData;
  rawMsg?: string;
}> {
  const apiKey = getVyaparApiKey();
  if (!apiKey) {
    throw new Error("VyaparGateway API key is not configured");
  }

  try {
    const res = await fetch(`${VYAPAR_BASE_URL}/api/v1/check_order_status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        key: apiKey,
        order_id: orderId,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return { success: false, status: "pending", rawMsg: `HTTP ${res.status}` };
    }

    const result = (await res.json()) as VyaparOrderResponse;
    if (!result.status || !result.data) {
      return { success: false, status: "pending", rawMsg: result.msg };
    }

    const rawStatus = (result.data.status || "").toLowerCase();
    if (rawStatus === "success") {
      return { success: true, status: "success", data: result.data };
    } else if (rawStatus === "failed" || rawStatus === "failure" || rawStatus === "rejected") {
      return { success: false, status: "failed", data: result.data };
    } else {
      return { success: false, status: "pending", data: result.data };
    }
  } catch (err: any) {
    return { success: false, status: "pending", rawMsg: err?.message };
  }
}

/**
 * Verify Webhook Signature according to Section 5 of VyaparGateway Docs:
 *
 * 1. Read the X-VyaparGateway-Timestamp header value.
 * 2. Read the X-VyaparGateway-Order-Id header value.
 * 3. Read the raw HTTP request body (the JSON string exactly as received).
 * 4. Construct string: string_to_sign = "{timestamp}.{raw_body}"
 * 5. Compute: HMAC-SHA256(webhook_secret, string_to_sign)
 * 6. Compare result with X-VyaparGateway-Signature header.
 */
export function verifyVyaparWebhookSignature(params: {
  timestamp: string;
  signature: string;
  rawBody: string;
}): boolean {
  const secret = getVyaparWebhookSecret();
  if (!secret) {
    console.warn("[vyapargateway] VYAPARGATEWAY_WEBHOOK_SECRET not set; signature check bypassed in non-prod");
    return process.env.NODE_ENV !== "production";
  }

  if (!params.timestamp || !params.signature || !params.rawBody) {
    return false;
  }

  const stringToSign = `${params.timestamp}.${params.rawBody}`;
  const computedSignature = crypto
    .createHmac("sha256", secret)
    .update(stringToSign)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature, "hex"),
      Buffer.from(params.signature, "hex")
    );
  } catch {
    return false;
  }
}
