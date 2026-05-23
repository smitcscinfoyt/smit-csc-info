import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft, Loader2, Smartphone, Tv, Receipt, Wallet, AlertCircle,
  Phone, Lightbulb, Flame, ShieldCheck, CreditCard, Gift, Sparkles, Check,
} from "lucide-react";
import { TpinDialog } from "@/components/recharge/tpin-dialog";
import {
  getOperators, getQuote, initRecharge, getWallet, getTpinStatus, formatINR,
  detectOperator, type OperatorDetection,
  getPlans, type PlanCategory,
  type RechargeType,
} from "@/lib/recharge-api";
import { useToast } from "@/hooks/use-toast";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";
import { loadDraft, clearDraft } from "@/lib/draft-store";
const OPERATOR_STYLE: Record<string, { bg: string; text: string; short: string }> = {
  A:   { bg: "bg-red-600",     text: "text-white", short: "A"   }, // Airtel
  RC:  { bg: "bg-blue-600",    text: "text-white", short: "Jio" }, // Reliance Jio
  V:   { bg: "bg-rose-600",    text: "text-white", short: "Vi"  }, // Vi
  I:   { bg: "bg-rose-600",    text: "text-white", short: "Vi"  }, // Idea (legacy)
  BT:  { bg: "bg-amber-500",   text: "text-white", short: "BSNL" },
  BR:  { bg: "bg-amber-500",   text: "text-white", short: "BSNL" },
  PAT: { bg: "bg-red-600",     text: "text-white", short: "A"   },
  VP:  { bg: "bg-rose-600",    text: "text-white", short: "Vi"  },
  IP:  { bg: "bg-rose-600",    text: "text-white", short: "Vi"  },
  JPP: { bg: "bg-blue-600",    text: "text-white", short: "Jio" },
  BP:  { bg: "bg-amber-500",   text: "text-white", short: "BSNL" },
  DP:  { bg: "bg-pink-600",    text: "text-white", short: "Doc" },
  ATV: { bg: "bg-red-600",     text: "text-white", short: "ATV" },
  TTV: { bg: "bg-blue-700",    text: "text-white", short: "Tata" },
  DTV: { bg: "bg-orange-500",  text: "text-white", short: "Dish" },
  VTV: { bg: "bg-purple-600",  text: "text-white", short: "D2H" },
  STV: { bg: "bg-yellow-500",  text: "text-white", short: "Sun" },
};
const opBadge = (code: string) => OPERATOR_STYLE[code] ?? { bg: "bg-gray-500", text: "text-white", short: code.slice(0, 2) };
const QUICK = [49, 99, 199, 299, 499, 999];

/** UI-level service category. "bill" sub-categories all map to backend type="bill". */
export type ServiceCategory =
  | "mobile" | "dth"
  | "postpaid" | "electricity" | "gas" | "insurance" | "fastag" | "giftcard";

interface Props {
  type?: RechargeType;
  category?: ServiceCategory;
  embedded?: boolean;
  operatorFilter?: (code: string, name: string) => boolean;
  titleOverride?: string;
}

interface MetaEntry {
  title: string;
  icon: any;
  numLabel: string;
  numPlaceholder: string;
  numLen: number;
  /** Backend recharge type (mobile/dth/bill) */
  backendType: RechargeType;
  /** Min recharge amount (₹) */
  minAmount: number;
  /** Max recharge amount (₹) */
  maxAmount: number;
}

