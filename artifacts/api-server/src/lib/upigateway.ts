/**
 * AllAPI.in / UpiGateway.in Payment Gateway Integration
 *
 * Create Order : POST https://allapi.in/order/create
 * Check Status : POST https://allapi.in/order/status
 *
 * Required env: UPIGATEWAY_TOKEN
 * Optional env: SITE_URL  (production domain, e.g. https://smitcscinfo.com)
 */

const ALLAPI_BASE = "https://allapi.in";

// ─── Env helpers ──────────────────────────────────────────────────────────────
function getToken(): string {
  return process.env.UPIGATEWAY_TOKEN ?? "";
}

export function isUpiGatewayConfigured(): boolean {
  return !!getToken();
}

/**
 * Resolve the public base URL for callbacks and redirects.
 * Priority: SITE_URL → APP_URL → REPLIT_DOMAINS → production fallback.
 */
export function getCallbackBaseUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.APP_URL)  return process.env.APP_URL.replace(/\/$/, "");
  const domains = (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (domains.length) return `https://${domains[domains.length - 1]}`;
  if (process.env.NODE_ENV === "production") return "https://smitcscinfo.com";
  return "http://localhost:8080";
}

// ─── Create Order ─────────────────────────────────────────────────────────────
export interface UpiOrderResult {
  /** Hosted payment page URL — redirect the user here */
  paymentUrl: string;
  orderId: string;
}

export async function createUpiOrder(params: {
  orderId: string;
  /** Amount in rupees (NOT paise) */
  amountRupees: number;
  customerName: string;
  customerMobile: string;
  customerEmail?: string;
  txnNote?: string;
  redirectUrl: string;
}): Promise<UpiOrderResult> {
  const token = getToken();
  if (!token) throw new Error("UPI Gateway not configured — set UPIGATEWAY_TOKEN");

  const body = {
    token,
    order_id:        params.orderId,
    txn_amount:      params.amountRupees,     // rupees, not paise
    txn_note:        params.txnNote ?? "Wallet Top-up",
    product_name:    "Smit CSC Info Wallet",
    customer_name:   params.customerName  || "User",
    customer_mobile: params.customerMobile || "0000000000",
    customer_email:  params.customerEmail  ?? "noreply@smitcscinfo.com",
    redirect_url:    params.redirectUrl,
  };

  const res = await fetch(`${ALLAPI_BASE}/order/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`AllAPI HTTP ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as Record<string, unknown>;

  if (!data.status) {
    throw new Error((data.message as string) ?? "UPI Gateway order creation failed");
  }

  // The success response contains a hosted payment page URL.
  // AllAPI returns it in results.payment_url — log full results so we can
  // confirm the exact field shape once the merchant account is activated.
  const results = (data.results ?? data) as Record<string, unknown>;
  console.log("[upigateway] create-order success results:", JSON.stringify(results));

  const paymentUrl =
    (results.payment_url   as string | undefined) ??
    (results.redirect_url  as string | undefined) ??
    (results.pay_url       as string | undefined) ??
    (results.url           as string | undefined) ??
    (data.payment_url      as string | undefined) ??
    (data.redirect_url     as string | undefined) ??
    "";

  if (!paymentUrl) {
    throw new Error("UPI Gateway did not return a payment URL in the response");
  }

  return { paymentUrl, orderId: params.orderId };
}

// ─── Check Order Status ───────────────────────────────────────────────────────
export interface UpiOrderStatus {
  success: boolean;
  /** "SUCCESS" | "PENDING" | "FAILED" */
  status: string;
  utrNumber?: string;
  paymentMode?: string;
}

export async function checkUpiOrderStatus(orderId: string): Promise<UpiOrderStatus> {
  const token = getToken();
  if (!token) return { success: false, status: "FAILED" };

  let data: Record<string, unknown>;
  try {
    const res = await fetch(`${ALLAPI_BASE}/order/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, order_id: orderId }),
      signal: AbortSignal.timeout(12_000),
    });
    data = await res.json() as Record<string, unknown>;
  } catch {
    return { success: false, status: "PENDING" };
  }

  console.log("[upigateway] order-status response:", JSON.stringify(data));

  // status: false  →  order not found / still pending
  if (!data.status) {
    const msg = ((data.message as string) ?? "").toLowerCase();
    if (msg.includes("not found")) return { success: false, status: "PENDING" };
    return { success: false, status: "FAILED" };
  }

  const results = (data.results ?? {}) as Record<string, unknown>;
  const rawStatus = ((results.status as string) ?? "").toLowerCase();

  if (rawStatus === "success") {
    return {
      success:     true,
      status:      "SUCCESS",
      utrNumber:   results.utr_number   as string | undefined,
      paymentMode: results.payment_mode as string | undefined,
    };
  }

  if (rawStatus === "pending" || rawStatus === "" || rawStatus === "processing") {
    return { success: false, status: "PENDING" };
  }

  return { success: false, status: "FAILED" };
}
