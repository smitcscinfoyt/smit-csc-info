import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Loader2, RefreshCw, Printer, Smartphone, Tv, Receipt, Share2 } from "lucide-react";
import { getRechargeReceipt, pollRechargeStatus, formatINR, type RechargeType, type RechargeStatus } from "@/lib/recharge-api";
import { format } from "date-fns";
import html2canvas from "html2canvas";

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
        /* Keep the complete receipt together on one A4 page. The old A5 rule
           was ignored by some Android Chrome versions and left the footer on
           page 2. */
        @page { size: A4 portrait; margin: 5mm; }
        html, body {
          background: #fff !important;
          margin: 0 !important;
          padding: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body * { visibility: hidden !important; }
        #print-receipt, #print-receipt * { visibility: visible !important; }
        #print-receipt {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 113.64% !important;
          max-width: none !important;
          margin: 0 !important;
          zoom: 0.88;
          box-shadow: none !important;
          overflow: visible !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        #print-receipt .receipt-card-content {
          padding: 14px !important;
        }
        #print-receipt .receipt-card-content > :not([hidden]) ~ :not([hidden]) {
          margin-top: 10px !important;
        }
        #print-receipt .receipt-details > :not([hidden]) ~ :not([hidden]) {
          margin-top: 4px !important;
        }
        #print-receipt .receipt-header { padding-bottom: 8px !important; }
        #print-receipt .receipt-status-icon { width: 44px !important; height: 44px !important; }
        #print-receipt .receipt-amount { font-size: 28px !important; }
        #print-receipt .receipt-footer { font-size: 9px !important; line-height: 1.25 !important; }
        #print-receipt .no-print { display: none !important; }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById("receipt-print-styles")?.remove(); };
  }, []);

  const [isSharing, setIsSharing] = useState(false);

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
    const receipt = document.getElementById("print-receipt");
    if (!receipt || isSharing) return;

    setIsSharing(true);
    try {
      const canvas = await html2canvas(receipt, {
        backgroundColor: "#ffffff",
        scale: Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)),
        logging: false,
        useCORS: true,
        onclone: (clonedDocument) => {
          clonedDocument.querySelectorAll(".no-print").forEach((node) => {
            (node as HTMLElement).style.display = "none";
          });
        },
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
      if (!blob) throw new Error("Could not create receipt image");

      const file = new File([blob], `smit-csc-receipt-${rec.id}.png`, { type: "image/png" });
      const shareData: ShareData = { title: "Smit CSC Info Receipt", files: [file] };
      const canShareFile = typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });

      if (typeof navigator.share === "function" && canShareFile) {
        // Sharing a File makes Android/iOS share the receipt as an image,
        // rather than opening the old text-only share sheet.
        await navigator.share(shareData);
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        alert("Receipt PNG downloaded. You can share this image with the customer.");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Receipt image share failed", error);
        alert("Receipt image could not be prepared. Please try again.");
      }
    } finally {
      setIsSharing(false);
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
          <CardContent className="p-5 space-y-4 receipt-card-content">
            {/* ── Brand header ── */}
            <div className="text-center border-b pb-3 receipt-header">
              <div className="text-lg font-bold text-indigo-700">Smit CSC Info</div>
              <div className="text-[11px] text-gray-500">Digital Service Center · Gujarat</div>
              <div className="text-[10px] text-gray-400 mt-0.5">smitcscinfo.com</div>
            </div>

            {/* ── Status block ── */}
            <div className="text-center receipt-status">
              <StatusIcon className={`h-14 w-14 mx-auto receipt-status-icon ${colorIcon}`} />
              <div className="text-xl font-bold mt-1">{STATUS_LBL[rec.status]}</div>
              <div className="text-3xl font-extrabold mt-1 receipt-amount">{formatINR(rec.amount)}</div>
              <div className="flex items-center justify-center gap-1.5 mt-2 text-sm">
                <Icon className="h-4 w-4 text-primary" />
                <span className="font-semibold">{rec.operatorName}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-600">{SERVICE_LBL[rec.type]}</span>
              </div>
            </div>

            <Separator />

            {/* ── Payment details ── */}
            <div className="space-y-2 text-sm receipt-details">
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
            <div className="text-center text-[10px] text-gray-500 leading-relaxed receipt-footer">
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
                <Button size="sm" variant="outline" className="flex-1" disabled={isSharing} onClick={handleShare}>
                  {isSharing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Share2 className="h-4 w-4 mr-2" />}
                  {isSharing ? "Preparing…" : "Share Image"}
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