const META: Record<ServiceCategory, MetaEntry> = {
  mobile:      { title: "Mobile Recharge",            icon: Smartphone,    numLabel: "Mobile Number",            numPlaceholder: "10-digit number",       numLen: 10, backendType: "mobile", minAmount: 10,  maxAmount: 5000 },
  dth:         { title: "DTH Recharge",               icon: Tv,            numLabel: "DTH Customer ID",          numPlaceholder: "Enter Customer ID",     numLen: 16, backendType: "dth",    minAmount: 10,  maxAmount: 5000 },
  postpaid:    { title: "Postpaid Bill",              icon: Phone,         numLabel: "Mobile Number",            numPlaceholder: "10-digit number",       numLen: 10, backendType: "bill",   minAmount: 10,  maxAmount: 50000 },
  electricity: { title: "Electricity Bill",           icon: Lightbulb,     numLabel: "Consumer / Account No.",   numPlaceholder: "Enter Consumer Number", numLen: 24, backendType: "bill",   minAmount: 10,  maxAmount: 50000 },
  gas:         { title: "Gas Cylinder / Bill",        icon: Flame,         numLabel: "Customer / Consumer No.",  numPlaceholder: "Enter Customer Number", numLen: 24, backendType: "bill",   minAmount: 10,  maxAmount: 50000 },
  insurance:   { title: "LIC / Insurance Premium",    icon: ShieldCheck,   numLabel: "Policy Number",            numPlaceholder: "Enter Policy Number",   numLen: 24, backendType: "bill",   minAmount: 10,  maxAmount: 50000 },
  fastag:      { title: "FASTag Recharge",            icon: CreditCard,    numLabel: "Vehicle / FASTag Number",  numPlaceholder: "Enter Vehicle Number",  numLen: 20, backendType: "bill",   minAmount: 100, maxAmount: 10000 },
  giftcard:    { title: "Google Play Gift Card",      icon: Gift,          numLabel: "Mobile / Email",           numPlaceholder: "Recipient mobile/email", numLen: 60, backendType: "bill",  minAmount: 100, maxAmount: 5000 },
};

