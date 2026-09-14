import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  Printer,
  Smartphone,
  Tv,
  Receipt,
  Share2,
} from "lucide-react";
import {
  getRechargeReceipt,
  pollRechargeStatus,
  formatINR,
  type RechargeType,
  type RechargeStatus,
  type RechargeRecord,
} from "@/lib/recharge-api";
import { format } from "date-fns";
import html2canvas from "html2canvas";

const ICONS: Record<RechargeType, any> = { mobile: Smartphone, dth: Tv, bill: Receipt };

const STATUS_LBL: Record<RechargeStatus, string> = {
  success: "Successful",
  pending: "Pending",
  processing: "Processing",
  failed: "Failed",
  refunded: "Refunded",
};

const SERVICE_LBL: Record<RechargeType, string> = {
  mobile: "Mobile Recharge",
  dth: "DTH Recharge",
  bill: "Bill Payment",
};

function serviceLabel(type: RechargeType) {
  return SERVICE_LBL[type] ?? "Bill Payment";
}

function numberLabel(type: RechargeType) {
  if (type === "mobile") return "Mobile Number";
  if (type === "dth") return "Subscriber Number";
  return "Consumer / Account No.";
}

function receiptDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "dd MMM yyyy, HH:mm");
}

function escapeHtml(value: unknown) {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shareStageMarkup(rec: RechargeRecord) {
  const status = STATUS_LBL[rec.status];
  const service = serviceLabel(rec.type);
  const rows = [
    [numberLabel(rec.type), rec.number],
    ["Service", service],
    ["Operator / Biller", rec.operatorName],
    ["Amount", formatINR(rec.amount)],
    ...(rec.commissionAmount > 0 ? [["Commission", `+${formatINR(rec.commissionAmount)}`]] : []),
    ["Status", status],
    ["Transaction ID", rec.id],
    ...(rec.providerTxnId ? [["Operator Reference", rec.providerTxnId]] : []),
    ["Date & Time", receiptDate(rec.createdAt)],
  ];

  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = [
    "position:absolute",
    "left:-10000px",
    "top:0",
    "width:900px",
    "box-sizing:border-box",
    "padding:44px",
    "background:#eef3f8",
    "font-family:Arial,Helvetica,sans-serif",
    "color:#142033",
    "line-height:1.4",
  ].join(";");

  root.innerHTML = `
    <div style="overflow:hidden;border:1px solid #d7e0ea;border-radius:30px;background:#fff;box-shadow:0 18px 50px rgba(20,32,51,.12)">
      <div style="height:14px;background:linear-gradient(90deg,#0b8f67,#15b77e,#f2b544)"></div>
      <div style="padding:38px 42px 34px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:24px;padding-bottom:28px;border-bottom:1px solid #e5eaf0">
          <div style="display:flex;align-items:center;gap:20px">
            <img src="/logo.png" alt="" style="width:78px;height:78px;border-radius:22px;object-fit:contain;border:1px solid #e1e8ef;background:#fff" />
            <div>
              <div style="font-size:29px;font-weight:800;letter-spacing:-.6px;color:#12264a">Smit CSC Info</div>
              <div style="margin-top:5px;font-size:16px;color:#536275">Digital Service Center · Gujarat</div>
              <div style="margin-top:3px;font-size:14px;color:#8190a2">smitcscinfo.com</div>
            </div>
          </div>
          <div style="padding:10px 16px;border-radius:999px;background:#eefbf6;color:#087451;font-size:14px;font-weight:700;white-space:nowrap">PAYMENT RECEIPT</div>
        </div>

        <div style="padding:34px 0 30px;text-align:center">
          <div style="margin:0 auto 14px;width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#e8faf3;border:2px solid #0aa873;color:#07825a;font-size:36px;font-weight:700">✓</div>
          <div style="font-size:26px;font-weight:800;color:#13213a">${escapeHtml(status)}</div>
          <div style="margin-top:8px;font-size:46px;line-height:1;font-weight:800;letter-spacing:-1.5px;color:#0c1830">${escapeHtml(formatINR(rec.amount))}</div>
          <div style="margin-top:15px;font-size:17px;color:#516175"><strong>${escapeHtml(rec.operatorName)}</strong><span style="padding:0 10px;color:#a3adba">·</span>${escapeHtml(service)}</div>
        </div>

        <div style="border:1px solid #e1e8ef;border-radius:20px;overflow:hidden">
          ${rows.map(([label, value], index) => `
            <div style="display:grid;grid-template-columns:38% 62%;gap:18px;padding:17px 20px;background:${index % 2 === 0 ? "#f8fafc" : "#fff"};border-bottom:${index === rows.length - 1 ? "0" : "1px solid #e8edf2"}">
              <div style="font-size:15px;color:#718096">${escapeHtml(label)}</div>
              <div style="font-size:16px;font-weight:700;text-align:right;overflow-wrap:anywhere;color:#1c293d">${escapeHtml(value)}</div>
            </div>
          `).join("")}
        </div>

        <div style="margin-top:26px;padding:16px 20px;border:1px solid #b9edd8;border-radius:14px;background:#effcf6;text-align:center;color:#087451;font-size:15px;font-weight:700">
          ${rec.status === "success" ? "✓ Payment completed successfully. Thank you!" : escapeHtml(status)}
        </div>
        <div style="margin-top:28px;padding-top:22px;border-top:1px solid #e5eaf0;text-align:center;color:#7b8795;font-size:13px;line-height:1.7">
          This is a system-generated receipt.<br />
          For support: smitcscinfo.com · Mon–Sat, 10 AM – 6 PM<br />
          <span style="color:#a3adba">© Smit CSC Info · Gujarat, India</span>
        </div>
      </div>
    </div>
  `;
  return root;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = String(text || "—").split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (ctx.measureText(word).width > maxWidth) {
      if (line) {
        lines.push(line);
        line = "";
      }
      let chunk = "";
      for (const char of word) {
        if (ctx.measureText(chunk + char).width > maxWidth && chunk) {
          lines.push(chunk);
          chunk = "";
        }
        chunk += char;
      }
      line = chunk;
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["—"];
}

async function fallbackReceiptCanvas(rec: RechargeRecord) {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 1400;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");

  ctx.fillStyle = "#eef3f8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(34, 34, 932, 1332, 30);
  ctx.fill();
  ctx.fillStyle = "#0b8f67";
  ctx.fillRect(34, 34, 932, 14);

  const logo = new Image();
  logo.src = "/logo.png";
  await new Promise<void>((resolve) => {
    logo.onload = () => resolve();
    logo.onerror = () => resolve();
  });
  if (logo.complete && logo.naturalWidth) {
    ctx.drawImage(logo, 78, 87, 82, 82);
  }

  ctx.fillStyle = "#12264a";
  ctx.font = "800 32px Arial";
  ctx.fillText("Smit CSC Info", 184, 121);
  ctx.fillStyle = "#536275";
  ctx.font = "18px Arial";
  ctx.fillText("Digital Service Center · Gujarat", 184, 151);
  ctx.fillStyle = "#8190a2";
  ctx.font = "15px Arial";
  ctx.fillText("smitcscinfo.com", 184, 175);
  ctx.strokeStyle = "#e5eaf0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(78, 215);
  ctx.lineTo(922, 215);
  ctx.stroke();

  ctx.fillStyle = "#e8faf3";
  ctx.beginPath();
  ctx.arc(500, 285, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#0aa873";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#07825a";
  ctx.font = "700 38px Arial";
  ctx.textAlign = "center";
  ctx.fillText("✓", 500, 298);
  ctx.fillStyle = "#13213a";
  ctx.font = "800 30px Arial";
  ctx.fillText(STATUS_LBL[rec.status], 500, 362);
  ctx.fillStyle = "#0c1830";
  ctx.font = "800 52px Arial";
  ctx.fillText(formatINR(rec.amount), 500, 425);
  ctx.fillStyle = "#516175";
  ctx.font = "18px Arial";
  ctx.fillText(`${rec.operatorName} · ${serviceLabel(rec.type)}`, 500, 462);
  ctx.textAlign = "left";

  const rows = [
    [numberLabel(rec.type), rec.number],
    ["Service", serviceLabel(rec.type)],
    ["Operator / Biller", rec.operatorName],
    ["Amount", formatINR(rec.amount)],
    ...(rec.commissionAmount > 0 ? [["Commission", `+${formatINR(rec.commissionAmount)}`]] : []),
    ["Status", STATUS_LBL[rec.status]],
    ["Transaction ID", rec.id],
    ...(rec.providerTxnId ? [["Operator Reference", rec.providerTxnId]] : []),
    ["Date & Time", receiptDate(rec.createdAt)],
  ];
  let y = 510;
  const rowHeight = 61;
  ctx.strokeStyle = "#e1e8ef";
  ctx.lineWidth = 1;
  ctx.strokeRect(78, y, 844, rowHeight * rows.length);
  rows.forEach(([label, value], index) => {
    if (index % 2 === 0) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(79, y + index * rowHeight + 1, 842, rowHeight - 1);
    }
    if (index) {
      ctx.beginPath();
      ctx.moveTo(78, y + index * rowHeight);
      ctx.lineTo(922, y + index * rowHeight);
      ctx.stroke();
    }
    ctx.fillStyle = "#718096";
    ctx.font = "16px Arial";
    ctx.fillText(label, 98, y + index * rowHeight + 37);
    ctx.fillStyle = "#1c293d";
    ctx.font = "700 16px Arial";
    const lines = wrapText(ctx, value, 485);
    lines.slice(0, 2).forEach((line, lineIndex) => {
      ctx.textAlign = "right";
      ctx.fillText(line, 900, y + index * rowHeight + 29 + lineIndex * 19);
      ctx.textAlign = "left";
    });
  });

  const noticeY = y + rows.length * rowHeight + 35;
  ctx.fillStyle = "#effcf6";
  ctx.fillRect(78, noticeY, 844, 56);
  ctx.fillStyle = "#087451";
  ctx.font = "700 16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    rec.status === "success" ? "✓ Payment completed successfully. Thank you!" : STATUS_LBL[rec.status],
    500,
    noticeY + 35,
  );
  ctx.fillStyle = "#7b8795";
  ctx.font = "14px Arial";
  ctx.fillText("This is a system-generated receipt.", 500, noticeY + 106);
  ctx.fillText("For support: smitcscinfo.com · Mon–Sat, 10 AM – 6 PM", 500, noticeY + 131);
  ctx.fillStyle = "#a3adba";
  ctx.fillText("© Smit CSC Info · Gujarat, India", 500, noticeY + 156);
  ctx.textAlign = "left";
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create receipt image"))), "image/png", 1);
  });
}

