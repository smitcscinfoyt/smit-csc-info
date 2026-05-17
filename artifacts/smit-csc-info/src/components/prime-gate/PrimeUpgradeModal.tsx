// PrimeUpgradeModal — gold/purple paywall shown when a non-Prime user
// taps Download/Export inside any free-to-use Prime tool. Captures
// billing details + optional coupon and kicks off PhonePe checkout in
// place, so the user never leaves the tool. After PhonePe returns to
// /payment/success the tool's auto-resume hook fires the original
// download.

import { useEffect, useMemo, useState } from "react";
import { Crown, Sparkles, CheckCircle2, Loader2, Tag, Lock, X, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  initPrimeCheckout, validateCouponCode,
  type BillingDetails, type CouponValidationResult,
} from "@/lib/checkout-api";
import { useGetMembershipPlans, getGetMembershipPlansQueryKey } from "@workspace/api-client-react";
import { INDIAN_STATES, GUJARAT_DISTRICTS } from "@/lib/gujarat-districts";

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Friendly tool name for the headline ("Save your ID Card sheet"). */
  toolTitle?: string;
  /** What kind of output the gate is protecting (Download / Export / Save). */
  actionLabel?: string;
}

const BENEFITS = [
  "Unlimited downloads from every Prime tool",
  "FHD Background Remover (up to 4K)",
  "AI Image Upscaler — 2× / 4× output",
  "PDF Editor v2 with Smart Text Edit",
  "Prime Studio (Canva-style designer)",
  "ID Card / Passport print sheets — PDF + JPG",
  "24/7 AI Sahayak (Gujarati)",
  "Priority Prime support (WhatsApp + email)",
  "Premium Recharge Portal — higher % commission",
  "Prime video content access (training + tutorials)",
  "Prime documents & resources library",
  "Prime membership certificate (downloadable)",
];