export default function RechargeForm({ type, category, embedded, operatorFilter, titleOverride }: Props) {
  // Derive effective category: explicit prop wins; otherwise use legacy `type` (mobile/dth/bill).
  const effCategory: ServiceCategory =
    category ?? (type === "bill" ? "electricity" : ((type ?? "mobile") as ServiceCategory));
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const meta = META[effCategory];
  const backendType = meta.backendType;
  const isMobile = effCategory === "mobile";
  const minNumLen = effCategory === "giftcard" ? 5 : effCategory === "fastag" ? 4 : isMobile || effCategory === "postpaid" ? 10 : 4;

  const [operatorCode, setOperatorCodeRaw] = useState("");
  const [circleCode, setCircleCode] = useState(isMobile ? "12" : "");
  const [showCircle, setShowCircle] = useState(false);
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [showTpin, setShowTpin] = useState(false);
  const [idempotencyKey] = useState(() => `${effCategory}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);

  // ── Draft autosave (per service category) ───────────────────
  const DRAFT_KEY = `recharge-form:${effCategory}`;
  useEffect(() => {
    const d = loadDraft<{ number: string; amount: string; operatorCode: string; circleCode: string }>(DRAFT_KEY);
    if (d) {
      if (d.number) setNumber(d.number);
      if (d.amount) setAmount(d.amount);
      if (d.operatorCode) {
        userTouchedOp.current = true;
        setOperatorCodeRaw(d.operatorCode);
      }
      if (d.circleCode && isMobile) setCircleCode(d.circleCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effCategory]);
  useDraftAutosave(DRAFT_KEY, { number, amount, operatorCode, circleCode });

  // ─── Auto-detect operator + circle from mobile prefix ─────────────────
  const [detection, setDetection] = useState<OperatorDetection | null>(null);
  const [detecting, setDetecting] = useState(false);
  const userTouchedOp = useRef(false);

  // Wrap the operator setter so the auto-detect effect can distinguish
  // "user picked an operator" from "auto-detect filled it in".
  const setOperatorCode = (code: string) => {
    userTouchedOp.current = true;
    setOperatorCodeRaw(code);
  };

  useEffect(() => {
    if (!isMobile && effCategory !== "postpaid") return;
    if (number.length < 4) {
      setDetection(null);
      return;
    }
    let cancelled = false;
    setDetecting(true);
    const t = setTimeout(async () => {
      try {
        const det = await detectOperator(number);
        if (cancelled) return;
        setDetection(det);
        // Only auto-fill if the user hasn't manually picked an operator yet.
        if (det && !userTouchedOp.current) {
          setOperatorCodeRaw(det.operatorCode);
          if (isMobile) setCircleCode(det.circleCode);
        }
      } catch {
        if (!cancelled) setDetection(null);
      } finally {
        if (!cancelled) setDetecting(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [number, isMobile, effCategory]);

  const { data: opsRes } = useQuery({ queryKey: ["operators"], queryFn: getOperators });
  const { data: wallet } = useQuery({ queryKey: ["wallet"], queryFn: getWallet });
  const { data: tpinStatus } = useQuery({ queryKey: ["tpin", "status"], queryFn: getTpinStatus });

  // Look up operator list by sub-category. Server returns operators keyed by
  // mobile/dth/postpaid/electricity/gas/insurance/fastag/giftcard.
  const operatorsAll =
    (opsRes?.operators as Record<string, { code: string; name: string }[]> | undefined)?.[effCategory] ?? [];
  const operators = operatorFilter
    ? operatorsAll.filter((o) => operatorFilter(o.code, o.name))
    : operatorsAll;

  const numAmount = parseFloat(amount) || 0;
  const amountPaise = Math.round(numAmount * 100);
  const insufficient = wallet ? amountPaise > wallet.balance : false;

  const { data: quote } = useQuery({
    queryKey: ["quote", backendType, operatorCode, amountPaise],
    queryFn: () => getQuote(backendType, operatorCode, amountPaise),
    enabled: !!operatorCode && amountPaise >= 1000,
  });

  const requiresTpin = amountPaise >= 50000;

  const initMutation = useMutation({
    mutationFn: (params: { tpin?: string }) => initRecharge({
      type: backendType, operatorCode, number, amount: amountPaise,
      circleCode: isMobile ? circleCode || undefined : undefined,
      tpin: params.tpin, idempotencyKey,
    }),
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["recharge", "history"] });
      setShowTpin(false);
      clearDraft(DRAFT_KEY);
      setLocation(`/recharge/receipt/${rec.id}`);
    },
    onError: (err: any) => {
      setShowTpin(false);
      toast({ variant: "destructive", title: "Error", description: err?.data?.error || err?.message || "Recharge failed" });
    },
  });

  const handleSubmit = () => {
    if (!operatorCode) { toast({ variant: "destructive", title: "Select operator" }); return; }
    if (!number || number.length < minNumLen) { toast({ variant: "destructive", title: "Enter a valid number" }); return; }
    if (numAmount < meta.minAmount) { toast({ variant: "destructive", title: `Minimum ₹${meta.minAmount}` }); return; }
    if (numAmount > meta.maxAmount) { toast({ variant: "destructive", title: `Maximum ₹${meta.maxAmount.toLocaleString("en-IN")}` }); return; }
    if (insufficient) { toast({ variant: "destructive", title: "Insufficient wallet balance", description: "Add money" }); return; }
    if (requiresTpin) {
      if (!tpinStatus?.hasPin) {
        toast({ variant: "destructive", title: "T-PIN not set", description: "T-PIN required for larger amounts" });
        return;
      }
      setShowTpin(true);
    } else {
      initMutation.mutate({});
    }
  };

  const inner = (
    <Card className={embedded ? "shadow-md border-2 overflow-hidden" : "shadow-lg"}>
      {embedded ? (
        <div className="bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-600 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm sm:text-base uppercase tracking-wide">
            <meta.icon className="h-5 w-5" />{titleOverride ?? meta.title}
          </div>
          <div className="text-xs sm:text-sm flex items-center gap-1.5 bg-white/15 px-2.5 py-1 rounded-full">
            <Wallet className="h-3.5 w-3.5" />{wallet ? formatINR(wallet.balance) : "—"}
          </div>
        </div>
      ) : (
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><meta.icon className="h-5 w-5 text-primary" />{titleOverride ?? meta.title}</CardTitle>
          <CardDescription className="flex items-center gap-2"><Wallet className="h-4 w-4" />Balance: <span className="font-semibold">{wallet ? formatINR(wallet.balance) : "—"}</span></CardDescription>
        </CardHeader>
      )}
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="num">{meta.numLabel}</Label>
              <Input
                id="num"
                inputMode={isMobile || effCategory === "postpaid" ? "numeric" : "text"}
                maxLength={meta.numLen}
                value={number}
                onChange={(e) => {
                  const v = e.target.value;
                  const cleaned = isMobile || effCategory === "postpaid" ? v.replace(/\D/g, "") : v;
                  // When the number is fully cleared/changed significantly, reset
                  // the manual-override flag so auto-detect can fill again.
                  if (cleaned.length < 4) userTouchedOp.current = false;
                  setNumber(cleaned);
                }}
                placeholder={meta.numPlaceholder}
                className="text-base"
                data-testid="input-number"
              />
              {(isMobile || effCategory === "postpaid") && number.length >= 4 && (
                <div className="mt-1.5 text-xs flex items-center gap-1.5 min-h-[18px]" data-testid="auto-detect-status">
                  {detecting ? (
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Detecting operator…
                    </span>
                  ) : detection ? (
                    <span className="text-green-700 flex items-center gap-1.5 font-medium flex-wrap">
                      <Sparkles className="h-3.5 w-3.5" />
                      Auto-detected: <span className="font-semibold">{detection.operatorName}</span>
                      {isMobile && <> · <span>{detection.circleName}</span></>}
                      {detection.source === "ezytm" ? (
                        <span className="text-[10px] uppercase tracking-wide bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
                          MNP-aware
                        </span>
                      ) : detection.confidence === "low" ? (
                        <span className="text-amber-700">(verify)</span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wide bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                          prefix
                        </span>
                      )}
                      <Check className="h-3 w-3" />
                    </span>
                  ) : number.length >= 4 ? (
                    <span className="text-muted-foreground">Pick operator manually</span>
                  ) : null}
                </div>
              )}
            </div>

            <div>
              <Label>Select Operator</Label>
              <Select value={operatorCode} onValueChange={setOperatorCode}>
                <SelectTrigger data-testid="select-operator"><SelectValue placeholder="Select Operator" /></SelectTrigger>
                               <SelectContent>{operators.map((o) => {
                  const b = opBadge(o.code);
                  return (
                    <SelectItem key={o.code} value={o.code}>
                      <div className="flex items-center gap-2">
                        <span className={`${b.bg} ${b.text} text-[10px] font-bold px-1.5 py-0.5 rounded min-w-[28px] text-center`}>{b.short}</span>
                        <span>{o.name}</span>
                      </div>
                    </SelectItem>
                  );
                })}</SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="amt">Amount (₹)</Label>
              <Input id="amt" type="number" inputMode="numeric" min={meta.minAmount} max={meta.maxAmount} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="299" className="text-lg font-semibold" data-testid="input-amount" />
              <div className="mt-2 flex flex-wrap gap-2">
                {QUICK.map((a) => <Button key={a} type="button" variant="outline" size="sm" onClick={() => setAmount(String(a))}>₹{a}</Button>)}
                           </div>
            </div>

            {(isMobile || effCategory === "postpaid") && operatorCode && (
              <PlanBrowser
                operatorCode={operatorCode}
                circleCode={isMobile ? (circleCode || "12") : "12"}
                onPick={(rs) => setAmount(rs)}
              />
            )}

            {quote && (
              <div className="bg-purple-50 border border-purple-200 rounded p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>Recharge Amount</span><span className="font-semibold">{formatINR(quote.amount)}</span></div>
                <div className="flex justify-between text-green-700"><span>Your Commission ({quote.sharePercent}% of {quote.basePct}%)</span><span className="font-semibold">+{formatINR(quote.commission)}</span></div>
                {quote.sharePercent === 0 && <div className="text-xs text-amber-700">Upgrade to Gold or Premium to earn commission on every recharge</div>}
                {quote.sharePercent > 0 && quote.sharePercent < 90 && <div className="text-xs text-amber-700">Upgrade to Premium to earn up to 3.78% commission</div>}
              </div>
            )}

            {insufficient && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Insufficient wallet balance. <Link href="/wallet/add" className="underline font-semibold">Add money</Link></AlertDescription>
              </Alert>
            )}

            {requiresTpin && !tpinStatus?.hasPin && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>T-PIN required for ₹500+. <Link href="/account" className="underline">Set up</Link></AlertDescription>
              </Alert>
            )}

            <Button className="w-full bg-primary text-white h-12 text-base font-semibold" disabled={initMutation.isPending || insufficient} onClick={handleSubmit} data-testid="btn-recharge">
              {initMutation.isPending ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Processing...</> : `Recharge ${formatINR(amountPaise || 0)}`}
            </Button>

            {isMobile && opsRes && (
              <div className="pt-1 border-t">
                {!showCircle ? (
                  <button type="button" className="text-xs text-muted-foreground hover:text-primary underline" onClick={() => setShowCircle(true)}>
                    Advanced: choose circle
                  </button>
                ) : (
                  <div>
                    <Label>Circle (optional)</Label>
                    <Select value={circleCode} onValueChange={setCircleCode}>
                      <SelectTrigger data-testid="select-circle"><SelectValue placeholder="Gujarat" /></SelectTrigger>
                      <SelectContent>{opsRes.circles.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
  );

  if (embedded) {
    return (
      <>
        {inner}
        <TpinDialog open={showTpin} onOpenChange={setShowTpin} amount={amountPaise} loading={initMutation.isPending} onSubmit={(pin) => initMutation.mutate({ tpin: pin })} />
      </>
    );
  }

  return (
    <div className="flex-1 py-8 px-4 bg-gray-50">
      <div className="container mx-auto max-w-md">
        <Link href="/recharge"><Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="h-4 w-4 mr-2" />Recharge</Button></Link>
        {inner}
      </div>
      <TpinDialog open={showTpin} onOpenChange={setShowTpin} amount={amountPaise} loading={initMutation.isPending} onSubmit={(pin) => initMutation.mutate({ tpin: pin })} />
    </div>
  );
}

}

// ─── Plan Browser (Ezytm) ────────────────────────────────────────────
function PlanBrowser({ operatorCode, circleCode, onPick }: {
  operatorCode: string;
  circleCode: string;
  onPick: (rs: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string>("");
  const { data, isLoading } = useQuery({
    queryKey: ["plans", operatorCode, circleCode],
    queryFn: () => getPlans(operatorCode, circleCode),
    enabled: open && !!operatorCode,
    staleTime: 6 * 60 * 60 * 1000,
  });
  const cats: PlanCategory[] = data?.categories ?? [];
  useEffect(() => {
    if (cats.length && !activeCat) setActiveCat(cats[0].category);
  }, [cats, activeCat]);
  const current = cats.find((c) => c.category === activeCat) ?? cats[0];

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 bg-gradient-to-r from-indigo-50 to-purple-50 text-left text-sm font-semibold text-indigo-900 flex items-center justify-between hover:from-indigo-100 hover:to-purple-100"
        data-testid="btn-browse-plans"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4" /> Browse Plans
        </span>
        <span className="text-xs">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>
      {open && (
        <div className="bg-white">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
            </div>
          ) : cats.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No plans available</div>
          ) : (
            <>
              <div className="flex overflow-x-auto border-b bg-gray-50 text-xs">
                {cats.map((c) => (
                  <button
                    key={c.category}
                    type="button"
                    onClick={() => setActiveCat(c.category)}
                    className={`px-3 py-2 whitespace-nowrap font-medium ${
                      activeCat === c.category
                        ? "border-b-2 border-indigo-600 text-indigo-700 bg-white"
                        : "text-gray-600 hover:text-indigo-700"
                    }`}
                  >
                    {c.category} ({c.plans.length})
                  </button>
                ))}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y">
                {(current?.plans ?? []).map((p, i) => (
                  <button
                    key={`${p.rs}-${i}`}
                    type="button"
                    onClick={() => onPick(p.rs)}
                    className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-start justify-between gap-3"
                    data-testid={`plan-${p.rs}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-600 line-clamp-2">{p.desc || "—"}</div>
                      {p.validity && (
                        <div className="text-[11px] text-indigo-700 mt-0.5">Validity: {p.validity}</div>
                      )}
                    </div>
                    <div className="font-bold text-base text-indigo-700 shrink-0">₹{p.rs}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
