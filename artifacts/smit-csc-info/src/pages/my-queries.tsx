import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MessageSquare,
  Clock,
  CheckCircle2,
  Loader2,
  Inbox,
  Headphones,
  User2,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

interface MyInquiry {
  id: number;
  category: string;
  message: string;
  adminReply: string | null;
  status: "Pending" | "Replied" | "Resolved";
  createdAt: string;
  resolvedAt: string | null;
  repliedAt?: string | null;
  subject?: string | null;
  transactionId?: string | null;
  txDate?: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical Issue",
  prime: "Prime Membership",
  document: "Document Correction",
  schemes: "Government Schemes",
  recharge: "Recharge / Bill",
  recharge_mobile: "Mobile / DTH recharge",
  recharge_bill: "Bill payment",
  wallet: "Wallet top-up",
  money_transfer: "Money Transfer (DMT)",
  kyc: "KYC",
  commission: "Commission",
  tpin: "T-PIN",
  operator_membership: "Operator Membership",
  payment_phonepe: "PhonePe Payment",
  refund: "Refund",
  coupon: "Coupon",
  tool_pdf_editor: "Tool: PDF Editor",
  tool_esign: "Tool: E-sign PDF",
  tool_watermark: "Tool: Watermark PDF",
  tool_bg_remover: "Tool: Background Remover",
  tool_image_upscaler: "Tool: Image Upscaler",
  tool_id_card: "Tool: ID Card Engine",
  tool_passport: "Tool: Passport Engine",
  tool_prime_studio: "Tool: Prime Studio",
  live_data: "Live Data",
  youtube_pdf: "YouTube / PDF Library",
  account_login: "Login / Signup",
  profile: "Profile Update",
  feedback: "Feedback",
  other: "Other",
};

const SEEN_KEY = "support_last_seen_resolved_at";

export function markSupportSeen(at?: string) {
  try {
    const prev = localStorage.getItem(SEEN_KEY);
    const next = at ?? new Date().toISOString();
    if (!prev || new Date(next) > new Date(prev)) {
      localStorage.setItem(SEEN_KEY, next);
      window.dispatchEvent(new CustomEvent("support:seen"));
    }
  } catch {}
}

export default function MyQueries() {
  const { t } = useLanguage();
  const c = (t.contact as any) ?? {};
  const [active, setActive] = useState<MyInquiry | null>(null);

  const { data, isLoading } = useQuery<MyInquiry[]>({
    queryKey: ["my-inquiries"],
    queryFn: () => apiFetch<MyInquiry[]>("/api/support/my"),
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (data && data.length > 0) {
      const latest = data
        .filter((q) => q.resolvedAt)
        .map((q) => new Date(q.resolvedAt!).getTime())
        .reduce((a, b) => Math.max(a, b), 0);
      if (latest > 0) markSupportSeen(new Date(latest).toISOString());
    }
  }, [data]);

  const pending = data?.filter((q) => q.status === "Pending").length ?? 0;
  const resolved = data?.filter((q) => q.status === "Resolved").length ?? 0;

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <div className="mb-8 flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Headphones className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary" data-testid="my-queries-title">
            {c.historyTitle ?? "My Support History"}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {c.historySubtitle ?? "Track all your inquiries and view team responses"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{c.statTotal ?? "Total queries"}</div>
            <div className="text-2xl font-bold mt-1">{data?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-amber-700">{c.statPending ?? "Pending"}</div>
            <div className="text-2xl font-bold text-amber-700 mt-1">{pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-green-700">{c.statResolved ?? "Resolved"}</div>
            <div className="text-2xl font-bold text-green-700 mt-1">{resolved}</div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Inbox className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="font-semibold text-lg">{c.noQueries ?? "No queries yet"}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {c.noQueriesDesc ?? "When you submit a query through Help & Support, it will appear here."}
            </p>
            <Button asChild className="mt-4">
              <Link href="/help">{c.openHelp ?? "Open Help & Support"}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((q) => (
            <Card
              key={q.id}
              className={
                q.status === "Resolved"
                  ? "border-green-200 hover:shadow-md transition-shadow"
                  : q.status === "Replied"
                  ? "border-blue-200 hover:shadow-md transition-shadow"
                  : "border-amber-200 hover:shadow-md transition-shadow"
              }
              data-testid={`query-row-${q.id}`}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                    q.status === "Resolved"
                      ? "bg-green-100 text-green-700"
                      : q.status === "Replied"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {q.status === "Resolved" ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : q.status === "Replied" ? (
                    <MessageSquare className="h-5 w-5" />
                  ) : (
                    <Clock className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant="outline" className="font-normal">
                      {CATEGORY_LABELS[q.category] ?? q.category}
                    </Badge>
                    {q.status === "Resolved" ? (
                      <Badge className="bg-green-100 text-green-800 border-green-200">
                        Resolved
                      </Badge>
                    ) : q.status === "Replied" ? (
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                        Replied
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                        Pending
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {format(new Date(q.createdAt), "dd MMM yyyy, HH:mm")}
                    </span>
                  </div>
                  {q.subject && (
                    <p className="text-sm font-semibold text-gray-900 mb-0.5">{q.subject}</p>
                  )}
                  <p className="text-sm text-gray-700 line-clamp-2">{q.message}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {q.status !== "Pending" && q.adminReply ? (
                      <Button
                        size="sm"
                        onClick={() => setActive(q)}
                        className="bg-primary"
                        data-testid={`btn-view-solution-${q.id}`}
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        {c.viewSolution ?? "View Solution"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setActive(q)}
                        data-testid={`btn-view-${q.id}`}
                      >
                        {c.viewDetails ?? "View Details"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Query #{active?.id}
            </DialogTitle>
            <DialogDescription>
              {active ? `Submitted on ${format(new Date(active.createdAt), "dd MMM yyyy, HH:mm")}` : ""}
            </DialogDescription>
            {active && (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline">
                  {CATEGORY_LABELS[active.category] ?? active.category}
                </Badge>
              </div>
            )}
          </DialogHeader>
          {active && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <User2 className="h-4 w-4 text-gray-500" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground mb-1">{c.youAsked ?? "You asked"}</div>
                  <div className="bg-gray-50 border rounded-2xl rounded-tl-sm px-4 py-3 whitespace-pre-wrap text-sm text-gray-800">
                    {active.message}
                  </div>
                </div>
              </div>

              {active.adminReply ? (
                <div className="flex gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Headphones className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-primary font-medium mb-1">
                      {c.teamReply ?? "Smit CSC Info Team"}
                      {active.resolvedAt && (
                        <span className="text-muted-foreground font-normal ml-2">
                          · {format(new Date(active.resolvedAt), "dd MMM yyyy, HH:mm")}
                        </span>
                      )}
                    </div>
                    <div className="bg-primary/5 border border-primary/20 rounded-2xl rounded-tl-sm px-4 py-3 whitespace-pre-wrap text-sm text-gray-800">
                      {active.adminReply}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {c.waitingReply ?? "Our team will reply soon. You'll see the response here when it's ready."}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
