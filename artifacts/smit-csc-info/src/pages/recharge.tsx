import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PartyPopper } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Smartphone, Tv, Receipt, Wallet, History, Loader2, Plus,
  CheckCircle2, XCircle, Clock, ArrowDownCircle, ArrowUpCircle,
  TrendingUp, Banknote, RefreshCw, Percent,
  LayoutDashboard, Zap, BarChart3, LifeBuoy, Smartphone as SmartphoneIcon, Download,
  User as UserIcon, Crown, Sparkles, ArrowRight, Check,
  Phone, Lightbulb, Flame, ShieldCheck, Send, CreditCard, Gift,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getWallet, formatINR, getRechargeDashboard, type RechargeDashboard,
  getOperatorMembershipPlans, getOperatorMembershipStatus,
  initOperatorMembership, verifyOperatorMembership,
  submitServiceRequest, type ServiceRequestKind,
  type OperatorTier, type OperatorPlan,
} from "@/lib/recharge-api";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import RechargeForm from "@/pages/recharge-form";
import MoneyTransferHubV2 from "@/pages/money-transfer";

// ─── Sub-header tabs ─────────────────────────────────────────────────────────
type TabId = "dashboard" | "recharge" | "report" | "commission" | "upgrade" | "support" | "app";

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "dashboard",  label: "Dashboard",     icon: LayoutDashboard },
  { id: "recharge",   label: "Recharge",      icon: Zap },
  { id: "report",     label: "Report",        icon: BarChart3 },
  { id: "commission", label: "My Commission", icon: Percent },
  { id: "upgrade",    label: "Upgrade",       icon: Crown },
  { id: "support",    label: "Support",       icon: LifeBuoy },
  { id: "app",        label: "Download App",  icon: Download },
];

type ServiceSlug =
  | "mobile" | "dth" | "postpaid" | "electricity" | "gas"
  | "insurance" | "fastag" | "giftcard"
  | "money_transfer" | "nsdl_pan";

interface ServiceDef {
  slug: ServiceSlug;
  label: string;       // shown on the tab pill
  title: string;       // shown on the form's gradient header
  icon: React.ComponentType<{ className?: string }>;
}

const SERVICES: ServiceDef[] = [
  { slug: "mobile",         label: "MOBILE",         title: "Mobile Recharge (Prepaid)", icon: Smartphone },
  { slug: "dth",            label: "DTH",            title: "DTH Recharge",              icon: Tv },
  { slug: "postpaid",       label: "POSTPAID BILL",  title: "Postpaid Bill Payment",     icon: Phone },
  { slug: "electricity",    label: "ELECTRICITY",    title: "Electricity Bill Payment",  icon: Lightbulb },
  { slug: "gas",            label: "GAS CYLINDER",   title: "Gas Cylinder / Bill",       icon: Flame },
  { slug: "insurance",      label: "LIC PREMIUM",    title: "LIC / Insurance Premium",   icon: ShieldCheck },
  { slug: "fastag",         label: "FASTAG",         title: "FASTag Recharge",           icon: CreditCard },
  { slug: "giftcard",       label: "GOOGLE PLAY",    title: "Google Play Gift Card",     icon: Gift },
  { slug: "money_transfer", label: "MONEY TRANSFER", title: "Money Transfer",            icon: Send },
  { slug: "nsdl_pan",       label: "NSDL PAN CARD",  title: "NSDL e-KYC Instant PAN",    icon: CreditCard },
];

const VALID_TABS: TabId[] = ["dashboard", "recharge", "report", "commission", "upgrade", "support", "app"];

function readTabFromHash(): TabId {
  if (typeof window === "undefined") return "dashboard";
  // Hash may be "#upgrade" or "#upgrade?txn=..."; strip query first.
  const raw = window.location.hash.replace(/^#/, "").split("?")[0] as TabId;
  return VALID_TABS.includes(raw) ? raw : "dashboard";
}

function readTxnFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const idx = window.location.hash.indexOf("?");
  if (idx === -1) return null;
  return new URLSearchParams(window.location.hash.slice(idx + 1)).get("txn");
}

const TIER_BADGE: Record<OperatorTier, { label: string; cls: string }> = {
  silver:  { label: "Silver",  cls: "bg-gray-200 text-gray-800 border-gray-300" },
  gold:    { label: "Gold",    cls: "bg-gradient-to-r from-amber-400 to-yellow-500 text-white border-amber-500" },
  premium: { label: "Premium", cls: "bg-gradient-to-r from-fuchsia-600 to-purple-700 text-white border-purple-700" },
};

