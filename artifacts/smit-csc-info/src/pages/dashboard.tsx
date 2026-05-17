import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import {
  CreditCard,
  Crown,
  Sparkles,
  Wand2,
  IdCard,
  Zap,
  FileText,
  MessageSquare,
  CheckCircle2,
  ArrowRight,
  Inbox,
  Headphones,
  PlayCircle,
  Newspaper,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { markSupportSeen } from "@/pages/my-queries";
import { useAuth } from "@/hooks/use-auth";
import { format, isValid } from "date-fns";
import { motion } from "framer-motion";
import { useLanguage } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface MyInquiry {
  id: number;
  status: "Pending" | "Resolved";
  resolvedAt: string | null;
}
interface UserStatus {
  is_prime: boolean;
  hd_credits: number;
  membership_type: string;
  expires_at: string | null;
}
interface Document {
  id: number;
  title: string;
  description: string | null;
  fileUrl: string;
  fileName: string | null;
  fileType: string | null;
  category: string;
}

const SUPPORT_SEEN_KEY = "support_last_seen_resolved_at";

const cardAnim = (i: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay: 0.05 + i * 0.06, ease: [0.22, 1, 0.36, 1] as const },
});

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const d = (t.dashboard as any) ?? {};
  const p = (t as any).premium ?? {};

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });
  type MembershipStatus = {
    isActive: boolean;
    plan?: string;
    expiresAt?: string;
    daysRemaining?: number | null;
    inGracePeriod?: boolean | null;
    gracePeriodDaysLeft?: number | null;
    isExpired?: boolean | null;
    daysSinceExpiry?: number | null;
  };
  const { data: membership } = useQuery<MembershipStatus>({
    queryKey: ["membership-status"],
    queryFn: () => apiFetch<MembershipStatus>("/api/membership/status"),
    refetchInterval: 5 * 60_000,
  });

  const { data: status } = useQuery<UserStatus>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<UserStatus>("/api/user/status"),
    enabled: !!user,
  });
  const { data: inquiries } = useQuery<MyInquiry[]>({
    queryKey: ["my-inquiries"],
    queryFn: () => apiFetch<MyInquiry[]>("/api/support/my"),
    enabled: !!user,
    refetchInterval: 60000,
  });
  const { data: forms } = useQuery<Document[]>({
    queryKey: ["dash-forms"],
    queryFn: () => apiFetch<Document[]>("/api/documents?category=Forms"),
    enabled: !!user,
  });

  const [seenAt, setSeenAt] = useState<string | null>(() => {
    try { return localStorage.getItem(SUPPORT_SEEN_KEY); } catch { return null; }
  });
  useEffect(() => {
    const handler = () => {
      try { setSeenAt(localStorage.getItem(SUPPORT_SEEN_KEY)); } catch {}
    };
    window.addEventListener("support:seen", handler);
    return () => window.removeEventListener("support:seen", handler);
  }, []);

  if (summaryLoading || !summary) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  const isPrime = !!status?.is_prime;
  const hdCredits = status?.hd_credits ?? 0;
  const expiresAtDate = status?.expires_at ? new Date(status.expires_at) : null;
  const expiresAtValid = expiresAtDate && isValid(expiresAtDate);
  const daysToExpiry = expiresAtValid
    ? Math.ceil((expiresAtDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const showRenewBanner =
    isPrime && expiresAtValid && daysToExpiry !== null && daysToExpiry <= 7;
  const pendingInq = inquiries?.filter((q) => q.status === "Pending").length ?? 0;
  const totalInq = inquiries?.length ?? 0;
  const newlyResolved = (inquiries ?? []).filter(
    (q) => q.status === "Resolved" && q.resolvedAt && (!seenAt || new Date(q.resolvedAt) > new Date(seenAt)),
  );

  return (
    <div className="flex-1 px-4 py-6 lg:px-8 lg:py-8 max-w-7xl mx-auto w-full">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-6"
      >
        <h1 className="text-2xl lg:text-3xl font-extrabold text-gray-900">
          {(d.welcome ?? "Welcome back, {name}").replace("{name}", user?.name ?? "")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {d.subtitle ?? "Here's what's happening with your CSC operator account."}
        </p>
      </motion.div>

      {/* Grace period banner — Prime expired but still has access */}
      {membership?.inGracePeriod && expiresAtDate && (
        <Link href="/membership" data-testid="banner-grace">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-orange-400 bg-gradient-to-r from-orange-50 via-red-50 to-yellow-50 p-4 cursor-pointer hover:shadow-lg transition-shadow"
          >
            <div className="h-11 w-11 rounded-full flex items-center justify-center shrink-0 text-white shadow bg-gradient-to-br from-orange-500 to-red-600">
              <Crown className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900 text-sm flex items-center gap-2">
                {(membership.gracePeriodDaysLeft ?? 0) === 0
                  ? "Last day of grace access — renew today!"
                  : (membership.gracePeriodDaysLeft ?? 0) === 1
                    ? "1 day of grace access left — renew now!"
                    : `${membership.gracePeriodDaysLeft ?? 0} days of grace access left`}
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-600 text-white animate-pulse">
                  Urgent
                </span>
              </div>
              <div className="text-xs text-gray-700 mt-0.5">
                Your Prime expired {format(expiresAtDate, "dd MMM")}. Renew to keep all premium benefits.
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-red-700" />
          </motion.div>
        </Link>
      )}

      {/* Expired banner — full access lost */}
      {membership?.isExpired && expiresAtDate && (
        <Link href="/membership" data-testid="banner-expired">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-purple-300 bg-gradient-to-r from-purple-50 via-fuchsia-50 to-white p-4 cursor-pointer hover:shadow-lg transition-shadow"
          >
            <div className="h-11 w-11 rounded-full flex items-center justify-center shrink-0 text-white shadow bg-gradient-to-br from-purple-600 to-fuchsia-600">
              <Crown className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900 text-sm flex items-center gap-2">
                Your Prime membership has expired
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-600 text-white">
                  Reactivate
                </span>
              </div>
              <div className="text-xs text-gray-700 mt-0.5">
                Expired {format(expiresAtDate, "dd MMM yyyy")} · Reactivate to restore documents, videos and HD credits.
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-purple-700" />
          </motion.div>
        </Link>
      )}

      {/* Pre-expiry renewal warning banner (only when active and NOT in grace) */}
      {showRenewBanner && expiresAtDate && !membership?.inGracePeriod && !membership?.isExpired && (
        <Link href="/membership" data-testid="banner-renew">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-4 flex items-center gap-3 rounded-2xl border-2 p-4 cursor-pointer hover:shadow-lg transition-shadow ${
              (daysToExpiry ?? 0) <= 3
                ? "border-red-300 bg-gradient-to-r from-red-50 via-amber-50 to-yellow-50"
                : "border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50"
            }`}
          >
            <div
              className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 text-white shadow ${
                (daysToExpiry ?? 0) <= 3
                  ? "bg-gradient-to-br from-red-500 to-amber-500"
                  : "bg-gradient-to-br from-amber-400 to-yellow-500"
              }`}
            >
              <Crown className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900 text-sm flex items-center gap-2">
                {(daysToExpiry ?? 0) <= 0
                  ? "Your Prime membership has expired"
                  : (daysToExpiry ?? 0) === 1
                    ? "Your Prime expires tomorrow!"
                    : `Your Prime expires in ${daysToExpiry} days`}
                {(daysToExpiry ?? 0) <= 3 && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
                    Renew now
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-700 mt-0.5">
                Expires {format(expiresAtDate, "dd MMM yyyy 'at' HH:mm")} · Tap
                to renew and keep your benefits.
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-amber-700" />
          </motion.div>
        </Link>
      )}

      {/* Status bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatusCard
          i={0}
          label={d.statusMembership ?? "Membership"}
          value={isPrime ? "Prime" : "Free"}
          icon={<Crown className="h-5 w-5" />}
          accent={isPrime ? "gold" : "purple"}
          testId="status-membership"
          extra={
            isPrime && status?.expires_at
              ? `${d.statusValidTill ?? "Valid till"} ${format(new Date(status.expires_at), "dd MMM yyyy")}`
              : !isPrime
              ? d.statusUpgrade ?? "Upgrade to unlock premium"
              : undefined
          }
        />
        <StatusCard
          i={1}
          label={d.statusCredits ?? "HD Credits"}
          value={String(hdCredits)}
          icon={<Sparkles className="h-5 w-5" />}
          accent="gold"
          testId="status-credits"
          extra={isPrime ? d.statusCreditsHint ?? "Renews monthly" : d.statusCreditsLocked ?? "Prime only"}
        />
        <StatusCard
          i={2}
          label={d.statusInquiries ?? "Active Inquiries"}
          value={String(pendingInq)}
          icon={<Inbox className="h-5 w-5" />}
          accent="purple"
          testId="status-inquiries"
          extra={
            totalInq > 0
              ? `${totalInq} ${d.statusInquiriesTotal ?? "total"}`
              : d.statusInquiriesNone ?? "No active queries"
          }
        />
      </div>

      {/* Resolved banner */}
      {newlyResolved.length > 0 && (
        <Link href="/my-queries" data-testid="banner-resolved">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => markSupportSeen()}
            className="flex items-center gap-3 rounded-2xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-4 cursor-pointer hover:shadow-md transition-shadow mb-6"
          >
            <div className="h-10 w-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-green-900 text-sm">
                {newlyResolved.length === 1
                  ? d.bannerOne ?? "Your query has been resolved!"
                  : (d.bannerMany ?? "{count} queries have been resolved!").replace("{count}", String(newlyResolved.length))}
              </div>
              <div className="text-xs text-green-800 mt-0.5">
                {d.bannerSubtitle ?? "Click here to view the solution from our support team."}
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-green-700" />
          </motion.div>
        </Link>
      )}

      {/* Premium Lounge / Upsell */}
      {isPrime ? (
        <motion.section {...cardAnim(0)} className="mb-6" data-testid="premium-lounge-grid">
          <SectionHeading
            title={p.aiToolsTitle ?? "Premium Lounge"}
            subtitle={p.aiToolsSubtitle ?? "Faster, sharper, and unlocked just for you."}
            badge={p.badge ?? "PRIME"}
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <PremiumTile
              i={0}
              icon={<Newspaper className="h-5 w-5" />}
              title={p.schemesTitle ?? "Daily Scheme Updates"}
              desc={p.schemesDesc ?? "Direct links to latest GRs."}
              cta={p.openTool ?? "Open"}
              href="/premium-dashboard"
              available
              testId="tile-schemes"
            />
            <PremiumTile
              i={1}
              icon={<FileText className="h-5 w-5" />}
              title={p.formsCenterTitle ?? "Editable Form Center"}
              desc={p.formsCenterDesc ?? "Word & PDF downloads."}
              cta={p.openTool ?? "Open"}
              href="/premium-dashboard"
              available
              testId="tile-forms"
            />
            <PremiumTile
              i={2}
              icon={<Headphones className="h-5 w-5" />}
              title={p.prioritySupport ?? "Priority WhatsApp"}
              desc={p.prioritySupportDesc ?? "Direct line to our support team."}
              cta={p.openTool ?? "Open"}
              href="/premium-dashboard"
              available
              testId="tile-support"
            />
          </div>
          <div className="mt-3 text-xs text-purple-200/70">
            {p.aiToolsMovedHint ?? "AI tools (HD Background Remover, Image Upscaler, Passport Engine) are now in the All Tools page."}
          </div>
        </motion.section>
      ) : (
        <motion.div
          {...cardAnim(0)}
          className="rounded-2xl bg-gradient-to-br from-[#1a0033] via-[#2d0a4e] to-[#15032b] text-white p-6 lg:p-8 mb-6 relative overflow-hidden"
          data-testid="upsell-banner"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,200,80,0.18),transparent_50%)]" />
          <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="max-w-xl">
              <Badge className="bg-gradient-to-r from-amber-400 to-yellow-500 text-purple-950 mb-3 font-bold">
                <Crown className="h-3 w-3 mr-1" /> {p.navAccess ?? "Premium Access"}
              </Badge>
              <h2 className="text-xl lg:text-2xl font-extrabold bg-gradient-to-r from-amber-200 to-yellow-100 bg-clip-text text-transparent">
                {d.upsellTitle ?? "Unlock Premium AI tools, exclusive content & priority support"}
              </h2>
              <p className="text-sm text-purple-100/70 mt-2">
                {d.upsellDesc ?? "Editable forms, daily scheme alerts, HD background remover and more — for serious operators."}
              </p>
            </div>
            <Link href="/membership">
              <Button
                className="bg-gradient-to-r from-amber-400 to-yellow-500 text-purple-950 font-bold hover:from-amber-300 hover:to-yellow-400 shadow-lg shadow-amber-500/30"
                data-testid="btn-upgrade-prime"
              >
                <Crown className="h-4 w-4 mr-2" />
                {d.upsellCta ?? "Upgrade to Prime"}
              </Button>
            </Link>
          </div>
        </motion.div>
      )}

      {/* Recent Activity & Quick Forms */}
      <div className="grid lg:grid-cols-2 gap-5">
        <motion.div {...cardAnim(0)} data-testid="quick-forms">
          <Card className="rounded-2xl border-purple-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-purple-700" />
                {d.quickForms ?? "Quick Forms"}
              </CardTitle>
              <CardDescription className="text-xs">
                {d.quickFormsDesc ?? "Most used government forms — one click away."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!forms ? (
                <div className="text-sm text-muted-foreground py-3 text-center">
                  {p.loading ?? "Loading..."}
                </div>
              ) : forms.length === 0 ? (
                <div className="text-sm text-muted-foreground py-3 text-center">
                  {d.noForms ?? "No forms available yet."}
                </div>
              ) : (
                forms.slice(0, 5).map((f) => (
                  <a
                    key={f.id}
                    href={isPrime ? f.fileUrl : "/membership"}
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (!isPrime) {
                        e.preventDefault();
                        setLocation("/membership");
                      }
                    }}
                  >
                    <motion.div
                      whileHover={{ x: 3 }}
                      transition={{ type: "spring", stiffness: 400, damping: 22 }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-purple-100 hover:border-purple-300 hover:bg-purple-50/50 transition cursor-pointer"
                      data-testid={`quick-form-${f.id}`}
                    >
                      <div className="h-9 w-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{f.title}</div>
                        {f.description && (
                          <div className="text-xs text-muted-foreground truncate">{f.description}</div>
                        )}
                      </div>
                      {!isPrime ? (
                        <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px]">
                          PRO
                        </Badge>
                      ) : (
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </motion.div>
                  </a>
                ))
              )}
              <Link href="/documents">
                <Button variant="ghost" className="w-full text-purple-700 hover:bg-purple-50" data-testid="btn-all-documents">
                  {d.viewAllForms ?? "View all documents"} <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...cardAnim(1)} data-testid="recent-activity">
          <Card className="rounded-2xl border-purple-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-purple-700" />
                {d.recentActivity ?? "Recent Activity"}
              </CardTitle>
              <CardDescription className="text-xs">
                {d.recentActivityDesc ?? "Your latest payments and inquiries."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {summary.recentPayments.length === 0 && totalInq === 0 ? (
                <div className="text-sm text-muted-foreground py-3 text-center">
                  {d.noActivity ?? "No recent activity yet."}
                </div>
              ) : (
                <>
                  {summary.recentPayments.slice(0, 3).map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/40"
                    >
                      <div className="h-9 w-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                        <CreditCard className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{payment.plan}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(payment.createdAt), "dd MMM yyyy")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sm">₹{payment.amount}</div>
                        <div
                          className={`text-[10px] font-semibold uppercase ${
                            payment.status === "SUCCESS" || payment.status === "success"
                              ? "text-green-600"
                              : "text-amber-600"
                          }`}
                        >
                          {payment.status}
                        </div>
                      </div>
                    </div>
                  ))}
                  {totalInq > 0 && (
                    <Link href="/my-queries">
                      <div className="flex items-center gap-3 p-3 rounded-xl border border-purple-100 hover:border-purple-300 hover:bg-purple-50/50 transition cursor-pointer">
                        <div className="h-9 w-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                          <MessageSquare className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{d.supportHistory ?? "Support history"}</div>
                          <div className="text-xs text-muted-foreground">
                            {totalInq} {d.queriesTotal ?? "queries"} · {pendingInq} {d.queriesPending ?? "pending"}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function SectionHeading({ title, subtitle, badge }: { title: string; subtitle: string; badge?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-lg lg:text-xl font-bold text-gray-900 flex items-center gap-2">
          {title}
          {badge && (
            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-gradient-to-r from-amber-400 to-yellow-500 text-purple-950">
              {badge}
            </span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function StatusCard({
  i,
  label,
  value,
  icon,
  accent,
  extra,
  testId,
}: {
  i: number;
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: "gold" | "purple";
  extra?: string;
  testId?: string;
}) {
  const ring =
    accent === "gold"
      ? "from-amber-300 to-yellow-500 text-purple-950"
      : "from-purple-600 to-indigo-700 text-white";
  return (
    <motion.div {...cardAnim(i)}>
      <Card
        className="rounded-2xl border-purple-100 hover:shadow-lg hover:shadow-purple-100/50 transition-shadow"
        data-testid={testId}
      >
        <CardContent className="p-4 flex items-center gap-3">
          <div
            className={`h-11 w-11 rounded-xl bg-gradient-to-br ${ring} flex items-center justify-center shadow-md`}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">
              {label}
            </div>
            <div className="text-xl font-extrabold text-gray-900 leading-tight">{value}</div>
            {extra && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{extra}</div>}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function PremiumTile({
  i,
  icon,
  title,
  desc,
  cta,
  href,
  available,
  testId,
}: {
  i: number;
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
  href?: string;
  available?: boolean;
  testId?: string;
}) {
  const inner = (
    <Card
      className={`rounded-2xl border-purple-100 hover:border-amber-300/60 hover:shadow-lg transition group h-full ${
        !available ? "opacity-90" : ""
      }`}
      data-testid={testId}
    >
      <CardContent className="p-5 flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-gray-900">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{desc}</div>
          <div
            className={`inline-flex items-center gap-1 text-xs font-bold mt-2 ${
              available ? "text-purple-700" : "text-gray-400"
            }`}
          >
            {cta} {available && <ArrowRight className="h-3.5 w-3.5" />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return (
    <motion.div {...cardAnim(i)}>
      {available && href ? <Link href={href}>{inner}</Link> : inner}
    </motion.div>
  );
}
