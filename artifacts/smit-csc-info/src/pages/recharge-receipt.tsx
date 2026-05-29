import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Loader2, RefreshCw, Printer, Smartphone, Tv, Receipt, Share2 } from "lucide-react";
import { getRechargeReceipt, pollRechargeStatus, formatINR, type RechargeType, type RechargeStatus } from "@/lib/recharge-api";
import { format } from "date-fns";

const ICONS: Record<RechargeType, any> = { mobile: Smartphone, dth: Tv, bill: Receipt };

export default function RechargeReceipt() {
  const [, params] = useRoute("/recharge/receipt/:id");
  const id = params?.id ?? "";
  const qc = useQueryClient();

  // Inject print-only CSS that hides ALL site chrome (header, nav, footer, chat)
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "receipt-print-styles";
    style.innerHTML = `
      @media print {
        @page { size: A5 portrait; margin: 8mm; }
        html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
        body * { visibility: hidden !important; }
        #print-receipt, #print-receipt * { visibility: visible !important; }
        #print-receipt { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById("receipt-print-styles")?.remove(); };
  }, []);

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

  if (isLoading || !rec) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const StatusIcon = rec.status === "success" ? CheckCircle2 : (rec.status === "failed" || rec.status === "refunded") ? XCircle : Clock;
  const colorBorder = rec.status === "success" ? "border-t-green-500" : (rec.status === "failed" || rec.status === "refunded") ? "border-t-red-500" : "border-t-amber-500";
  const colorIcon = rec.status === "success" ? "text-green-600" : (rec.status === "failed" || rec.status === "refunded") ? "text-red-600" : "text-amber-600";
  const Icon = ICONS[rec.type];

  const STATUS_LBL: Record<RechargeStatus, string> = {
    success: "Successful", pending: "Pending", processing: "Processing", failed: "Failed", refunded: "Refunded",
  };
  const SERVICE_LBL: Record<RechargeType, string> = { mobile: "Mobile Recharge", dth: "DTH Recharge", bill: "Bill Payment" };

  const handleShare = async () => {
    const text = `Smit CSC Info — ${SERVICE_LBL[rec.type]} Receipt\n` +
      `Status: ${STATUS_LBL[rec.status]}\n` +
      `Amount: ₹${(rec.amount / 100).toFixed(2)}\n` +
      `Operator: ${rec.operatorName}\n` +
      `Number: ${rec.number}\n` +
      `Txn ID: ${String(rec.id).slice(0, 20)}\n` +
      `Date: ${format(new Date(rec.createdAt), "dd MMM yyyy, HH:mm")}\n` +
      `Receipt: https://smitcscinfo.com/recharge/receipt/${rec.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Recharge Receipt", text }); } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      alert("Receipt copied!");
    }
  };

  return (
    <div className="flex-1 py-8 px-4 bg-gray-50">
      <div className="container mx-auto max-w-md">
        <Link href="/recharge/history">
          <Button variant="ghost" size="sm" className="mb-4 no-print">
            <ArrowLeft className="h-4 w-4 mr-2" />History
          </Button>
        </Link>

        <Card id="print-receipt" className={`shadow-lg border-t-8 ${colorBorder} bg-white`}>
          <CardContent className="p-5 space-y-4">
            {/* ── Brand header ── */}
            <div className="text-center border-b pb-3">
              <div className="text-lg font-bold text-indigo-700">Smit CSC Info</div>
              <div className="text-[11px] text-gray-500">Digital Service Center · Gujarat</div>
              <div className="text-[10px] text-gray-400 mt-0.5">smitcscinfo.com</div>
            </div>

            {/* ── Status block ── */}
            <div className="text-center">
              <StatusIcon className={`h-14 w-14 mx-auto ${colorIcon}`} />
              <div className="text-xl font-bold mt-1">{STATUS_LBL[rec.status]}</div>
              <div className="text-3xl font-extrabold mt-1">{formatINR(rec.amount)}</div>
              <div className="flex items-center justify-center gap-1.5 mt-2 text-sm">
                <Icon className="h-4 w-4 text-primary" />
                <span className="font-semibold">{rec.operatorName}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-600">{SERVICE_LBL[rec.type]}</span>
              </div>
            </div>

            <Separator />

            {/* ── Payment details ── */}
            <div className="space-y-2 text-sm">
              <Row label="Mobile / Number" value={rec.number} />
              <Row label="Service" value={SERVICE_LBL[rec.type]} />
              <Row label="Operator" value={rec.operatorName} />
              <Row label="Amount" value={<span className="font-semibold">{formatINR(rec.amount)}</span>} />
              {rec.commissionAmount > 0 && (
                <Row label="Your Commission" value={<span className="text-green-700 font-semibold">+{formatINR(rec.commissionAmount)}</span>} />
              )}
              <Row label="Status" value={<span className="font-semibold">{STATUS_LBL[rec.status]}</span>} />
              <Row label="Transaction ID" value={<span className="font-mono text-xs">{String(rec.id).slice(0, 24)}</span>} />
              {rec.providerTxnId && (
                <Row label="Operator Ref" value={<span className="font-mono text-xs">{rec.providerTxnId}</span>} />
              )}
              <Row label="Date & Time" value={format(new Date(rec.createdAt), "dd MMM yyyy, HH:mm")} />
            </div>

            {/* ── Status banners ── */}
            {rec.failureReason && (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                <b>Reason:</b> {rec.failureReason}
              </div>
            )}
            {rec.refundedAt && (
              <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-700">
                ₹{(rec.amount / 100).toFixed(2)} refunded to wallet on {format(new Date(rec.refundedAt), "dd MMM yyyy, HH:mm")}.
              </div>
            )}
            {rec.status === "success" && (
              <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-700 text-center">
                ✓ Recharge completed successfully. Thank you!
              </div>
            )}

            <Separator />

            {/* ── Footer (visible on print too) ── */}
            <div className="text-center text-[10px] text-gray-500 leading-relaxed">
              This is a system-generated receipt.<br/>
              For support: smitcscinfo.com · Mon–Sat, 10 AM – 6 PM<br/>
              <span className="text-gray-400">© Smit CSC Info · Gujarat, India</span>
            </div>

            {/* ── Action buttons (hidden on print) ── */}
            <div className="space-y-2 no-print">
              <div className="flex gap-2">
                {(rec.status === "pending" || rec.status === "processing") && (
                  <Button size="sm" variant="outline" className="flex-1" disabled={pollMutation.isPending} onClick={() => pollMutation.mutate()}>
                    {pollMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Check Status
                  </Button>
                )}
                <Button size="sm" variant="outline" className="flex-1" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-2" />Print / PDF
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={handleShare}>
                  <Share2 className="h-4 w-4 mr-2" />Share
                </Button>
              </div>
              {(rec.status === "failed" || rec.status === "refunded") && (
                <Link
                  href={(() => {
                    const page = rec.type === "mobile" ? "mobile" : rec.type === "dth" ? "dth" : "bill";
                    const amt = Math.round(rec.amount / 100);
                    return "/recharge/" + page + "?retry=1&op=" + encodeURIComponent(rec.operatorCode) + "&num=" + encodeURIComponent(rec.number) + "&amt=" + amt;
                  })()}
                  className="block w-full"
                >
                  <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry — Same Details
                  </Button>
                </Link>
              )}
              <div className="flex gap-2">
                <Link href="/recharge" className="flex-1"><Button variant="outline" className="w-full">New Recharge</Button></Link>
                <Link href="/wallet" className="flex-1"><Button variant="outline" className="w-full">Wallet</Button></Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between gap-2 items-start">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-right break-all">{value}</span>
    </div>
  );
}