export default function RechargeHub() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTabState] = useState<TabId>(() => readTabFromHash());
  const [, setLocation] = useLocation();

  const setTab = (t: TabId) => {
    setTabState(t);
    if (typeof window !== "undefined") {
      history.replaceState(null, "", `#${t}`);
    }
  };

  const walletQ = useQuery({ queryKey: ["wallet"], queryFn: getWallet, enabled: !!user });
  const dashQ   = useQuery({ queryKey: ["recharge", "dashboard"], queryFn: () => getRechargeDashboard(), enabled: !!user, refetchInterval: 60_000 });
  const tierQ   = useQuery({ queryKey: ["operator-membership", "status"], queryFn: getOperatorMembershipStatus, enabled: !!user });

    // ── Upgrade celebration modal state ──────────────────────────────
  const [celebrate, setCelebrate] = useState<{
    open: boolean;
    state: "loading" | "success" | "pending" | "failed";
    tier?: OperatorTier;
    error?: string;
  }>({ open: false, state: "loading" });

  // On mount: if returning from PhonePe with #upgrade?txn=..., verify & celebrate.
  useEffect(() => {
    if (!user) return;
    const txn = readTxnFromHash();
    if (!txn) return;
    setTabState("upgrade");
    setCelebrate({ open: true, state: "loading" });
    (async () => {
      try {
        const r = await verifyOperatorMembership(txn);
        if (r.status === "success") {
          setCelebrate({ open: true, state: "success", tier: r.tier });
        } else if (r.status === "pending") {
          setCelebrate({ open: true, state: "pending" });
        } else {
          setCelebrate({ open: true, state: "failed", error: r.error });
        }
        await qc.invalidateQueries({ queryKey: ["operator-membership", "status"] });
        await qc.invalidateQueries({ queryKey: ["wallet"] });
        // Strip the query portion of the hash to avoid re-running verify.
        history.replaceState(null, "", "#upgrade");
      } catch (err: any) {
        setCelebrate({ open: true, state: "failed", error: err?.message ?? "Verification failed" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) {
    return (
      <div className="flex-1 p-8 text-center">
        Please <Link href="/login" className="text-primary underline">login</Link> to continue.
      </div>
    );
  }

      return (
    <div className="flex-1 bg-gray-50">
      <UpgradeCelebrationModal
        open={celebrate.open}
        state={celebrate.state}
        tier={celebrate.tier}
        error={celebrate.error}
        onClose={() => setCelebrate((c) => ({ ...c, open: false }))}
      />
      <div className="bg-gradient-to-r from-purple-700 via-purple-600 to-amber-500 shadow">
        <div className="container mx-auto max-w-6xl px-2">
          <div className="flex overflow-x-auto no-scrollbar">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  data-testid={`tab-${t.id}`}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                    active
                      ? "text-white border-white bg-white/10"
                      : "text-white/80 border-transparent hover:text-white hover:bg-white/5"
                  }`}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Operator strip — always visible */}
        <Card className="overflow-hidden border-0 shadow-md">
          <div className="bg-gradient-to-r from-purple-50 via-white to-amber-50">
            <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-600 to-amber-500 flex items-center justify-center text-white shadow">
                  <UserIcon className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Operator</div>
                  <div className="font-bold text-lg flex items-center gap-2 flex-wrap" data-testid="text-operator-name">
                    {user.name ?? user.email}
                    {tierQ.data && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold px-2 py-0.5 ${TIER_BADGE[tierQ.data.tier].cls}`}
                        data-testid="badge-operator-tier"
                      >
                        <Crown className="h-3 w-3 mr-1" />
                        {TIER_BADGE[tierQ.data.tier].label}
                        {tierQ.data.viaPrime && <span className="ml-1 opacity-90">(via Prime)</span>}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Available Balance</div>
                  <div className="font-bold text-xl text-purple-700" data-testid="text-wallet-balance">
                    {walletQ.isLoading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : walletQ.data ? formatINR(walletQ.data.balance) : "—"}
                  </div>
                </div>
                <Link href="/wallet/add">
                  <Button size="sm" className="bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-90 text-white shadow" data-testid="btn-add-money">
                    <Plus className="h-4 w-4 mr-1" />Add Money
                  </Button>
                </Link>
              </div>
            </CardContent>
          </div>
        </Card>

        {/* Auto-rotating Gold ↔ Premium promo banners — hidden on the Upgrade tab,
            and hidden once the user is already on the Premium tier. */}
        {tab !== "upgrade" && tierQ.data?.tier !== "premium" && (
          <PromoBanners currentTier={tierQ.data?.tier ?? "silver"} onUpgrade={() => setTab("upgrade")} />
        )}

        {/* Tab content */}
        {tab === "dashboard"  && <DashboardView dash={dashQ.data} loading={dashQ.isLoading} />}
        {tab === "recharge"   && <RechargeServicesView />}
        {tab === "report"     && <ReportView onOpen={() => setLocation("/recharge/history")} />}
        {tab === "commission" && <CommissionView onUpgrade={() => setTab("upgrade")} />}
        {tab === "upgrade"    && (
          <UpgradeView
            currentTier={tierQ.data?.tier ?? "silver"}
            purchasedTier={tierQ.data?.purchasedTier ?? "silver"}
            viaPrime={tierQ.data?.viaPrime ?? false}
          />
        )}
        {tab === "support"    && <SupportView />}
        {tab === "app"        && <DownloadAppView />}
      </div>
    </div>
  );
}

// ─── Auto-rotating promo banners (Gold ↔ Premium, slide L↔R) ─────────────────
const BANNERS: Array<{
  id: OperatorTier;
  title: string;
  subtitle: string;
  cta: string;
  grad: string;
  ring: string;
  icon: React.ReactNode;
}> = [
  {
    id: "gold",
    title: "Upgrade to Gold — ₹999 lifetime",
    subtitle: "Earn up to 2.80% on Mobile, up to 3.36% on DTH. One-time payment, unlimited use.",
    cta: "Upgrade to Gold",
    grad: "from-amber-400 via-yellow-500 to-orange-500",
    ring: "ring-amber-300",
    icon: <Crown className="h-7 w-7" />,
  },
  {
    id: "premium",
    title: "Go Premium — ₹1999 lifetime",
    subtitle: "Earn up to 3.15% on Mobile, up to 3.78% on DTH. Priority processing & dedicated support.",
    cta: "Get Premium",
    grad: "from-fuchsia-600 via-purple-700 to-indigo-700",
    ring: "ring-purple-400",
    icon: <Sparkles className="h-7 w-7" />,
  },
];

function PromoBanners({ currentTier, onUpgrade }: { currentTier: OperatorTier; onUpgrade: () => void }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  // If user is already Gold, only show Premium banner.
  const visible = currentTier === "gold" ? BANNERS.filter((b) => b.id === "premium") : BANNERS;

  useEffect(() => {
    if (visible.length <= 1 || paused) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % visible.length), 4000);
    return () => clearInterval(id);
  }, [visible.length, paused]);

  return (
    <div
      className="relative overflow-hidden rounded-xl shadow-lg"
      data-testid="promo-banners"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      onTouchCancel={() => setPaused(false)}
    >
      <div
        className="flex transition-transform duration-700 ease-in-out"
        style={{ transform: `translateX(-${idx * 100}%)` }}
      >
        {visible.map((b) => (
          <button
            key={b.id}
            onClick={onUpgrade}
            data-testid={`banner-${b.id}`}
            className={`min-w-full bg-gradient-to-r ${b.grad} text-white text-left px-5 py-4 sm:py-5 flex items-center gap-4 cursor-pointer hover:brightness-110 transition`}
          >
            <div className={`h-12 w-12 rounded-full bg-white/20 flex items-center justify-center ring-2 ${b.ring} shrink-0`}>
              {b.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base sm:text-lg truncate">{b.title}</div>
              <div className="text-xs sm:text-sm opacity-95 line-clamp-2">{b.subtitle}</div>
            </div>
            <div className="hidden sm:flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-full font-semibold text-sm shrink-0 hover:bg-white/30">
              {b.cta} <ArrowRight className="h-4 w-4" />
            </div>
          </button>
        ))}
      </div>
      {visible.length > 1 && (
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1.5">
          {visible.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Go to banner ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-1.5 bg-white/50"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard view ──────────────────────────────────────────────────────────
function DashboardView({ dash, loading }: { dash?: RechargeDashboard; loading: boolean }) {
  const t = dash?.today;
  const w = dash?.wallet;

  const cards: Array<{ label: string; value: string; icon: React.ReactNode; bg: string }> = [
    { label: "Total Success",   value: t ? String(t.successCount) : "—", icon: <CheckCircle2 className="h-7 w-7" />,    bg: "from-green-500 to-emerald-600" },
    { label: "Total Failure",   value: t ? String(t.failedCount)  : "—", icon: <XCircle className="h-7 w-7" />,         bg: "from-rose-500 to-red-600" },
    { label: "Total Pending",   value: t ? String(t.pendingCount) : "—", icon: <Clock className="h-7 w-7" />,           bg: "from-amber-500 to-orange-500" },
    { label: "Wallet Topup",    value: t ? formatINR(t.walletTopupPaise)   : "—", icon: <ArrowUpCircle className="h-7 w-7" />,   bg: "from-blue-500 to-indigo-600" },
    { label: "Opening Balance", value: w ? formatINR(w.openingBalancePaise) : "—", icon: <TrendingUp className="h-7 w-7" />,    bg: "from-cyan-500 to-sky-600" },
    { label: "Recharge Debit",  value: t ? formatINR(t.rechargeDebitPaise) : "—", icon: <ArrowDownCircle className="h-7 w-7" />, bg: "from-pink-500 to-rose-600" },
    { label: "Refund Credit",   value: t ? formatINR(t.refundCreditPaise)  : "—", icon: <RefreshCw className="h-7 w-7" />,       bg: "from-teal-500 to-emerald-600" },
    { label: "Profit",          value: t ? formatINR(t.profitPaise)        : "—", icon: <Banknote className="h-7 w-7" />,        bg: "from-fuchsia-500 to-purple-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className={`overflow-hidden text-white border-0 shadow-md bg-gradient-to-br ${c.bg}`} data-testid={`kpi-${c.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="opacity-90">{c.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-wide opacity-90">{c.label}</div>
                <div className="text-xl font-bold truncate">
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : c.value}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today's Operator Report */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-600 px-5 py-3">
          <h2 className="text-white font-bold">Today's Operator Report</h2>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-today-operators">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="p-3">Company</th>
                  <th className="p-3 text-right">Success</th>
                  <th className="p-3 text-right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></td></tr>
                ) : (dash?.operators ?? []).length === 0 ? (
                  <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No recharges today</td></tr>
                ) : (
                  <>
                    {dash!.operators.map((o, i) => (
                      <tr key={`${o.type}-${o.operatorCode}-${i}`} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          <div className="font-medium">{o.operatorName}</div>
                          <div className="text-xs text-muted-foreground uppercase">{o.type}</div>
                        </td>
                        <td className="p-3 text-right">{formatINR(o.successAmountPaise)}<div className="text-xs text-muted-foreground">{o.successCount} txn</div></td>
                        <td className="p-3 text-right text-emerald-700 font-semibold">{formatINR(o.profitPaise)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-bold">
                      <td className="p-3">Total</td>
                      <td className="p-3 text-right">{formatINR(t?.rechargeDebitPaise ?? 0)}</td>
                      <td className="p-3 text-right text-emerald-700">{formatINR(t?.profitPaise ?? 0)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Recharge services view — 8 tabbed services matching portal style ────────
function RechargeServicesView() {
  const [active, setActive] = useState<ServiceSlug>("mobile");
  const activeDef = SERVICES.find((s) => s.slug === active) ?? SERVICES[0];

  return (
    <div className="space-y-4">
      {/* ─── Service tab strip (matches reference portal) ─────────────────── */}
      <div
        className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin"
        data-testid="service-tabs"
      >
        {SERVICES.map((s) => {
          const isActive = s.slug === active;
          return (
            <button
              key={s.slug}
              onClick={() => setActive(s.slug)}
              data-testid={`service-tab-${s.slug}`}
              className={`relative shrink-0 flex items-center gap-2 px-4 py-3 rounded-md text-xs sm:text-sm font-bold uppercase tracking-wide transition-all
                ${isActive
                  ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg ring-2 ring-blue-300"
                  : "bg-slate-800 text-white/90 hover:bg-slate-700"}`}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-cyan-500"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Active service form ──────────────────────────────────────────── */}
      <div data-testid={`service-panel-${active}`}>
        {active === "mobile"      && <RechargeForm category="mobile"      embedded titleOverride={activeDef.title} />}
        {active === "dth"         && <RechargeForm category="dth"         embedded titleOverride={activeDef.title} />}
        {active === "postpaid"    && <RechargeForm category="postpaid"    embedded titleOverride={activeDef.title} />}
        {active === "electricity" && <RechargeForm category="electricity" embedded titleOverride={activeDef.title} />}
        {active === "gas"         && <RechargeForm category="gas"         embedded titleOverride={activeDef.title} />}
        {active === "insurance"   && <RechargeForm category="insurance"   embedded titleOverride={activeDef.title} />}
        {active === "fastag"      && <RechargeForm category="fastag"      embedded titleOverride={activeDef.title} />}
        {active === "giftcard"    && <RechargeForm category="giftcard"    embedded titleOverride={activeDef.title} />}
        {active === "money_transfer"  && <MoneyTransferHubV2 />}
        {active === "nsdl_pan"        && <NsdlPanHub def={activeDef} />}
      </div>

      {/* ─── Quick links ──────────────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap pt-2">
        <Link href="/recharge/history"><Button variant="outline" size="sm"><History className="h-4 w-4 mr-2" />Recharge History</Button></Link>
        <Link href="/wallet"><Button variant="outline" size="sm"><Wallet className="h-4 w-4 mr-2" />My Wallet</Button></Link>
      </div>
    </div>
  );
}

// ─── Money Transfer hub — 5 inner sub-tabs (DMT flow) ────────────────────────
const MT_TABS: Array<{ id: ServiceRequestKind; label: string; title: string }> = [
  { id: "Money Transfer",      label: "MONEY TRANSFER",      title: "Money Transfer" },
  { id: "Sender Registration", label: "SENDER REGISTRATION", title: "Sender Registration" },
  { id: "Add Beneficiary",     label: "ADD BENEFICIARY",     title: "Add Beneficiary" },
  { id: "Verify Beneficiary",  label: "VERIFY BENEFICIARY",  title: "Verify Beneficiary" },
  { id: "Search Beneficiary",  label: "SEARCH BENEFICIARY",  title: "Search Beneficiary" },
];

function MoneyTransferHub({ def }: { def: ServiceDef }) {
  const [sub, setSub] = useState<ServiceRequestKind>("Money Transfer");
  const subDef = MT_TABS.find((t) => t.id === sub) ?? MT_TABS[0];
  return (
    <div className="space-y-3">
      {/* Inner tab strip — same dark-pill + caret style as the parent strip */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" data-testid="mt-tabs">
        {MT_TABS.map((t) => {
          const isActive = t.id === sub;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              data-testid={`mt-tab-${t.id.replace(/\s+/g, "-").toLowerCase()}`}
              className={`relative shrink-0 px-3.5 py-2.5 rounded-md text-[11px] sm:text-xs font-bold uppercase tracking-wide transition-all
                ${isActive
                  ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md ring-2 ring-blue-300"
                  : "bg-slate-800 text-white/90 hover:bg-slate-700"}`}
            >
              {t.label}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0 border-l-[7px] border-r-[7px] border-t-[7px] border-l-transparent border-r-transparent border-t-cyan-500"
                />
              )}
            </button>
          );
        })}
      </div>
      <ServiceRequestForm
        key={sub}
        kind={sub}
        def={{ ...def, title: subDef.title, icon: Send }}
      />
    </div>
  );
}

// ─── NSDL PAN Card hub — 3 inner sub-tabs ────────────────────────────────────
type NsdlSub = "new" | "correction" | "incomplete";
const NSDL_TABS: Array<{ id: NsdlSub; label: string; title: string }> = [
  { id: "new",        label: "NEW PAN CARD",       title: "NSDL e-KYC Instant PAN" },
  { id: "correction", label: "PAN CARD CORRECTION", title: "NSDL e-KYC PAN CARD CORRECTION" },
  { id: "incomplete", label: "INCOMPLETE PAN CARD", title: "Incomplete Pan Card Details" },
];

function NsdlPanHub({ def }: { def: ServiceDef }) {
  const [sub, setSub] = useState<NsdlSub>("new");
  const subDef = NSDL_TABS.find((t) => t.id === sub) ?? NSDL_TABS[0];
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" data-testid="nsdl-tabs">
        {NSDL_TABS.map((t) => {
          const isActive = t.id === sub;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              data-testid={`nsdl-tab-${t.id}`}
              className={`relative shrink-0 px-3.5 py-2.5 rounded-md text-[11px] sm:text-xs font-bold uppercase tracking-wide transition-all
                ${isActive
                  ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md ring-2 ring-blue-300"
                  : "bg-slate-800 text-white/90 hover:bg-slate-700"}`}
            >
              {t.label}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0 border-l-[7px] border-r-[7px] border-t-[7px] border-l-transparent border-r-transparent border-t-cyan-500"
                />
              )}
            </button>
          );
        })}
      </div>
      {sub === "new" && (
        <ServiceRequestForm
          key="nsdl-new"
          kind="NSDL New PAN"
          def={{ ...def, title: subDef.title, icon: CreditCard }}
        />
      )}
      {sub === "correction" && (
        <ServiceRequestForm
          key="nsdl-correction"
          kind="NSDL PAN Correction"
          def={{ ...def, title: subDef.title, icon: CreditCard }}
        />
      )}
      {sub === "incomplete" && (
        <Card className="shadow-md border-2 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-600 text-white px-5 py-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            <div className="font-bold text-sm sm:text-base uppercase tracking-wide">{subDef.title}</div>
          </div>
          <CardContent className="pt-5">
            <div className="border rounded-md overflow-hidden">
              <div className="grid grid-cols-3 bg-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-700">
                <div>TX ID</div>
                <div>Mobile Number</div>
                <div className="text-right">Action</div>
              </div>
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                No incomplete PAN card applications.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Service request form (Postpaid / Insurance / Money Transfer / NSDL PAN) ──
function ServiceRequestForm({ kind, def }: { kind: ServiceRequestKind; def: ServiceDef }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  // Per-service field schemas — keep in sync with reference screenshots.
  const POSTPAID_OPERATORS = [
    "Airtel Landline", "Airtel Postpaid", "BSNL Landline", "BSNL Postpaid",
    "Idea Postpaid", "JIO Postpaid", "MTNL Delhi Landline",
    "Tata Docomo Postpaid", "Vodafone Postpaid",
  ];
  const INSURANCE_PROVIDERS = [
    "ICICI Prudential Insurance",
    "Tata AIA Insurance",
  ];
  const TRANSFER_MODES = ["IMPS", "NEFT", "UPI"];

  // Comprehensive electricity board / DISCOM list (matches a1topup catalogue)
  const ELECTRICITY_OPERATORS = [
    "Adani Power",
    "Ajmer Vidyut Vitran Nigam - RAJASTHAN",
    "APDCL (Non-RAPDR) - ASSAM",
    "APEPDCL - ANDHRA PRADESH",
    "Assam Power Distribution Company Ltd (RAPDR)",
    "Bangalore Electricity Supply Company",
    "BEST Mumbai",
    "Bharatpur Electricity Services Ltd",
    "Bikaner Electricity Supply Limited",
    "Brihan Mumbai Electric Supply and Transport Undertaking",
    "BSES Rajdhani Power Limited - Delhi",
    "BSES Yamuna Power Limited - Delhi",
    "Central Power Distribution Company of Andhra Pradesh Ltd",
    "CESC - WEST BENGAL",
    "Chamundeshwari Electricity Supply Corporation Ltd. (Cesc, Mysore)",
    "Chhattisgarh State Power Distribution Company Ltd. (CSPDCL)",
    "Dakshin Gujarat Vij Company Ltd",
    "Dakshin Haryana Bijli Vitran Nigam",
    "Department of Power, Arunachal Pradesh",
    "Department of Power, Nagaland",
    "DNH Power Distribution Company Limited",
    "Gift Power Company Limited",
    "Goa Electricity",
    "Government of Puducherry Electricity Department",
    "Gulbarga Electricity Supply Company Limited",
    "Himachal Pradesh State Electricity Board Ltd",
    "Hubli Electricity Supply Company Ltd. (HESCOM)",
    "India Power - WEST BENGAL",
    "India Power Corporation Limited",
    "Jaipur Vidyut Vitran Nigam - RAJASTHAN",
    "Jammu & Kashmir Power Development Department",
    "Jamshedpur Utilities and Services Company Limited",
    "JBVNL - JHARKHAND",
    "Jodhpur Vidyut Vitran Nigam - RAJASTHAN",
    "Kannan Devan Hills Power",
    "Kanpur Electricity Supply Company",
    "KEDL - KOTA",
    "Kerala State Electricity Board Ltd.",
    "Lakshadweep Electricity Department",
    "Madhya Gujarat Vij Company Ltd",
    "Madhya Pradesh Madhya Kshetra Vidyut Vitaran - RURAL",
    "Madhya Pradesh Poorv Kshetra Vidyut Vitaran - URBAN",
    "Madhyanchal Vidyut Vitran Nigam Limited",
    "Mangalore Electricity Supply Co. Ltd (MESCOM) - RAPDR",
    "Mangalore Electricity Supply Co. Ltd (Non) - RAPDR",
    "Manipur State Power Distribution Company Limited (Prepaid)",
    "MEPDCL - MEGHALAYA",
    "MP Madhya Kshetra Vidyut Vitaran - Urban",
    "MP Poorv Kshetra Vidyut Vitaran - Jabalpur",
    "MP Poorv Kshetra Vidyut Vitaran - Rural",
    "MSEDC - MAHARASHTRA",
    "Municipal Corporation of Gurugram",
    "Muzaffarpur Vidyut Vitran",
    "NESCO Odisha",
    "New Delhi Municipal Council (NDMC) - Electricity",
    "Noida Power - NOIDA",
    "North Bihar Electricity",
    "North Delhi Power Limited",
    "Paschim Gujarat Vij Company Ltd",
    "Paschim Kshetra Vitaran - MADHYA PRADESH",
    "Power & Electricity Department - Mizoram",
    "Punjab State Power Corporation Limited",
    "Reliance Energy",
    "Sikkim Power Rural",
    "Sikkim Power Urban",
    "SNDL Power - NAGPUR",
    "South Bihar Electricity",
    "SOUTHCO Odisha",
    "Southern Power - ANDHRA PRADESH",
    "Southern Power - TELANGANA",
    "Tata Power - MUMBAI",
    "Tata Power Delhi Limited - Delhi",
    "TNEB - TAMIL NADU",
    "Torrent Power Agra",
    "Torrent Power Ahmedabad",
    "Torrent Power Bhivandi",
    "Torrent Power Dahej",
    "Torrent Power SHIL",
    "Torrent Power Surat",
    "TP Ajmer Distribution Ltd",
    "TP Central Odisha Distribution Limited",
    "Tripura State Electricity Corporation Ltd",
    "TSNPDCL Telangana Northern Power",
    "UPPCL (URBAN) - UTTAR PRADESH",
    "Uttar Pradesh Power Corporation Limited (Rural)",
    "Uttarakhand Power Corporation Limited",
    "Uttar Gujarat Vij Company Ltd",
    "Uttar Haryana Bijli Vitran Nigam",
    "WBSEDCL - WEST BENGAL",
    "Western Electricity Supply Co. of Orissa Ltd.",
  ];

  // Gas providers — exact list from a1topup screenshot
  const GAS_OPERATORS = [
    "Adani Gas",
    "Gujarat Gas",
    "Hindustan Petroleum Corporation Ltd",
    "Indraprastha Gas",
    "Mahanagar Gas",
  ];

  type FieldDef = {
    key: string;
    label: string;
    placeholder: string;
    type?: "tel" | "text" | "number" | "date" | "checkbox";
    required?: boolean;
    options?: string[];
  };

  const CONSENT_FIELD: FieldDef = {
    key: "Aadhaar Consent",
    label: "I (Consumer) hereby state that I have no objection in authenticating myself with Aadhaar based UID/VID authentication system and provide my consent for the same.",
    placeholder: "",
    type: "checkbox",
    required: true,
  };

  const FIELDS: Record<ServiceRequestKind, FieldDef[]> = {
    "Postpaid Bill": [
      { key: "Mobile Number", label: "Mobile Number", placeholder: "Please Enter Postpaid Number", type: "tel", required: true },
      { key: "Operator",      label: "Operator",      placeholder: "Select Operator",              required: true, options: POSTPAID_OPERATORS },
      { key: "Amount",        label: "Amount (₹)",    placeholder: "Bill amount",                  type: "number", required: true },
    ],
    "Insurance Payment": [
      { key: "Policy Number",      label: "Policy Number",      placeholder: "Please enter customer policy number", required: true },
      { key: "Insurance Provider", label: "Insurance Provider", placeholder: "Select Provider",                     required: true, options: INSURANCE_PROVIDERS },
      { key: "Amount",             label: "Amount (₹)",         placeholder: "Premium amount",                      type: "number", required: true },
      { key: "Date of Birth",      label: "Date of Birth",      placeholder: "dd-mm-yyyy",                           type: "date" },
    ],
    "Money Transfer": [
      { key: "Sender Mobile",  label: "Sender Mobile",   placeholder: "Please sender mobile",        type: "tel", required: true },
      { key: "Beneficiary ID", label: "Beneficiary ID",  placeholder: "Please enter Beneficiary ID", required: true },
      { key: "Transfer Mode",  label: "Transfer Mode",   placeholder: "Select Provider",             required: true, options: TRANSFER_MODES },
      { key: "Amount",         label: "Amount (₹)",      placeholder: "Please enter Transfer Amount", type: "number", required: true },
    ],
    "Sender Registration": [
      { key: "Sender Name",     label: "Sender Name",     placeholder: "Please enter name",        required: true },
      { key: "Postal Pin Code", label: "Postal Pin Code", placeholder: "Please enter Area pincode", type: "tel", required: true },
      { key: "Mobile",          label: "Mobile",          placeholder: "Please enter mobile number", type: "tel", required: true },
    ],
    "Add Beneficiary": [
      { key: "Sender Mobile",       label: "Sender Mobile",       placeholder: "Please sender mobile",         type: "tel", required: true },
      { key: "Beneficiary Name",    label: "Beneficiary Name",    placeholder: "Please enter Beneficiary Name", required: true },
      { key: "Beneficiary Mobile",  label: "Beneficiary Mobile",  placeholder: "Please enter ben_mobile number", type: "tel", required: true },
      { key: "Bank Account Number", label: "Bank Account Number", placeholder: "Please enter account number",  required: true },
      { key: "IFSC Code",           label: "IFSC Code",           placeholder: "Please enter IFSC Code",        required: true },
    ],
    "Verify Beneficiary": [
      { key: "Sender Mobile",  label: "Sender Mobile",  placeholder: "Please sender mobile",        type: "tel", required: true },
      { key: "Beneficiary ID", label: "Beneficiary ID", placeholder: "Please enter Beneficiary ID", required: true },
      { key: "OTP",            label: "OTP",            placeholder: "Please enter OTP Code",       type: "tel", required: true },
    ],
    "Search Beneficiary": [
      { key: "Sender Mobile", label: "Sender Mobile", placeholder: "Please sender mobile", type: "tel", required: true },
    ],
    "NSDL PAN Card": [
      { key: "Customer Mobile", label: "Customer Mobile No.", placeholder: "Please enter mobile no.",  type: "tel", required: true },
      { key: "Transaction Type", label: "Transaction Type",   placeholder: "Select Transaction Type",  required: true,
        options: [
          "NSDL EKYC PAN (Instant Pan)",
          "NSDL ESIGN PAN (Scan Based with photo and signature)",
        ] },
    ],
    "NSDL New PAN": [
      { key: "Customer Mobile",  label: "Customer Mobile No.", placeholder: "Please Enter Mobile No",  type: "tel", required: true },
      { key: "Transaction Type", label: "Transaction Type",    placeholder: "Select Transaction Type", required: true,
        options: [
          "NSDL EKYC PAN (Instant Pan)",
          "NSDL ESIGN PAN (Scan Based with photo and signature)",
        ] },
      CONSENT_FIELD,
    ],
    "NSDL PAN Correction": [
      { key: "Customer Mobile",  label: "Customer Mobile No.", placeholder: "Please Enter Mobile No",  type: "tel", required: true },
      { key: "Transaction Type", label: "Transaction Type",    placeholder: "Select Transaction Type", required: true,
        options: [
          "NSDL EKYC PAN CORRECTION (Instant Pan)",
          "NSDL ESIGN PAN CORRECTION (Scan Based with photo and signature)",
        ] },
      CONSENT_FIELD,
    ],
    "Electricity Bill": [
      { key: "Consumer Number", label: "Consumer Number / K-Number", placeholder: "Please enter consumer number", required: true },
      { key: "Operator",        label: "Operator",                    placeholder: "Select Operator",              required: true, options: ELECTRICITY_OPERATORS },
      { key: "Amount",          label: "Amount (₹)",                  placeholder: "Bill amount",                  type: "number", required: true },
    ],
    "Gas Bill": [
      { key: "Consumer Number", label: "Consumer / CA Number", placeholder: "Please enter consumer number", required: true },
      { key: "Operator",        label: "Gas Provider",          placeholder: "Select Provider",              required: true, options: GAS_OPERATORS },
      { key: "Amount",          label: "Amount (₹)",            placeholder: "Bill amount",                  type: "number", required: true },
    ],
  };

  const fields = FIELDS[kind];

  const setVal = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    for (const f of fields) {
      if (!f.required) continue;
      if (f.type === "checkbox") {
        if (form[f.key] !== "Yes") {
          toast({ variant: "destructive", title: "Consent required", description: "Please tick the consent checkbox to continue." });
          return;
        }
      } else if (!form[f.key]?.trim()) {
        toast({ variant: "destructive", title: "Missing field", description: `${f.label} is required.` });
        return;
      }
    }
    setBusy(true);
    try {
      const r = await submitServiceRequest(kind, form);
      toast({ title: "Request submitted", description: r.message });
      setForm({});
    } catch (err: any) {
      toast({ variant: "destructive", title: "Submission failed", description: err?.message ?? "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="shadow-md border-2 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-600 text-white px-5 py-4 flex items-center gap-2">
        <def.icon className="h-5 w-5" />
        <div className="font-bold text-sm sm:text-base uppercase tracking-wide">{def.title}</div>
      </div>
      <CardContent className="space-y-4 pt-5">
        <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-xs text-blue-800 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
          <span>This service is <b>activated</b>. Submit your details and our team will process and confirm within 24 hours.</span>
        </div>
        {fields.map((f) => (
          <div key={f.key}>
            {f.type === "checkbox" ? (
              <label className="flex items-start gap-2 cursor-pointer text-sm text-slate-700 leading-snug">
                <input
                  type="checkbox"
                  checked={form[f.key] === "Yes"}
                  onChange={(e) => setVal(f.key, e.target.checked ? "Yes" : "")}
                  data-testid={`sr-checkbox-${f.key}`}
                  className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
                />
                <span>{f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}</span>
              </label>
            ) : (
            <>
            <Label htmlFor={`sr-${f.key}`} className="text-sm">
              {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
            </Label>
            {f.options ? (
              <select
                id={`sr-${f.key}`}
                value={form[f.key] ?? ""}
                onChange={(e) => setVal(f.key, e.target.value)}
                data-testid={`sr-select-${f.key}`}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" className="bg-blue-600 text-white">{f.placeholder}{f.required ? "*" : ""}</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <Input
                id={`sr-${f.key}`}
                type={f.type ?? "text"}
                value={form[f.key] ?? ""}
                onChange={(e) => setVal(f.key, e.target.value)}
                placeholder={f.placeholder}
                data-testid={`sr-input-${f.key}`}
              />
            )}
            </>
            )}
          </div>
        ))}
        <Button
          onClick={handleSubmit}
          disabled={busy}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white h-11 font-semibold"
          data-testid={`sr-submit-${kind}`}
        >
          {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</> : <>Submit Request <ArrowRight className="h-4 w-4 ml-2" /></>}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Report view ─────────────────────────────────────────────────────────────
function ReportView({ onOpen }: { onOpen: () => void }) {
  const reports: Array<{ to: string; title: string; desc: string; grad: string; icon: React.ReactNode; testId: string; onClick?: () => void }> = [
    { to: "/recharge/daybook",  title: "Day Book",          desc: "Daily KPIs: opening, closing, top-ups, recharges, profit.", grad: "from-cyan-500 to-blue-600",       icon: <BarChart3 className="h-6 w-6" />,  testId: "report-link-daybook" },
    { to: "/recharge/ledger",   title: "Ledger Report",     desc: "Wallet ledger between dates with credit / debit / balance + CSV export.", grad: "from-purple-600 to-indigo-600",   icon: <Wallet className="h-6 w-6" />,     testId: "report-link-ledger" },
    { to: "/recharge/earning",  title: "My Earning",        desc: "Date-range commission, success amount, operator-wise profit.", grad: "from-fuchsia-600 to-purple-700",  icon: <Percent className="h-6 w-6" />,    testId: "report-link-earning" },
    { to: "/recharge/search",   title: "Search Transaction", desc: "Find a recharge by number, TXID or order ID.", grad: "from-amber-500 to-orange-500",    icon: <History className="h-6 w-6" />,    testId: "report-link-search" },
    { to: "",                   title: "Recharge History",  desc: "Full history with status filter.", grad: "from-pink-500 to-rose-600",       icon: <History className="h-6 w-6" />,    testId: "btn-open-history", onClick: onOpen },
    { to: "/wallet",            title: "Wallet",            desc: "Current balance and recent ledger.", grad: "from-emerald-500 to-teal-600",    icon: <Wallet className="h-6 w-6" />,     testId: "report-link-wallet" },
  ];
  return (
    <Card>
      <CardHeader><CardTitle>Reports</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">View your detailed transaction history, daily summaries and downloadable reports.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {reports.map((r) => {
            const inner = (
              <div className={`group cursor-pointer rounded-xl p-4 text-white bg-gradient-to-br ${r.grad} shadow hover:brightness-110 transition flex items-start gap-3`}>
                <div className="bg-white/20 rounded-lg p-2 shrink-0">{r.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-base">{r.title}</div>
                  <div className="text-xs opacity-95 mt-1 line-clamp-2">{r.desc}</div>
                </div>
              </div>
            );
            if (r.onClick) {
              return <button key={r.title} onClick={r.onClick} className="text-left" data-testid={r.testId}>{inner}</button>;
            }
            return <Link key={r.title} href={r.to} data-testid={r.testId}>{inner}</Link>;
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── My Commission view ──────────────────────────────────────────────────────
function CommissionView({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>My Commission</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          You earn commission on every successful recharge. Commission rates depend on your operator tier
          (<span className="font-semibold">Silver</span>, <span className="font-semibold text-amber-600">Gold</span> or <span className="font-semibold text-purple-700">Premium</span>) and the operator.
        </p>
        <ul className="text-sm list-disc pl-5 space-y-1">
          <li>Commission is credited to your wallet automatically when a recharge succeeds.</li>
          <li>Failed or refunded recharges do not earn commission.</li>
          <li>Upgrade to Gold or Premium to unlock higher commission slabs.</li>
        </ul>
        <div className="flex gap-3 pt-2">
          <Button onClick={onUpgrade} data-testid="btn-goto-upgrade"><Crown className="h-4 w-4 mr-2" />View Upgrade Plans</Button>
          <Link href="/recharge/history"><Button variant="outline">View Commission History</Button></Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Upgrade view — Silver / Gold / Premium plan cards ───────────────────────
function UpgradeView({
  currentTier,
  purchasedTier,
  viaPrime,
}: {
  currentTier: OperatorTier;
  purchasedTier: OperatorTier;
  viaPrime: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [busy, setBusy] = useState<OperatorTier | null>(null);

  const plansQ = useQuery({ queryKey: ["operator-membership", "plans"], queryFn: getOperatorMembershipPlans });

  const handleSelect = async (planId: OperatorTier) => {
    if (busy) return;
    // Silver is free — apply directly without checkout page.
    if (planId === "silver") {
      setBusy(planId);
      try {
        await initOperatorMembership(planId);
        await qc.invalidateQueries({ queryKey: ["operator-membership", "status"] });
        toast({ title: "Plan activated", description: "You are now on the Silver plan — lifetime access active." });
      } catch (err: any) {
        toast({ title: "Could not activate Silver", description: err?.message, variant: "destructive" });
      } finally {
        setBusy(null);
      }
      return;
    }
    // Paid plans → go to checkout page (billing details + optional coupon → PhonePe).
    setLocation(`/checkout/operator/${planId}`);
  };

  const planStyle: Record<OperatorTier, { card: string; header: string; btn: string; ring: string }> = {
    silver:  { card: "border-gray-200",       header: "from-gray-100 to-gray-200 text-gray-800",          btn: "bg-gray-700 hover:bg-gray-800",                                          ring: "" },
    gold:    { card: "border-amber-300",      header: "from-amber-400 to-yellow-500 text-white",          btn: "bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-white",  ring: "ring-2 ring-amber-300" },
    premium: { card: "border-purple-400",     header: "from-fuchsia-600 to-purple-700 text-white",        btn: "bg-gradient-to-r from-fuchsia-600 to-purple-700 hover:opacity-90 text-white", ring: "ring-2 ring-purple-400" },
  };

  return (
    <div className="space-y-5">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center justify-center gap-2">
          <Crown className="h-7 w-7 text-amber-500" />
          Upgrade Your Operator Plan
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Pay once, earn higher commissions for life. No monthly fees.
        </p>
        <div className="mt-2 text-xs">
          Current plan:{" "}
          <Badge variant="outline" className={`font-bold ${TIER_BADGE[currentTier].cls}`} data-testid="badge-current-tier">
            {TIER_BADGE[currentTier].label}
            {viaPrime && <span className="ml-1">(via Prime)</span>}
          </Badge>
        </div>
      </div>

      {viaPrime && (
        <Card className="border-2 border-purple-300 bg-gradient-to-r from-purple-50 to-fuchsia-50">
          <CardContent className="p-4 flex items-start gap-3" data-testid="prime-perk-notice">
            <Sparkles className="h-6 w-6 text-purple-700 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-purple-900">Premium recharge benefits are active via your Prime membership.</div>
              <div className="text-purple-800/80 mt-0.5">
                You automatically earn Premium-tier commissions on every recharge as long as your Prime
                membership is active. When Prime expires, you'll go back to your purchased plan
                ({TIER_BADGE[purchasedTier].label}).
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {plansQ.isLoading ? (
        <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4">
          {(plansQ.data ?? []).map((plan: OperatorPlan) => {
            // "Current" badge follows the *purchased* tier (what they actually paid for).
            // The Prime-perk premium is shown via the notice card above, not as "Current"
            // on the Premium card — otherwise users couldn't actually buy Premium for life.
            const isCurrent = plan.id === purchasedTier;
            const style = planStyle[plan.id];
            const isFree = plan.pricePaise === 0;
            return (
              <Card
                key={plan.id}
                className={`overflow-hidden border-2 ${style.card} ${plan.id !== "silver" ? style.ring : ""} ${isCurrent ? "shadow-lg" : ""}`}
                data-testid={`plan-card-${plan.id}`}
              >
                <div className={`bg-gradient-to-br ${style.header} px-4 py-4`}>
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-lg flex items-center gap-2">
                      <Crown className="h-5 w-5" />
                      {plan.name}
                    </div>
                    {isCurrent && (
                      <Badge className="bg-white/30 text-white border-white/50 backdrop-blur-sm">Current</Badge>
                    )}
                  </div>
                  <div className="mt-2">
                    <span className="text-3xl font-extrabold">{isFree ? "Free" : formatINR(plan.pricePaise)}</span>
                    {!isFree && <span className="text-xs opacity-90 ml-1">one-time</span>}
                  </div>
                  <div className="text-xs opacity-90 mt-1">{plan.commissionLabel}</div>
                </div>
                <CardContent className="p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">{plan.tagline}</p>
                  <ul className="space-y-1.5">
                    {plan.features.map((f, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`w-full mt-3 ${style.btn}`}
                    disabled={isCurrent || busy !== null}
                    onClick={() => handleSelect(plan.id)}
                    data-testid={`btn-select-${plan.id}`}
                  >
                    {busy === plan.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    {isCurrent ? "Your Current Plan" : isFree ? "Apply Silver" : `Pay ${formatINR(plan.pricePaise)} via PhonePe`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="bg-gradient-to-r from-purple-50 via-white to-amber-50 border-0">
        <CardContent className="p-4 text-xs text-muted-foreground">
          <strong>Note:</strong> Upgrade is one-time and lifetime — no renewal needed. Payments are processed securely via PhonePe.
          Your tier is applied automatically once payment is confirmed. For billing questions, contact support.
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Support view ────────────────────────────────────────────────────────────

type TicketStatus = "Pending" | "Replied" | "Resolved";

interface TicketRow {
  id: number;
  category: string;
  subject: string | null;
  transactionId: string | null;
  txDate: string | null;
  message: string;
  adminReply: string | null;
  status: TicketStatus;
  createdAt: string;
  repliedAt: string | null;
  resolvedAt: string | null;
}

const TICKET_SUBJECTS: Array<{ subject: string; category: string }> = [
  { subject: "Recharge / Bill failed but money deducted", category: "recharge" },
  { subject: "Wallet top-up not credited",                category: "wallet" },
  { subject: "Money Transfer / DMT issue",                category: "money_transfer" },
  { subject: "KYC / verification issue",                  category: "kyc" },
  { subject: "Commission not credited",                   category: "commission" },
  { subject: "Refund / Other",                            category: "other" },
];

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ticketStatusBadge(status: TicketStatus) {
  if (status === "Pending")
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pending</Badge>;
  if (status === "Replied")
    return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Replied</Badge>;
  return (
    <Badge className="bg-green-100 text-green-800 border-green-200 inline-flex items-center gap-1">
      <CheckCircle2 className="h-3 w-3" />
      Resolved
    </Badge>
  );
}

function SupportView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [subjectIdx, setSubjectIdx] = useState<number>(0);
  const [transactionId, setTransactionId] = useState("");
  const [txDate, setTxDate] = useState<string>(todayIso());
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: tickets, isLoading } = useQuery<TicketRow[]>({
    queryKey: ["support-my"],
    queryFn: () => apiFetch<TicketRow[]>("/api/support/my"),
    enabled: !!user,
    refetchInterval: 30000,
  });

  if (!user) {
    return (
      <Card>
        <CardHeader><CardTitle>Support</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Please log in to raise a ticket and view your ticket history.</p>
          <Button onClick={() => setLocation("/login")}>Login</Button>
        </CardContent>
      </Card>
    );
  }

  const recharge = tickets?.filter((t) =>
    ["recharge", "wallet", "money_transfer", "kyc", "commission", "other"].includes(t.category),
  ) ?? [];

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault();
    const choice = TICKET_SUBJECTS[subjectIdx];
    if (!choice) return;
    const wc = description.trim().split(/\s+/).filter(Boolean).length;
    if (wc < 25) {
      toast({ title: "Description too short", description: `Please write at least 25 words (current: ${wc}).`, variant: "destructive" });
      return;
    }
    if (wc > 300) {
      toast({ title: "Description too long", description: `Please keep it under 300 words (current: ${wc}).`, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/support/submit", {
        method: "POST",
        body: JSON.stringify({
          userName: user!.name ?? user!.email,
          email: user!.email,
          mobile: (user as any).mobile ?? null,
          category: choice.category,
          subject: choice.subject,
          transactionId: transactionId.trim() || null,
          txDate: txDate || null,
          message: description.trim(),
        }),
      });
      toast({ title: "Ticket raised", description: "We'll get back to you shortly." });
      setTransactionId("");
      setDescription("");
      setTxDate(todayIso());
      setSubjectIdx(0);
      queryClient.invalidateQueries({ queryKey: ["support-my"] });
    } catch (err: any) {
      toast({ title: "Could not raise ticket", description: err?.message ?? "Try again later.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Raise a ticket */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" />
            Raise a Ticket
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitTicket} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="ticket-subject" className="text-xs">Subject</Label>
              <select
                id="ticket-subject"
                value={subjectIdx}
                onChange={(e) => setSubjectIdx(Number(e.target.value))}
                className="mt-1 w-full h-10 rounded-md border bg-white px-3 text-sm"
                data-testid="ticket-subject"
              >
                {TICKET_SUBJECTS.map((s, i) => (
                  <option key={s.subject} value={i}>{s.subject}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="ticket-txn" className="text-xs">Transaction ID (optional)</Label>
              <Input
                id="ticket-txn"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="e.g. TXN1234567890"
                maxLength={80}
                className="mt-1"
                data-testid="ticket-txn"
              />
            </div>
            <div>
              <Label htmlFor="ticket-date" className="text-xs">Transaction Date</Label>
              <Input
                id="ticket-date"
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                max={todayIso()}
                className="mt-1"
                data-testid="ticket-date"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ticket-desc" className="text-xs">Description</Label>
              <Textarea
                id="ticket-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue in detail — operator name, amount, what went wrong, etc."
                rows={4}
                maxLength={4000}
                className="mt-1"
                data-testid="ticket-desc"
              />
              {(() => {
                const wc = description.trim().split(/\s+/).filter(Boolean).length;
                const ok = wc >= 25 && wc <= 300;
                const cls = wc === 0 ? "text-muted-foreground" : ok ? "text-green-700" : "text-red-600";
                return (
                  <div className={`text-[11px] mt-1 flex justify-between ${cls}`}>
                    <span>Min 25 words, max 300 words</span>
                    <span>{wc} word{wc === 1 ? "" : "s"}</span>
                  </div>
                );
              })()}
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={submitting} data-testid="btn-submit-ticket">
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Submit Ticket
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Ticket status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            My Tickets
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : recharge.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg bg-gray-50">
              No tickets yet. Use the form above to raise one.
            </div>
          ) : (
            <div className="space-y-3">
              {recharge.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border bg-white p-3 sm:p-4"
                  data-testid={`ticket-row-${t.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-gray-900">
                        {t.subject ?? "(no subject)"}
                      </div>
                      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground mt-1">
                        <span>#{t.id}</span>
                        <span>{new Date(t.createdAt).toLocaleString()}</span>
                        {t.transactionId && <span className="font-mono">Txn: {t.transactionId}</span>}
                        {t.txDate && <span>Date: {new Date(t.txDate).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    {ticketStatusBadge(t.status)}
                  </div>
                  <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{t.message}</p>
                  {t.adminReply && (
                    <div className="mt-3 rounded-md border-l-4 border-blue-400 bg-blue-50 p-3">
                      <div className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">
                        Admin reply{t.repliedAt ? ` · ${new Date(t.repliedAt).toLocaleString()}` : ""}
                      </div>
                      <div className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{t.adminReply}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contact fallback */}
      <Card>
        <CardContent className="py-4 text-sm flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Need direct support?</div>
            <div className="font-semibold">smitcscinfoyt@gmail.com · Mon–Sat, 9 AM–7 PM IST</div>
          </div>
          <Link href="/contact"><Button variant="outline">Contact Page</Button></Link>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Download App view ───────────────────────────────────────────────────────
function DownloadAppView() {
  return (
    <Card>
      <CardHeader><CardTitle>Download Mobile App</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">Our Android app is coming soon. You'll be able to perform recharges, check reports and manage your wallet on the go.</p>
        <div className="flex items-center gap-3 pt-2">
          <SmartphoneIcon className="h-10 w-10 text-purple-600" />
          <div>
            <div className="font-semibold">Smit CSC Info — Operator App</div>
            <div className="text-xs text-muted-foreground">Status: In development</div>
          </div>
        </div>
        <Button disabled className="mt-2"><Download className="h-4 w-4 mr-2" />Coming Soon</Button>
      </CardContent>
    </Card>
  );
}
// ──────────────────────────────────────────────────────────────
// Upgrade Celebration Modal (placed at file end)
// ──────────────────────────────────────────────────────────────
function UpgradeCelebrationModal({
  open, state, tier, error, onClose,
}: {
  open: boolean;
  state: "loading" | "success" | "pending" | "failed";
  tier?: OperatorTier;
  error?: string;
  onClose: () => void;
}) {
  const planLabel = tier === "premium" ? "PREMIUM" : tier === "gold" ? "GOLD" : "";
  const gradient = tier === "premium"
    ? "from-fuchsia-600 via-purple-600 to-indigo-700"
    : "from-amber-400 via-orange-500 to-yellow-600";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-0">
        <AnimatePresence mode="wait">
          {state === "loading" && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="p-10 flex flex-col items-center text-center bg-white">
              <Loader2 className="h-14 w-14 text-indigo-600 animate-spin mb-4" />
              <h2 className="text-xl font-bold mb-1">Confirming Payment...</h2>
              <p className="text-sm text-muted-foreground">Verifying with PhonePe. Please wait a few seconds.</p>
            </motion.div>
          )}

          {state === "success" && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className={`p-8 text-center text-white bg-gradient-to-br ${gradient} relative overflow-hidden`}>
              {/* Confetti dots */}
              {[...Array(14)].map((_, i) => (
                <motion.div key={i}
                  initial={{ y: -20, opacity: 0, scale: 0 }}
                  animate={{ y: [0, 300], opacity: [0, 1, 0], scale: [0, 1, 0.5] }}
                  transition={{ duration: 2.2, delay: i * 0.08, repeat: Infinity, repeatDelay: 1 }}
                  className="absolute w-2 h-2 rounded-full bg-white/80"
                  style={{ left: `${(i * 7) % 100}%`, top: 0 }}
                />
              ))}
              <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 14 }}
                className="h-24 w-24 mx-auto bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mb-5 ring-4 ring-white/40">
                <PartyPopper className="h-12 w-12" />
              </motion.div>
              <motion.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className="text-3xl font-extrabold mb-2">🎉 Congratulations!</motion.h2>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                className="text-lg opacity-95 mb-1">Your <b>{planLabel}</b> plan has been activated!</motion.p>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                className="text-sm opacity-80 mb-6">Enjoy higher commission rates now. Lifetime access.</motion.p>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }}>
                <Button onClick={onClose} className="bg-white text-gray-900 hover:bg-gray-100 font-bold px-8 h-11">
                  Start Earning <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </motion.div>
            </motion.div>
          )}

          {state === "pending" && (
            <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="p-8 text-center bg-white">
              <div className="h-20 w-20 mx-auto bg-amber-100 rounded-full flex items-center justify-center mb-4">
                <Clock className="h-10 w-10 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold mb-2">Payment Pending</h2>
              <p className="text-sm text-muted-foreground mb-6">
                PhonePe confirmation is on the way. Your plan will automatically activate in a few minutes.
              </p>
              <Button onClick={onClose} variant="outline" className="w-full">Close</Button>
            </motion.div>
          )}

          {state === "failed" && (
            <motion.div key="failed" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="p-8 text-center bg-white">
              <div className="h-20 w-20 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
                <XCircle className="h-10 w-10 text-red-600" />
              </div>
              <h2 className="text-xl font-bold mb-2">Verification Failed</h2>
              <p className="text-sm text-muted-foreground mb-6">{error ?? "Please try again."}</p>
              <Button onClick={onClose} variant="outline" className="w-full">Close</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
