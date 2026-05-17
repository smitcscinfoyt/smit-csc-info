import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Loader2, RefreshCw, Printer, Smartphone, Tv, Receipt } from "lucide-react";
import { getRechargeReceipt, pollRechargeStatus, formatINR, type RechargeType, type RechargeStatus } from "@/lib/recharge-api";
import { format } from "date-fns";

const ICONS: Record<RechargeType, any> = { mobile: Smartphone, dth: Tv, bill: Receipt };

export default function RechargeReceipt() {
  const [, params] = useRoute("/recharge/receipt/:id");
  const id = params?.id ?? "";
  const qc = useQueryClient();

  const { data: rec, isLoading } = useQuery({
    queryKey: ["recharge", "receipt", id],
    queryFn: () => getRechargeReceipt(id),
    enabled: !!id,
    refetchInterval: (q) => {
      const r = q.state.data;
      return r && (r.status === "pending" || r.status === "processing") ? 4000 : false;
    },
  });

  const pollMutation = useMutation({
    mutationFn: () => pollRechargeStatus(id),
    onSuccess: (r) => qc.setQueryData(["recharge", "receipt", id], r),
  });

  if (isLoading || !rec) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const StatusIcon = rec.status === "success" ? CheckCircle2 : rec.status === "failed" || rec.status === "refunded" ? XCircle : Clock;
  const colorBorder = rec.status === "success" ? "border-t-green-500" : rec.status === "failed" || rec.status === "refunded" ? "border-t-red-500" : "border-t-amber-500";
  const colorIcon = rec.status === "success" ? "text-green-600" : rec.status === "failed" || rec.status === "refunded" ? "text-red-600" : "text-amber-600";
  const Icon = ICONS[rec.type];

  const STATUS_LBL: Record<RechargeStatus, string> = {
    success: "Success", pending: "Pending", processing: "Processing", failed: "Failed", refunded: "Refunded",
  };

  return (
    <div className="flex-1 py-8 px-4 bg-gray-50">
      <div className="container mx-auto max-w-md print:max-w-full">
        <Link href="/recharge/history"><Button variant="ghost" size="sm" className="mb-4 print:hidden"><ArrowLeft className="h-4 w-4 mr-2" />History</Button></Link>
        <Card className={`shadow-lg border-t-8 ${colorBorder}`}>
          <CardHeader className="text-center pb-2">
            <StatusIcon className={`h-16 w-16 mx-auto ${colorIcon}`} />
            <CardTitle className="text-2xl mt-2">{STATUS_LBL[rec.status]}</CardTitle>
            <div className="text-2xl font-bold mt-1">{formatINR(rec.amount)}</div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-center gap-2 my-3">
              <Icon className="h-5 w-5 text-primary" /><span className="font-semibold">{rec.operatorName}</span>
            </div>
            <Separator />
            <Row label="Number" value={rec.number} />
            <Row label="Transaction ID" value={rec.id.slice(0, 16)} />
            {rec.providerTxnId && <Row label="Operator ID" value={rec.providerTxnId} />}
            <Row label="Date" value={format(new Date(rec.createdAt), "dd MMM yyyy, HH:mm")} />
            {rec.commissionAmount > 0 && <Row label="Commission" value={<span className="text-green-700 font-semibold">+{formatINR(rec.commissionAmount)}</span>} />}
            {rec.failureReason && <div className="bg-red-50 border border-red-200 rounded p-2 text-red-700"><b>Reason:</b> {rec.failureReason}</div>}
            {rec.refundedAt && <div className="bg-blue-50 border border-blue-200 rounded p-2 text-blue-700">Money has been refunded to your wallet.</div>}
            <Separator />

            <div className="flex gap-2 print:hidden">
              {(rec.status === "pending" || rec.status === "processing") && (
                <Button size="sm" variant="outline" className="flex-1" disabled={pollMutation.isPending} onClick={() => pollMutation.mutate()}>
                  {pollMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}Check Status
                </Button>
              )}
              <Button size="sm" variant="outline" className="flex-1" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />Print</Button>
            </div>
            <div className="flex gap-2 print:hidden">
              <Link href="/recharge" className="flex-1"><Button variant="outline" className="w-full">New Recharge</Button></Link>
              <Link href="/wallet" className="flex-1"><Button variant="outline" className="w-full">Wallet</Button></Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return <div className="flex justify-between gap-2"><span className="text-muted-foreground">{label}</span><span className="font-medium text-right break-all">{value}</span></div>;
}
