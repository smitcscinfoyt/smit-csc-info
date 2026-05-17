import { apiFetch } from "@/lib/api";

export interface BillingDetails {
  name: string;
  mobile: string;
  email: string;
  state: string;
  district: string;
}

export interface CouponValidationResult {
  ok: boolean;
  reason?: string;
  code?: string;
  description?: string | null;
  discountType?: "percent" | "fixed";
  discountValue?: number;
  basePaise?: number;
  discountPaise?: number;
  finalPaise?: number;
}

export type CouponScope = "operator" | "prime";

export async function validateCouponCode(opts: {
  code: string;
  scope: CouponScope;
  planId: string;
}): Promise<CouponValidationResult> {
  return apiFetch<CouponValidationResult>("/api/coupons/validate", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

export async function initOperatorCheckout(opts: {
  planId: string;
  billing: BillingDetails;
  couponCode?: string;
}) {
  return apiFetch<{
    status?: string;
    tier?: string;
    transactionId?: string;
    redirectUrl?: string;
    amountPaise?: number;
    originalAmountPaise?: number;
    discountPaise?: number;
    couponCode?: string | null;
    plan?: string;
  }>("/api/operator-membership/init", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

export async function initPrimeCheckout(opts: {
  planId: string;
  billing: BillingDetails;
  couponCode?: string;
}) {
  return apiFetch<{
    transactionId: string;
    redirectUrl: string;
    amount: number;
    plan: string;
  }>("/api/membership/subscribe", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

// ───────── Admin coupons ─────────
export interface AdminCoupon {
  id: number;
  code: string;
  description: string | null;
  discountType: "percent" | "fixed";
  discountValue: number;
  applicablePlans: string;
  maxUses: number | null;
  usedCount: number;
  perUserLimit: number;
  minOrderPaise: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  isLive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listAdminCoupons() {
  return apiFetch<{ items: AdminCoupon[] }>("/api/admin/coupons");
}

export interface CouponInput {
  code: string;
  description?: string | null;
  discountType: "percent" | "fixed";
  discountValue: number;
  applicablePlans: string;
  maxUses?: number | null;
  perUserLimit: number;
  minOrderPaise: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
}

export async function createAdminCoupon(body: CouponInput) {
  return apiFetch<{ id: number }>("/api/admin/coupons", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateAdminCoupon(id: number, body: Partial<CouponInput>) {
  return apiFetch<{ ok: boolean }>(`/api/admin/coupons/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteAdminCoupon(id: number) {
  return apiFetch<{ ok: boolean }>(`/api/admin/coupons/${id}`, {
    method: "DELETE",
  });
}