export function PrimeUpgradeModal({ open, onOpenChange, toolTitle, actionLabel = "Download" }: Props) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const plansQ = useGetMembershipPlans({
    query: { queryKey: getGetMembershipPlansQueryKey(), enabled: open },
  });

  const plans = plansQ.data ?? [];
  const [planId, setPlanId] = useState<string>("");

  // Default to the cheapest plan whenever plans load. We pick by price
  // ascending so that whichever plan the admin marks as cheapest wins,
  // not whichever one happens to be first in the list.
  useEffect(() => {
    if (!planId && plans.length) {
      const cheapest = [...plans].sort((a: any, b: any) => a.price - b.price)[0];
      setPlanId(cheapest.id);
    }
  }, [plans, planId]);

  const selectedPlan = useMemo(
    () => (plans as any[]).find((p) => p.id === planId) ?? null,
    [plans, planId],
  );

  // Billing form — prefilled from auth user.
  const [billing, setBilling] = useState<BillingDetails>({
    name: "",
    mobile: "",
    email: "",
    state: "Gujarat",
    district: "",
  });
  useEffect(() => {
    if (!user) return;
    setBilling((b) => ({
      ...b,
      name: b.name || user.name || "",
      email: b.email || user.email || "",
      mobile: b.mobile || (user as any).mobile || "",
    }));
  }, [user]);

  const [errors, setErrors] = useState<Partial<Record<keyof BillingDetails, string>>>({});
  const [showBilling, setShowBilling] = useState(false);

  // Coupon
  const [couponInput, setCouponInput] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [coupon, setCoupon] = useState<CouponValidationResult | null>(null);
  // Drop the applied coupon any time the user switches plans, since
  // applicability is plan-specific.
  useEffect(() => { setCoupon(null); setCouponInput(""); }, [planId]);

  const [submitting, setSubmitting] = useState(false);

  const districts = billing.state === "Gujarat" ? GUJARAT_DISTRICTS : null;

  const basePaise = selectedPlan ? (selectedPlan.price * 100) : 0;
  const discountPaise = coupon?.ok ? (coupon.discountPaise ?? 0) : 0;
  const finalPaise = Math.max(0, basePaise - discountPaise);

  function setField<K extends keyof BillingDetails>(k: K, v: string) {
    setBilling((b) => ({ ...b, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }

  function validateForm(): boolean {
    const e: Partial<Record<keyof BillingDetails, string>> = {};
    if (!billing.name.trim() || billing.name.trim().length < 2) e.name = "Name required";
    if (!/^[6-9]\d{9}$/.test(billing.mobile.trim())) e.mobile = "10-digit mobile";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing.email.trim())) e.email = "Valid email";
    if (!billing.state.trim()) e.state = "State required";
    if (!billing.district.trim()) e.district = "District required";
    setErrors(e);
    if (Object.keys(e).length > 0) setShowBilling(true);
    return Object.keys(e).length === 0;
  }

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code || !selectedPlan) return;
    setCouponLoading(true);
    try {
      const r = await validateCouponCode({ code, scope: "prime", planId: selectedPlan.id });
      if (!r.ok) {
        setCoupon(null);
        toast({ title: "Coupon not applied", description: r.reason ?? "Invalid coupon", variant: "destructive" });
      } else {
        setCoupon(r);
        toast({ title: "Coupon applied", description: `You saved ${formatINR(r.discountPaise ?? 0)}` });
      }
    } catch (err: any) {
      toast({ title: "Could not validate coupon", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setCouponLoading(false);
    }
  }

  async function handlePay() {
    if (!user) {
      // Save the current location so the login flow can return here.
      try { sessionStorage.setItem("post-login-redirect", window.location.pathname + window.location.search); } catch { /* ignore */ }
      setLocation("/login");
      return;
    }
    if (!selectedPlan) return;
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const r = await initPrimeCheckout({
        planId: selectedPlan.id,
        billing,
        couponCode: coupon?.ok ? coupon.code : undefined,
      });
      if (r?.redirectUrl) {
        // Tools have already saved their pending-download intent
        // before opening this modal — the redirect will hand control
        // back to /payment/success which then bounces to the tool.
        window.location.href = r.redirectUrl;
        return;
      }
      toast({ title: "Could not start payment", description: "Please try again.", variant: "destructive" });
    } catch (err: any) {
      toast({
        title: "Checkout failed",
        description: err?.data?.error || err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl w-[96vw] sm:w-[94vw] p-0 gap-0 overflow-hidden border-amber-300/40 bg-gradient-to-br from-[#1a0b2e] via-[#2a1052] to-[#0d0623] text-amber-50 max-h-[94vh] overflow-y-auto"
        data-testid="prime-upgrade-modal"
      >
        {/* Decorative gradient orbs */}
        <div className="pointer-events-none absolute -top-24 -left-20 h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />

        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-amber-300/15">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-3 right-3 h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-amber-100/80"
            aria-label="Close"
            data-testid="btn-prime-modal-close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-600 flex items-center justify-center shadow-[0_8px_30px_-6px_rgba(251,191,36,0.55)]">
                <Crown className="h-6 w-6 text-purple-950" />
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/90">
                Prime required to {actionLabel.toLowerCase()}
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
                Unlock Smit CSC Prime
              </h2>
            </div>
          </div>

          {toolTitle && (
            <p className="text-sm text-purple-100/85">
              You're working on <span className="font-bold text-amber-100">{toolTitle}</span>. Upgrade to {actionLabel.toLowerCase()} the result.
            </p>
          )}

          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-200">
            <ShieldCheck className="h-3 w-3" />
            Your work is saved — pick up right where you left off after upgrade
          </div>
        </div>

        <div className="relative grid lg:grid-cols-[1.1fr_1fr] gap-0">
        {/* LEFT — benefits column */}
        <div className="px-6 py-5 lg:border-r border-amber-300/15 bg-gradient-to-br from-fuchsia-500/5 to-transparent">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-200 mb-3">
            <Sparkles className="h-3.5 w-3.5" /> Everything in Prime
          </div>
          <ul className="space-y-2.5">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm text-purple-100/95 leading-snug">
                <CheckCircle2 className="h-4 w-4 text-emerald-300 shrink-0 mt-0.5" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/85">
            <span className="font-bold text-amber-200">Smit CSC Prime</span> — એક subscription, બધા tools + features unlock. Cancel anytime.
          </div>
        </div>

        {/* RIGHT — plans + billing + checkout */}
        <div className="px-6 py-5 space-y-5">
          {/* Plans */}
          {plansQ.isLoading ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-32 rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {plans.map((p: any) => {
                const active = p.id === planId;
                const isYearly = /year|365|annual/i.test(`${p.id} ${p.durationUnit ?? ""}`);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlanId(p.id)}
                    data-testid={`plan-card-${p.id}`}
                    className={`relative text-left rounded-2xl p-4 border-2 transition-all ${
                      active
                        ? "border-amber-300 bg-gradient-to-br from-amber-400/15 to-fuchsia-500/10 shadow-[0_0_0_4px_rgba(251,191,36,0.12)]"
                        : "border-white/10 bg-white/5 hover:border-amber-300/40 hover:bg-white/10"
                    }`}
                  >
                    {isYearly && (
                      <span className="absolute -top-2 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-300 to-yellow-500 text-purple-950 shadow">
                        Best value
                      </span>
                    )}
                    <div className="text-xs font-bold uppercase tracking-wider text-amber-200">
                      {p.name}
                    </div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-black text-amber-100">₹{p.price}</span>
                      <span className="text-xs text-purple-200/70">/{p.durationUnit}</span>
                    </div>
                    {active && (
                      <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-amber-300" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Billing — collapsed by default */}
          {user && (
            <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowBilling((v) => !v)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5"
                data-testid="btn-toggle-billing"
              >
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-200">Billing details</div>
                  <div className="text-xs text-purple-200/70 truncate">
                    {billing.name && billing.mobile ? `${billing.name} • ${billing.mobile}` : "Required for invoice — tap to fill"}
                  </div>
                </div>
                <span className="text-xs text-amber-200">{showBilling ? "Hide" : "Edit"}</span>
              </button>
              {showBilling && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
                  <div>
                    <Label htmlFor="pb-name" className="text-[11px] uppercase text-amber-200/80">Name *</Label>
                    <Input id="pb-name" value={billing.name} onChange={(e) => setField("name", e.target.value)}
                      className="bg-white/5 border-white/10 text-amber-50 placeholder:text-purple-300/60"
                      data-testid="input-pmodal-name" />
                    {errors.name && <p className="text-xs text-red-300 mt-1">{errors.name}</p>}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="pb-mobile" className="text-[11px] uppercase text-amber-200/80">Mobile *</Label>
                      <Input id="pb-mobile" inputMode="numeric" maxLength={10}
                        value={billing.mobile}
                        onChange={(e) => setField("mobile", e.target.value.replace(/\D/g, ""))}
                        className="bg-white/5 border-white/10 text-amber-50"
                        data-testid="input-pmodal-mobile" />
                      {errors.mobile && <p className="text-xs text-red-300 mt-1">{errors.mobile}</p>}
                    </div>
                    <div>
                      <Label htmlFor="pb-email" className="text-[11px] uppercase text-amber-200/80">Email *</Label>
                      <Input id="pb-email" type="email" value={billing.email}
                        onChange={(e) => setField("email", e.target.value)}
                        className="bg-white/5 border-white/10 text-amber-50"
                        data-testid="input-pmodal-email" />
                      {errors.email && <p className="text-xs text-red-300 mt-1">{errors.email}</p>}
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px] uppercase text-amber-200/80">State *</Label>
                      <Select value={billing.state} onValueChange={(v) => { setField("state", v); setField("district", ""); }}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-amber-50" data-testid="select-pmodal-state">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {errors.state && <p className="text-xs text-red-300 mt-1">{errors.state}</p>}
                    </div>
                    <div>
                      <Label className="text-[11px] uppercase text-amber-200/80">District *</Label>
                      {districts ? (
                        <Select value={billing.district} onValueChange={(v) => setField("district", v)}>
                          <SelectTrigger className="bg-white/5 border-white/10 text-amber-50" data-testid="select-pmodal-district">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {districts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={billing.district} onChange={(e) => setField("district", e.target.value)}
                          className="bg-white/5 border-white/10 text-amber-50"
                          data-testid="input-pmodal-district" />
                      )}
                      {errors.district && <p className="text-xs text-red-300 mt-1">{errors.district}</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Coupon — only when logged in (validation requires plan + auth) */}
          {user && (
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-emerald-300 shrink-0" />
              {coupon?.ok ? (
                <div className="flex-1 flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-300/30 px-3 py-2">
                  <div>
                    <div className="text-sm font-bold text-emerald-200">{coupon.code} applied</div>
                    <div className="text-[11px] text-emerald-300/80">You save {formatINR(coupon.discountPaise ?? 0)}</div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-emerald-200 hover:text-white"
                    onClick={() => { setCoupon(null); setCouponInput(""); }}
                    data-testid="btn-pmodal-coupon-remove">
                    Remove
                  </Button>
                </div>
              ) : (
                <>
                  <Input placeholder="Coupon code (optional)"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    className="flex-1 bg-white/5 border-white/10 text-amber-50 uppercase"
                    data-testid="input-pmodal-coupon" />
                  <Button onClick={applyCoupon} disabled={couponLoading || !couponInput.trim()}
                    variant="outline"
                    className="border-amber-300/40 bg-white/5 text-amber-100 hover:bg-amber-300/10"
                    data-testid="btn-pmodal-coupon-apply">
                    {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Total + CTA */}
          <div className="rounded-2xl border-2 border-amber-300/40 bg-gradient-to-br from-amber-400/10 via-fuchsia-500/5 to-purple-600/10 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-sm font-bold text-amber-100">Total</div>
              <div className="flex items-baseline gap-2">
                {coupon?.ok && (
                  <span className="text-sm text-purple-300/70 line-through">{formatINR(basePaise)}</span>
                )}
                <span className="text-3xl font-black text-amber-200">{formatINR(finalPaise)}</span>
              </div>
            </div>
            {finalPaise === 0 && coupon?.ok && (
              <Badge className="mb-3 bg-emerald-500/20 text-emerald-200 border border-emerald-300/40">
                Free with this coupon
              </Badge>
            )}
            <Button
              onClick={handlePay}
              disabled={submitting || !selectedPlan}
              data-testid="btn-pmodal-pay"
              className="w-full h-12 text-base font-extrabold text-purple-950 bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 hover:brightness-105 shadow-[0_8px_24px_-6px_rgba(251,191,36,0.7)]"
            >
              {submitting ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Starting payment…</>
              ) : !user ? (
                <><Lock className="h-4 w-4 mr-2" /> Login to continue</>
              ) : (
                <><Crown className="h-4 w-4 mr-2" /> Pay {formatINR(finalPaise)} via PhonePe</>
              )}
            </Button>
            <p className="mt-2 text-[11px] text-center text-purple-200/70">
              Secure UPI / Cards / Net Banking via PhonePe. Cancel anytime.
            </p>
          </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