async function prepareReceiptImage(rec: RechargeRecord) {
  const stage = shareStageMarkup(rec);
  document.body.appendChild(stage);
  try {
    const images = Array.from(stage.querySelectorAll("img"));
    await Promise.all(images.map((image) => new Promise<void>((resolve) => {
      if (image.complete) return resolve();
      image.onload = () => resolve();
      image.onerror = () => resolve();
    })));
    const canvas = await html2canvas(stage, {
      backgroundColor: "#eef3f8",
      scale: Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)),
      logging: false,
      useCORS: true,
      allowTaint: false,
      imageTimeout: 10000,
    });
    return await canvasBlob(canvas);
  } catch (error) {
    console.warn("DOM receipt image fallback used", error);
    return await canvasBlob(await fallbackReceiptCanvas(rec));
  } finally {
    stage.remove();
  }
}

export default function RechargeReceipt() {
  const [, params] = useRoute("/recharge/receipt/:id");
  const id = params?.id ?? "";
  const qc = useQueryClient();
  const [isSharing, setIsSharing] = useState(false);
  const [shareNotice, setShareNotice] = useState("");

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "receipt-print-styles";
    style.innerHTML = `
      @media print {
        @page { size: A4 portrait; margin: 10mm; }
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
          inset: 0 auto auto 0 !important;
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          transform: none !important;
          zoom: 1 !important;
          box-shadow: none !important;
          overflow: visible !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        #print-receipt .receipt-card-content { padding: 28px !important; }
        #print-receipt .receipt-details { font-size: 13px !important; }
        #print-receipt .receipt-details-row {
          display: grid !important;
          grid-template-columns: 38% 62% !important;
          align-items: start !important;
        }
        #print-receipt .receipt-details-row > :last-child {
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
        }
        #print-receipt .receipt-status-icon { width: 48px !important; height: 48px !important; }
        #print-receipt .receipt-amount { font-size: 34px !important; }
        #print-receipt .receipt-footer { font-size: 10px !important; line-height: 1.35 !important; }
        #print-receipt .no-print, .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    return () => document.getElementById("receipt-print-styles")?.remove();
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
  const colorBorder = rec.status === "success" ? "border-t-emerald-500" : (rec.status === "failed" || rec.status === "refunded") ? "border-t-red-500" : "border-t-amber-500";
  const colorIcon = rec.status === "success" ? "text-emerald-600" : (rec.status === "failed" || rec.status === "refunded") ? "text-red-600" : "text-amber-600";
  const Icon = ICONS[rec.type] ?? Receipt;

  const handleShare = async () => {
    if (isSharing) return;
    setIsSharing(true);
    setShareNotice("");
    try {
      const blob = await prepareReceiptImage(rec);
      const file = new File([blob], `smit-csc-receipt-${rec.id}.png`, { type: "image/png" });
      const canShareFile = typeof navigator.share === "function"
        && typeof navigator.canShare === "function"
        && navigator.canShare({ files: [file] });

      if (canShareFile) {
        try {
          await navigator.share({ title: "Smit CSC Info Receipt", files: [file] });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          console.warn("Native receipt share unavailable; downloading image instead", error);
        }
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setShareNotice("Receipt image saved. You can share it from your downloads.");
    } catch (error) {
      console.error("Receipt image preparation failed", error);
      setShareNotice("Receipt image could not be prepared on this device.");
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="flex-1 py-8 px-4 bg-slate-50">
      <div className="container mx-auto max-w-md">
        <Link href="/recharge/history">
          <Button variant="ghost" size="sm" className="mb-4 no-print">
            <ArrowLeft className="h-4 w-4 mr-2" />History
          </Button>
        </Link>

        <Card id="print-receipt" className={`overflow-hidden shadow-xl border border-slate-200 border-t-8 ${colorBorder} bg-white rounded-2xl`}>
          <CardContent className="p-5 sm:p-6 space-y-5 receipt-card-content">
            <div className="flex items-center justify-between gap-3 border-b pb-4 receipt-header">
              <div className="flex items-center gap-3 min-w-0">
                <img src="/logo.png" alt="Smit CSC Info" className="h-14 w-14 rounded-2xl object-contain border border-slate-100 bg-white shrink-0" />
                <div className="min-w-0">
                  <div className="text-lg font-extrabold tracking-tight text-slate-900">Smit CSC Info</div>
                  <div className="text-[11px] text-slate-500">Digital Service Center · Gujarat</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">smitcscinfo.com</div>
                </div>
              </div>
              <span className="text-[9px] font-bold tracking-[0.16em] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1 whitespace-nowrap">RECEIPT</span>
            </div>

            <div className="text-center receipt-status">
              <div className={`mx-auto h-14 w-14 rounded-full border-2 flex items-center justify-center bg-white ${colorIcon} border-current`}>
                <StatusIcon className="h-8 w-8 receipt-status-icon" />
              </div>
              <div className="text-xl font-extrabold mt-3 text-slate-900">{STATUS_LBL[rec.status]}</div>
              <div className="text-4xl font-extrabold tracking-tight mt-1 text-slate-950 receipt-amount">{formatINR(rec.amount)}</div>
              <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-slate-500">
                <Icon className="h-4 w-4 text-emerald-600" />
                <span className="font-bold text-slate-700">{rec.operatorName}</span>
                <span className="text-slate-300">·</span>
                <span>{serviceLabel(rec.type)}</span>
              </div>
            </div>

            <Separator />

            <div className="overflow-hidden rounded-2xl border border-slate-200 receipt-details">
              <Row label={numberLabel(rec.type)} value={rec.number} />
              <Row label="Service" value={serviceLabel(rec.type)} />
              <Row label="Operator / Biller" value={rec.operatorName} />
              <Row label="Amount" value={<span className="font-extrabold text-slate-900">{formatINR(rec.amount)}</span>} />
              {rec.commissionAmount > 0 && (
                <Row label="Commission" value={<span className="text-emerald-700 font-bold">+{formatINR(rec.commissionAmount)}</span>} />
              )}
              <Row label="Status" value={<span className="font-bold">{STATUS_LBL[rec.status]}</span>} />
              <Row label="Transaction ID" value={<span className="font-mono text-[11px]">{rec.id}</span>} />
              {rec.providerTxnId && (
                <Row label="Operator Reference" value={<span className="font-mono text-[11px]">{rec.providerTxnId}</span>} />
              )}
              <Row label="Date & Time" value={receiptDate(rec.createdAt)} />
            </div>

            {rec.failureReason && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                <b>Reason:</b> {rec.failureReason}
              </div>
            )}
            {rec.refundedAt && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                {formatINR(rec.amount)} refunded to wallet on {receiptDate(rec.refundedAt)}.
              </div>
            )}
            {rec.status === "success" && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700 text-center font-medium">
                ✓ Payment completed successfully. Thank you!
              </div>
            )}

            <Separator />

            <div className="text-center text-[10px] text-slate-500 leading-relaxed receipt-footer">
              This is a system-generated receipt.<br />
              For support: smitcscinfo.com · Mon–Sat, 10 AM – 6 PM<br />
              <span className="text-slate-400">© Smit CSC Info · Gujarat, India</span>
            </div>

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
                  Share
                </Button>
              </div>
              {shareNotice && <div role="status" className="text-center text-[11px] text-slate-500">{shareNotice}</div>}
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
    <div className="receipt-details-row grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 items-start px-4 py-3 text-sm even:bg-slate-50 border-b last:border-b-0 border-slate-100">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-right text-slate-800 break-words [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}