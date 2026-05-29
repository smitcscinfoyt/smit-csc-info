import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Smartphone, Tv, Receipt, Loader2, Eye, RotateCcw } from "lucide-react";
import { getRechargeHistory, formatINR, type RechargeStatus, type RechargeType } from "@/lib/recharge-api";
import { saveDraft } from "@/lib/draft-store";
import { format } from "date-fns";

const ICONS: Record<RechargeType, any> = { mobile: Smartphone, dth: Tv, bill: Receipt };
const STATUS_COLORS: Record<RechargeStatus, string> = {
  success: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-800",
};
const STATUS_LBL: Record<RechargeStatus, string> = {
  success: "Success", pending: "Pending", processing: "Processing", failed: "Failed", refunded: "Refunded",
};

/** Map a history record's type to the form route and draft-store category key. */
function retryRoute(type: RechargeType): { path: string; draftCategory: string } {
  if (type === "mobile") return { path: "/recharge/mobile", draftCategory: "mobile" };
  if (type === "dth")    return { path: "/recharge/dth",    draftCategory: "dth" };
  return                        { path: "/recharge/bill",   draftCategory: "electricity" };
}

export default function RechargeHistory() {
  const [status, setStatus] = useState<string>("");
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery({
    queryKey: ["recharge", "history", status],
    queryFn: () => getRechargeHistory(50, 0, status || undefined),
  });

  function handleRetry(r: {
    type: RechargeType;
    operatorCode: string;
    number: string;
    amount: number;
    circleCode?: string | null;
  }) {
    const { path, draftCategory } = retryRoute(r.type);
    saveDraft(`recharge-form:${draftCategory}`, {
      number: r.number,
      amount: String(Math.round(r.amount / 100)),
      operatorCode: r.operatorCode,
      circleCode: r.circleCode ?? "",
    });
    navigate(path);
  }

  return (
    <div className="flex-1 py-8 px-4 bg-gray-50">
      <div className="container mx-auto max-w-3xl space-y-4">
        <Link href="/recharge"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Recharge</Button></Link>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle>Recharge History</CardTitle>
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div> :
              !data || data.items.length === 0 ? <div className="text-center py-12 text-muted-foreground">No recharges yet</div> : (
                <div className="divide-y">
                  {data.items.map((r) => {
                    const Icon = ICONS[r.type];
                    const canRetry = r.status === "failed" || r.status === "refunded";
                    return (
                      <div key={r.id} className="py-3 flex items-center gap-3" data-testid={`recharge-${r.id}`}>
                        <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-purple-700" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{r.operatorName}</span>
                            <Badge className={STATUS_COLORS[r.status]}>{STATUS_LBL[r.status]}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground truncate">{r.number} • {format(new Date(r.createdAt), "dd MMM, HH:mm")}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold">{formatINR(r.amount)}</div>
                          {r.commissionAmount > 0 && <div className="text-xs text-green-700">+{formatINR(r.commissionAmount)}</div>}
                        </div>
                        {canRetry && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 text-orange-600 border-orange-300 hover:bg-orange-50"
                            title="Retry this recharge"
                            onClick={() => handleRetry(r)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        <Link href={`/recharge/receipt/${r.id}`}><Button size="sm" variant="ghost"><Eye className="h-4 w-4" /></Button></Link>
                      </div>
                    );
                  })}
                </div>
              )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
