import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  ChevronRight,
  Loader2,
  CheckCircle2,
  QrCode,
  Smartphone,
  Copy,
  Check,
  AlertCircle,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

export interface VyaparPaymentData {
  orderId: string;
  clientTxnId: string;
  amountRupees: number;
  qrCode?: string;
  upiString?: string;
  upiIntent?: {
    phonepe_link?: string;
    gpay_link?: string;
    paytm_link?: string;
    bhim_link?: string;
  };
  merchantName?: string;
  title?: string;
  backText?: string;
}

interface Props {
  open: boolean;
  payment: VyaparPaymentData | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function VyaparPaymentDialog({ open, payment, onSuccess, onCancel }: Props) {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [statusState, setStatusState] = useState<"pending" | "success" | "failed">("pending");
  // Mobile defaults to UPI app intents; desktop defaults to QR. A null value
  // means "use the device default", while a boolean is an explicit toggle.
  const [showQrExplicit, setShowQrExplicit] = useState<boolean | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);

  // Device detection: tablets (iPad/Android) and mobile phones use Intent flow; desktop uses QR flow
  const [isMobileDevice, setIsMobileDevice] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.innerWidth < 768 ||
      /Mobile|Android|iPhone|iPad|Tablet/i.test(navigator.userAgent)
    );
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileDevice(
        window.innerWidth < 768 ||
          /Mobile|Android|iPhone|iPad|Tablet/i.test(navigator.userAgent)
      );
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Check payment status with server
  const checkStatus = async () => {
    if (!payment || statusState === "success") return;
    try {
      setChecking(true);
      const res = await apiFetch<{ status: boolean; state: string; error?: string }>(
        "/api/vyapargateway/check-status",
        {
          method: "POST",
          body: JSON.stringify({
            orderId: payment.orderId,
            clientTxnId: payment.clientTxnId,
          }),
        }
      );

      if (res.status || res.state === "success") {
        setStatusState("success");
        setTimeout(() => {
          onSuccess();
        }, 1200);
      } else if (res.state === "failed") {
        setStatusState("failed");
        setPollingError(res.error || "Payment was rejected or failed.");
      }
    } catch (err: any) {
      // Don't interrupt background polling on network glitches
    } finally {
      setChecking(false);
    }
  };

  // Auto-polling every 2 seconds
  useEffect(() => {
    if (!open || !payment || statusState === "success") return;
    const interval = setInterval(() => {
      checkStatus();
    }, 2000);

    return () => clearInterval(interval);
  }, [open, payment, statusState]);

  if (!payment) return null;

  const orderRef = payment.clientTxnId || payment.orderId;
  const formattedAmount = `₹${payment.amountRupees.toFixed(2)}`;

  // Parse raw parameters from VyaparGateway's upiString
  const rawUpiString = payment.upiString || "";
  const upiQueryString = rawUpiString.includes("?") ? rawUpiString.split("?")[1] : "";
  const upiParams = new URLSearchParams(upiQueryString);

  // If mc is missing from provider's string but MCC is known (e.g. 5541 from merchant settings),
  // we can append it so NPCI recognizes it as a merchant intent instead of untrusted P2P.
  let effectiveUpiString = rawUpiString;
  if (effectiveUpiString && !upiParams.has("mc")) {
    const sep = effectiveUpiString.includes("?") ? "&" : "?";
    effectiveUpiString = `${effectiveUpiString}${sep}mc=5541`;
  }

  const upiUri =
    effectiveUpiString ||
    `upi://pay?pa=bharatpe2y0k0y6a1u09381@unitype&pn=Mr%20SAGAR%20DEVASHIBHAI%20KINDARAKHEDIYA&mc=5541&am=${payment.amountRupees}&cu=INR&tr=${orderRef}`;

  const intentLinks = {
    phonepe: payment.upiIntent?.phonepe_link || upiUri.replace(/^upi:/, "phonepe:"),
    gpay: payment.upiIntent?.gpay_link || upiUri.replace(/^upi:/, "tez:"),
    paytm: payment.upiIntent?.paytm_link || upiUri.replace(/^upi:/, "paytmmp:"),
    bhim: payment.upiIntent?.bhim_link || upiUri,
    other: upiUri,
  };

  // Detailed console logging requested for debugging bank decline
  useEffect(() => {
    if (!open || !payment) return;
    console.group("🔍 [VyaparGateway UPI Intent URI Diagnostic]");
    console.log("Raw upiString from Vyapar:", payment.upiString);
    console.log("Parsed pa (Payee VPA):", upiParams.get("pa"));
    console.log("Parsed pn (Payee Name):", upiParams.get("pn"));
    console.log("Parsed mc (Merchant Code / MCC):", upiParams.get("mc") || "(MISSING from Vyapar response)");
    console.log("Parsed tr (Txn Reference):", upiParams.get("tr"));
    console.log("Parsed mode (Transaction Mode):", upiParams.get("mode") || "(omitted / default)");
    console.log("Parsed am (Amount):", upiParams.get("am"));
    console.log("Parsed cu (Currency):", upiParams.get("cu"));
    console.log("Effective UPI URI:", upiUri);
    console.log("PhonePe Intent Link:", intentLinks.phonepe);
    console.log("Google Pay Intent Link:", intentLinks.gpay);
    console.log("Paytm Intent Link:", intentLinks.paytm);
    console.groupEnd();
  }, [open, payment, upiUri]);

  const handleAppTap = (url: string) => {
    window.location.href = url;
  };

  const copyUpiUri = async () => {
    if (!upiUri) return;
    try {
      await navigator.clipboard.writeText(upiUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const isQrMode = showQrExplicit ?? !isMobileDevice;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-[430px] p-0 overflow-hidden rounded-2xl bg-white border-0 shadow-2xl">
        {statusState === "success" ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Payment Successful!</h3>
            <p className="text-sm text-gray-500">
              Payment of <span className="font-semibold text-gray-800">{formattedAmount}</span> has been confirmed. Processing your request...
            </p>
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Top Bar matching mockup */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 leading-tight">Pay with UPI</h2>
                <p className="text-xs text-gray-500 font-mono mt-0.5 break-all select-all">{orderRef}</p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Chips & Amount Pill */}
            <div className="flex items-center justify-between pt-1">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                UPI
              </span>
              <div className="bg-blue-50/80 border border-blue-100 px-3.5 py-1.5 rounded-xl text-right">
                <div className="text-[10px] font-bold text-blue-600 tracking-wider">AMOUNT</div>
                <div className="text-base font-extrabold text-gray-900 leading-none mt-0.5">{formattedAmount}</div>
              </div>
            </div>

            {/* Subheading */}
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {isQrMode ? "Scan QR with any UPI app" : "Choose payment app"}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Request <span className="font-mono">{orderRef.slice(0, 16)}...</span> is ready.
              </p>
            </div>

            {pollingError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{pollingError}</span>
              </div>
            )}

            {/* Main Content Area: Intent List OR QR Code */}
            {isQrMode ? (
              /* Desktop / QR Mode */
              <div className="bg-gray-50/70 border border-gray-100 rounded-xl p-4 text-center space-y-3">
                {payment.qrCode ? (
                  <div className="bg-white p-3 rounded-xl inline-block border shadow-sm mx-auto">
                    <img
                      src={payment.qrCode.startsWith("data:") ? payment.qrCode : `data:image/png;base64,${payment.qrCode}`}
                      alt="UPI QR Code"
                      className="w-52 h-52 object-contain mx-auto"
                    />
                  </div>
                ) : (
                  <div className="w-52 h-52 bg-gray-200 rounded-xl flex items-center justify-center mx-auto text-xs text-gray-500">
                    QR loading...
                  </div>
                )}
                <div className="text-xs font-medium text-gray-700">
                  Open any UPI app (GPay / PhonePe / Paytm) and scan this QR code
                </div>
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[11px] text-gray-500">Auto-detecting payment in background...</span>
                </div>
              </div>
            ) : (
              /* Mobile / Tablet: UPI Intent app-chooser list strictly matching mockup */
              <div className="space-y-2">
                <div className="bg-blue-50/70 text-blue-800 text-xs font-medium px-3.5 py-2 rounded-xl">
                  Choose an app to continue with UPI.
                </div>

                {/* Apps list */}
                <div className="space-y-2 pt-1">
                  {/* PhonePe */}
                  <button
                    type="button"
                    onClick={() => handleAppTap(intentLinks.phonepe)}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200/80 bg-white hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#5f259f] flex items-center justify-center text-white font-bold text-sm shadow-sm">
                        Pe
                      </div>
                      <div>
                        <div className="font-bold text-sm text-gray-900 leading-tight">PhonePe</div>
                        <div className="text-[11px] text-gray-400 font-medium">Recommended</div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </button>

                  {/* Google Pay */}
                  <button
                    type="button"
                    onClick={() => handleAppTap(intentLinks.gpay)}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200/80 bg-white hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#1a73e8] flex items-center justify-center text-white font-bold text-sm shadow-sm">
                        G
                      </div>
                      <div className="font-bold text-sm text-gray-900">Google Pay</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </button>

                  {/* Paytm */}
                  <button
                    type="button"
                    onClick={() => handleAppTap(intentLinks.paytm)}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200/80 bg-white hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#00b9f5] flex items-center justify-center text-white font-bold text-sm shadow-sm">
                        P
                      </div>
                      <div className="font-bold text-sm text-gray-900">Paytm</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </button>

                  {/* BHIM */}
                  <button
                    type="button"
                    onClick={() => handleAppTap(intentLinks.bhim)}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200/80 bg-white hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#00796b] flex items-center justify-center text-white font-bold text-sm shadow-sm">
                        B
                      </div>
                      <div className="font-bold text-sm text-gray-900">BHIM</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </button>

                  {/* Other UPI App */}
                  <button
                    type="button"
                    onClick={() => handleAppTap(intentLinks.other)}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200/80 bg-white hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#0f766e] flex items-center justify-center text-white font-bold text-[11px] shadow-sm">
                        UPI
                      </div>
                      <div>
                        <div className="font-bold text-sm text-gray-900 leading-tight">Other UPI App</div>
                        <div className="text-[11px] text-gray-400 font-medium">Open Android app chooser</div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
              </div>
            )}

            {/* Toggle view button (Switch between QR & Intent) */}
            <div className="text-center pt-1 space-y-1.5">
              {!isQrMode && (
                <p className="text-[11px] text-gray-500">
                  જો UPI એપ માં બેંક પેમેન્ટ ડિક્લાઇન થાય, તો નીચેથી QR Code સ્કેન કરો:
                </p>
              )}
              <button
                type="button"
                onClick={() => setShowQrExplicit(!isQrMode)}
                className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20"
              >
                {isQrMode ? (
                  <>
                    <Smartphone className="h-3.5 w-3.5" /> Switch to UPI App List
                  </>
                ) : (
                  <>
                    <QrCode className="h-3.5 w-3.5 text-primary" /> Show QR Code instead (100% Success)
                  </>
                )}
              </button>
            </div>

            {/* Bottom Actions matching mockup */}
            <div className="space-y-2 pt-2">
              <Button
                type="button"
                onClick={checkStatus}
                disabled={checking}
                className="w-full bg-[#52467d] hover:bg-[#433866] text-white font-bold h-12 rounded-xl text-base shadow-sm transition-all"
              >
                {checking ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Verifying Payment...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-5 w-5 mr-2" />
                    Payment Done
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="w-full border-gray-200 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold h-12 rounded-xl text-sm"
              >
                {payment.backText || "Back to Recharge"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
