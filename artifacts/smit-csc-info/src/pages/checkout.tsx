import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Crown, Sparkles, Tag, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import {
  validateCouponCode, initOperatorCheckout, initPrimeCheckout,
  type BillingDetails, type CouponValidationResult, type CouponScope,
} from "@/lib/checkout-api";
import { getOperatorMembershipPlans } from "@/lib/recharge-api";
import { useGetMembershipPlans, getGetMembershipPlansQueryKey } from "@workspace/api-client-react";
import { INDIAN_STATES, GUJARAT_DISTRICTS } from "@/lib/gujarat-districts";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";
import { loadDraft, clearDraft } from "@/lib/draft-store";

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

interface PlanInfo {
  id: string;
  name: string;
  pricePaise: number;
  tagline?: string;
  features?: string[];
}

export default function Checkout() {
  const [, params] = useRoute<{ scope: string; planId: string }>("/checkout/:scope/:planId");
  const scope = (params?.scope ?? "operator") as CouponScope;
  const planId = params?.planId ?? "";
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Plan info — operator from custom hook, prime from generated hook
  const opPlansQ = useQuery({
    queryKey: ["operator-membership", "plans"],
    queryFn: getOperatorMembershipPlans,
    enabled: scope === "operator",
  });
  const primePlansQ = useGetMembershipPlans({
    query: { queryKey: getGetMembershipPlansQueryKey(), enabled: scope === "prime" },
  });

  const plan: PlanInfo | null = useMemo(() => {
    if (scope === "operator") {
      const p = (opPlansQ.data ?? []).find((x) => x.id === planId);
      return p ? { id: p.id, name: p.name, pricePaise: p.pricePaise, tagline: p.tagline, features: p.features } : null;
    }
    const p = (primePlansQ.data ?? []).find((x: any) => x.id === planId);
    return p ? { id: p.id, name: p.name, pricePaise: p.price * 100, tagline: undefined, features: p.features } : null;
  }, [scope, planId, opPlansQ.data, primePlansQ.data]);

  // Form state — prefill from auth user
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

  // Coupon
  const [showCoupon, setShowCoupon] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [coupon, setCoupon] = useState<CouponValidationResult | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof BillingDetails, string>>>({});

  // ── Draft autosave ──────────────────────────────────────────
  // Mobile browsers (esp. Android Chrome) frequently kill the tab
  // during payment redirects or backgrounding. Persist billing +
  // coupon input so the user can resume on next visit.
  const draftKey = `checkout:${scope}:${planId}`;
  useEffect(() => {
    if (!planId) return;
    const d = loadDraft<{ billing: BillingDetails; couponInput: string; showCoupon: boolean }>(draftKey);
    if (d) {
      setBilling((b) => ({ ...b, ...d.billing }));
      if (d.couponInput) setCouponInput(d.couponInput);
      if (d.showCoupon) setShowCoupon(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  useDraftAutosave(draftKey, { billing, couponInput, showCoupon }, { enabled: !submitting });

  if (!user) {
    setLocation("/login");
    return null;
  }

  if ((scope === "operator" && opPlansQ.isLoading) || (scope === "prime" && primePlansQ.isLoading)) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-purple-700" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex-1 py-20 text-center">
        <p className="text-lg text-gray-700">Plan not found.</p>
        <Link href={scope === "operator" ? "/recharge" : "/membership"}>
          <Button className="mt-4" variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />Back to plans</Button>
        </Link>
      </div>
    );
  }

  const basePaise = plan.pricePaise;
  const discountPaise = coupon?.ok ? (coupon.discountPaise ?? 0) : 0;
  const finalPaise = Math.max(0, basePaise - discountPaise);

  const districts = billing.state === "Gujarat" ? GUJARAT_DISTRICTS : null;

  function setField<K extends keyof BillingDetails>(k: K, v: string) {
    setBilling((b) => ({ ...b, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }

  function validateForm(): boolean {
    const e: Partial<Record<keyof BillingDetails, string>> = {};
    if (!billing.name.trim() || billing.name.trim().length < 2) e.name = "Name is required (min 2 chars)";
    if (!/^[6-9]\d{9}$/.test(billing.mobile.trim())) e.mobile = "Enter a valid 10-digit mobile";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing.email.trim())) e.email = "Enter a valid email";
    if (!billing.state.trim()) e.state = "State is required";
    if (!billing.district.trim()) e.district = "District is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) {
      toast({ title: "Enter a coupon code", variant: "destructive" });
      return;
    }
    setCouponLoading(true);
    try {
      const r = await validateCouponCode({ code, scope, planId: plan!.id });
      if (!r.ok) {
        setCoupon(null);
        toast({ title: "Coupon not applied", description: r.reason ?? "Invalid coupon", variant: "destructive" });
      } else {
        setCoupon(r);
        toast({
          title: "Coupon applied",
          description: `You saved ${formatINR(r.discountPaise ?? 0)}`,
        });
      }
    } catch (err: any) {
      toast({ title: "Could not validate coupon", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setCouponLoading(false);
    }
  }

  function removeCoupon() {
    setCoupon(null);
    setCouponInput("");
  }

  async function handleProceed() {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const payload = {
        planId: plan!.id,
        billing,
        couponCode: coupon?.ok ? coupon.code : undefined,
      };
      const r = scope === "operator"
        ? await initOperatorCheckout(payload)
        : await initPrimeCheckout(payload);

      // Operator: 100% off → status=success, no redirect
      if (scope === "operator" && (r as any).status === "success" && !(r as any).redirectUrl) {
        await qc.invalidateQueries({ queryKey: ["operator-membership", "status"] });
        toast({ title: "Plan activated", description: `${plan!.name} is now active for life.` });
        clearDraft(draftKey);
        setLocation("/recharge");
        return;
      }

      const redirectUrl = (r as any).redirectUrl;
      if (redirectUrl) {
        clearDraft(draftKey);
        window.location.href = redirectUrl;
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

  const themeIcon = scope === "prime" ? <Sparkles className="h-6 w-6" /> : <Crown className="h-6 w-6" />;
  const themeGrad = scope === "prime"
    ? "from-fuchsia-600 via-purple-700 to-indigo-700"
    : plan.id === "premium"
      ? "from-fuchsia-600 via-purple-700 to-indigo-700"
      : "from-amber-500 via-yellow-500 to-orange-500";

  return (
    <div className="flex-1 py-8 px-4 bg-gradient-to-br from-purple-50 via-white to-amber-50 min-h-screen">
      <div className="container mx-auto max-w-4xl">
        <Link href={scope === "operator" ? "/recharge" : "/membership"}>
          <Button variant="ghost" size="sm" className="mb-4" data-testid="btn-back">
            <ArrowLeft className="h-4 w-4 mr-2" />Back to plans
          </Button>
        </Link>

        <div className="grid md:grid-cols-5 gap-6">
          {/* LEFT — Form */}
          <div className="md:col-span-3 space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Billing Details</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Please fill in your details. We'll use these to send your invoice and updates.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">Name <span className="text-red-600">*</span></Label>
                  <Input
                    id="name"
                    value={billing.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="Your full name"
                    data-testid="input-billing-name"
                  />
                  {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="mobile">Mobile Number <span className="text-red-600">*</span></Label>
                    <Input
                      id="mobile"
                      inputMode="numeric"
                      maxLength={10}
                      value={billing.mobile}
                      onChange={(e) => setField("mobile", e.target.value.replace(/\D/g, ""))}
                      placeholder="10-digit mobile"
                      data-testid="input-billing-mobile"
                    />
                    {errors.mobile && <p className="text-xs text-red-600 mt-1">{errors.mobile}</p>}
                  </div>
                  <div>
                    <Label htmlFor="email">Email ID <span className="text-red-600">*</span></Label>
                    <Input
                      id="email"
                      type="email"
                      value={billing.email}
                      onChange={(e) => setField("email", e.target.value)}
                      placeholder="you@example.com"
                      data-testid="input-billing-email"
                    />
                    {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="state">State <span className="text-red-600">*</span></Label>
                    <Select value={billing.state} onValueChange={(v) => { setField("state", v); setField("district", ""); }}>
                      <SelectTrigger id="state" data-testid="select-billing-state">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {errors.state && <p className="text-xs text-red-600 mt-1">{errors.state}</p>}
                  </div>
                  <div>
                    <Label htmlFor="district">District <span className="text-red-600">*</span></Label>
                    {districts ? (
                      <Select value={billing.district} onValueChange={(v) => setField("district", v)}>
                        <SelectTrigger id="district" data-testid="select-billing-district">
                          <SelectValue placeholder="Select district" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {districts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="district"
                        value={billing.district}
                        onChange={(e) => setField("district", e.target.value)}
                        placeholder="Enter district"
                        data-testid="input-billing-district"
                      />
                    )}
                    {errors.district && <p className="text-xs text-red-600 mt-1">{errors.district}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-emerald-600" />
                  Have a coupon?
                </CardTitle>
                {!showCoupon && !coupon?.ok && (
                  <Button variant="outline" size="sm" onClick={() => setShowCoupon(true)} data-testid="btn-show-coupon">
                    Apply Coupon
                  </Button>
                )}
              </CardHeader>
              {(showCoupon || coupon?.ok) && (
                <CardContent>
                  {coupon?.ok ? (
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <div>
                          <div className="font-semibold text-emerald-900">{coupon.code}</div>
                          <div className="text-xs text-emerald-700">
                            You saved {formatINR(coupon.discountPaise ?? 0)}
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={removeCoupon} data-testid="btn-remove-coupon">
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter coupon code"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        className="uppercase"
                        data-testid="input-coupon"
                      />
                      <Button onClick={applyCoupon} disabled={couponLoading} data-testid="btn-apply-coupon">
                        {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          </div>

          {/* RIGHT — Order summary */}
          <div className="md:col-span-2">
            <Card className="sticky top-4 overflow-hidden">
              <div className={`bg-gradient-to-r ${themeGrad} text-white px-5 py-4 flex items-center gap-3`}>
                {themeIcon}
                <div>
                  <div className="text-xs uppercase tracking-wide opacity-90">
                    {scope === "prime" ? "Prime Membership" : "Operator Plan"}
                  </div>
                  <div className="font-bold text-lg">{plan.name}</div>
                </div>
              </div>
              <CardContent className="p-5 space-y-3">
                {plan.tagline && <p className="text-sm text-muted-foreground">{plan.tagline}</p>}
                <Separator />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Plan price</span>
                    <span className="font-semibold">{formatINR(basePaise)}</span>
                  </div>
                  {coupon?.ok && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Coupon ({coupon.code})</span>
                      <span className="font-semibold">- {formatINR(coupon.discountPaise ?? 0)}</span>
                    </div>
                  )}
                </div>
                <Separator />
                <div className="flex justify-between items-baseline">
                  <span className="text-base font-bold">Total Payable</span>
                  <span className="text-2xl font-extrabold text-purple-800">{formatINR(finalPaise)}</span>
                </div>
                {finalPaise === 0 && (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
                    Free with this coupon
                  </Badge>
                )}
                <Button
                  className="w-full mt-2 h-12 text-base font-bold bg-gradient-to-r from-purple-700 via-fuchsia-600 to-amber-500 hover:opacity-90 text-white"
                  onClick={handleProceed}
                  disabled={submitting}
                  data-testid="btn-proceed-payment"
                >
                  {submitting ? (
                    <><Loader2 className="h-5 w-5 animate-spin mr-2" />Processing…</>
                  ) : finalPaise === 0 ? (
                    "Activate Plan (Free)"
                  ) : (
                    `Pay ${formatINR(finalPaise)} via PhonePe`
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Secure payment via PhonePe. UPI, Cards, Net Banking accepted.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
