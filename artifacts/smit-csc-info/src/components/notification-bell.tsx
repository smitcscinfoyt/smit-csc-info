import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, CheckCircle2, Inbox, Sparkles, Crown, AlertTriangle } from "lucide-react";
import { format, isValid } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { markSupportSeen } from "@/pages/my-queries";

interface MyInquiry {
  id: number;
  category: string;
  message: string;
  adminReply: string | null;
  status: "Pending" | "Resolved";
  createdAt: string;
  resolvedAt: string | null;
}

const DISMISSED_KEY = "support_dismissed_notif_ids";

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical Issue",
  prime: "Prime Membership",
  document: "Document Correction",
  schemes: "Government Schemes",
  other: "Other",
};

function loadDismissed(): Set<number> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((n) => typeof n === "number") : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<number>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(set)));
    window.dispatchEvent(new CustomEvent("support:dismissed"));
  } catch {}
}

export function NotificationBell({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  const { data } = useQuery<MyInquiry[]>({
    queryKey: ["my-inquiries"],
    queryFn: () => apiFetch<MyInquiry[]>("/api/support/my"),
    enabled: !!user,
    refetchInterval: 60000,
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
    hasEverBeenPrime?: boolean | null;
  };
  const { data: membership } = useQuery<MembershipStatus>({
    queryKey: ["membership-status"],
    queryFn: () => apiFetch<MembershipStatus>("/api/membership/status"),
    enabled: !!user,
    refetchInterval: 5 * 60_000,
  });

  const [dismissed, setDismissed] = useState<Set<number>>(() => loadDismissed());

  useEffect(() => {
    const handler = () => setDismissed(loadDismissed());
    window.addEventListener("support:dismissed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("support:dismissed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const dismissOne = useCallback((id: number) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }, []);

  if (!user) return null;

  const resolved = (data ?? [])
    .filter((q) => q.status === "Resolved" && q.adminReply && q.resolvedAt)
    .sort(
      (a, b) =>
        new Date(b.resolvedAt!).getTime() - new Date(a.resolvedAt!).getTime(),
    );

  const visible = resolved.filter((q) => !dismissed.has(q.id));

  // Synthetic, non-dismissible Prime status warnings.
  const daysLeft =
    typeof membership?.daysRemaining === "number" &&
    Number.isFinite(membership.daysRemaining)
      ? Math.max(0, membership.daysRemaining)
      : null;
  const expiryDate = membership?.expiresAt
    ? new Date(membership.expiresAt)
    : null;
  const expiryDateValid = !!expiryDate && isValid(expiryDate);

  const inGrace = !!membership?.inGracePeriod;
  const isExpired = !!membership?.isExpired;
  const showExpiry =
    !!membership?.isActive && !inGrace && daysLeft !== null && daysLeft <= 3;
  const showGrace = inGrace;
  const showExpired = isExpired;
  const graceDaysLeft =
    typeof membership?.gracePeriodDaysLeft === "number" &&
    Number.isFinite(membership.gracePeriodDaysLeft)
      ? Math.max(0, membership.gracePeriodDaysLeft)
      : null;

  const synthCount = (showExpiry ? 1 : 0) + (showGrace ? 1 : 0) + (showExpired ? 1 : 0);
  const unreadCount = visible.length + synthCount;
  const isDark = variant === "dark";

  const handleItemClick = (q: MyInquiry) => {
    dismissOne(q.id);
    if (q.resolvedAt) markSupportSeen(q.resolvedAt);
    setOpen(false);
    setLocation("/my-queries");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          data-testid="btn-notifications"
          className={`relative h-9 w-9 rounded-full flex items-center justify-center transition-colors ${
            isDark
              ? "bg-white/10 text-amber-200 hover:bg-white/20 ring-1 ring-amber-300/30"
              : "bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-purple-700 ring-1 ring-gray-200"
          }`}
        >
          <Bell className="h-4 w-4" strokeWidth={2.2} />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-red-500 text-white shadow ring-2 ring-white"
              data-testid="notification-badge"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[340px] p-0 overflow-hidden"
        data-testid="notification-panel"
      >
        <div className="px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-amber-50/50 flex items-center justify-between">
          <div>
            <div className="font-bold text-sm text-purple-900 flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" />
              Notifications
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              Replies from our support team
            </div>
          </div>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold uppercase tracking-wide bg-red-500 text-white px-2 py-0.5 rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>

        <div className="max-h-[360px] overflow-y-auto">
          {showExpiry && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setLocation("/membership");
              }}
              className="w-full text-left px-4 py-3 cursor-pointer transition-colors bg-gradient-to-r from-red-50 to-amber-50 hover:from-red-100 hover:to-amber-100 border-b border-red-100"
              data-testid="notif-item-expiry"
            >
              <div className="flex items-start gap-2.5">
                <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-amber-400 to-red-500 text-white flex items-center justify-center shadow">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">
                      Prime Expiring Soon
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  </div>
                  <div className="text-sm font-bold text-gray-900 line-clamp-1 flex items-center gap-1">
                    <Crown className="h-3.5 w-3.5 text-amber-500" />
                    {daysLeft === 0
                      ? "Your Prime expires today!"
                      : daysLeft === 1
                        ? "Your Prime expires tomorrow!"
                        : `Only ${daysLeft} days left on your Prime plan`}
                  </div>
                  <div className="text-xs text-gray-700 mt-0.5">
                    Renew now to keep enjoying all premium benefits without interruption.
                  </div>
                  {expiryDateValid && (
                    <div className="text-[10px] text-red-600 font-semibold mt-1">
                      Expires:{" "}
                      {format(expiryDate as Date, "dd MMM yyyy, HH:mm")}
                    </div>
                  )}
                  <div className="text-[11px] font-bold text-purple-700 mt-1.5 inline-flex items-center gap-1">
                    Tap to renew →
                  </div>
                </div>
              </div>
            </button>
          )}

          {showGrace && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setLocation("/membership");
              }}
              className="w-full text-left px-4 py-3 cursor-pointer transition-colors bg-gradient-to-r from-orange-50 to-red-50 hover:from-orange-100 hover:to-red-100 border-b border-orange-100"
              data-testid="notif-item-grace"
            >
              <div className="flex items-start gap-2.5">
                <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center shadow">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">
                      Prime Expired — Grace Period
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  </div>
                  <div className="text-sm font-bold text-gray-900 line-clamp-1 flex items-center gap-1">
                    <Crown className="h-3.5 w-3.5 text-amber-500" />
                    {graceDaysLeft === 0
                      ? "Last day of grace access!"
                      : graceDaysLeft === 1
                        ? "1 day of grace access left"
                        : `${graceDaysLeft ?? ""} days of grace access left`}
                  </div>
                  <div className="text-xs text-gray-700 mt-0.5">
                    Your Prime expired but you still have temporary access. Renew now to avoid losing benefits.
                  </div>
                  <div className="text-[11px] font-bold text-red-700 mt-1.5 inline-flex items-center gap-1">
                    Tap to renew →
                  </div>
                </div>
              </div>
            </button>
          )}

          {showExpired && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setLocation("/membership");
              }}
              className="w-full text-left px-4 py-3 cursor-pointer transition-colors bg-gradient-to-r from-gray-50 to-purple-50 hover:from-gray-100 hover:to-purple-100 border-b border-gray-200"
              data-testid="notif-item-expired"
            >
              <div className="flex items-start gap-2.5">
                <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-gray-600 to-purple-700 text-white flex items-center justify-center shadow">
                  <Crown className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                      Prime Expired
                    </span>
                  </div>
                  <div className="text-sm font-bold text-gray-900 line-clamp-1">
                    Reactivate your Prime membership
                  </div>
                  <div className="text-xs text-gray-700 mt-0.5">
                    Welcome back! Restore full access to documents, videos and HD credits.
                  </div>
                  <div className="text-[11px] font-bold text-purple-700 mt-1.5 inline-flex items-center gap-1">
                    Tap to reactivate →
                  </div>
                </div>
              </div>
            </button>
          )}

          {visible.length === 0 && !showExpiry && !showGrace && !showExpired ? (
            <div className="px-6 py-10 text-center">
              <Inbox className="h-9 w-9 mx-auto text-gray-300 mb-2" />
              <div className="text-sm font-semibold text-gray-700">
                No new notifications
              </div>
              <div className="text-xs text-gray-500 mt-1">
                When our team replies to your queries, you'll see them here.
              </div>
            </div>
          ) : (
            <ul className="divide-y">
              {visible.slice(0, 8).map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(q)}
                    className="w-full text-left px-4 py-3 cursor-pointer transition-colors hover:bg-purple-50/60 bg-amber-50/40"
                    data-testid={`notif-item-${q.id}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="h-8 w-8 shrink-0 rounded-full bg-green-100 text-green-700 flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                            {CATEGORY_LABELS[q.category] ?? q.category}
                          </span>
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        </div>
                        <div className="text-sm font-semibold text-gray-900 line-clamp-1">
                          <Sparkles className="inline h-3 w-3 text-amber-500 mr-1" />
                          Team replied to your query
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                          {q.adminReply}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1">
                          {format(
                            new Date(q.resolvedAt!),
                            "dd MMM yyyy, HH:mm",
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-2.5 border-t bg-gray-50/60">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setLocation("/my-queries");
            }}
            className="w-full text-xs font-semibold text-purple-700 hover:text-purple-900 cursor-pointer text-center"
            data-testid="link-view-all-queries"
          >
            View all queries →
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
