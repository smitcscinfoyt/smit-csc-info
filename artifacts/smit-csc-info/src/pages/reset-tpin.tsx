import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

function Spinner() {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"
    />
  );
}

export default function ResetTpin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setTokenError("No reset token found. Please request a new T-PIN reset link.");
      return;
    }
    apiFetch<{ valid: boolean; error?: string }>(`/api/tpin/verify-reset-token?token=${encodeURIComponent(token)}`)
      .then((data) => {
        setVerifying(false);
        if (data.valid) {
          setTokenValid(true);
        } else {
          setTokenError(data.error ?? "Invalid or expired link.");
        }
      })
      .catch(() => {
        setVerifying(false);
        setTokenError("Could not verify the reset link. Please try again.");
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      toast({ variant: "destructive", title: "Invalid T-PIN", description: "T-PIN must be 4 to 6 digits." });
      return;
    }
    if (pin !== confirmPin) {
      toast({ variant: "destructive", title: "PINs don't match", description: "Please make sure both PINs are identical." });
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/tpin/reset", {
        method: "POST",
        body: JSON.stringify({ token, pin }),
      });
      setDone(true);
    } catch (err: any) {
      const msg = err?.message ?? "Failed to reset T-PIN.";
      if (msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("invalid")) {
        setTokenValid(false);
        setTokenError(msg);
      } else {
        toast({ variant: "destructive", title: "Error", description: msg });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const pinsMatch = pin.length >= 4 && confirmPin.length >= 4 && pin === confirmPin;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 bg-gradient-to-br from-indigo-50 via-white to-violet-50">
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <Card className="shadow-2xl border-t-4 border-t-primary">
          <CardHeader className="text-center pb-2">
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 350, damping: 18 }}
              className="mx-auto mb-3"
            >
              <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto">
                <Lock className="h-8 w-8 text-indigo-600" />
              </div>
            </motion.div>
            <CardTitle className="text-2xl font-bold">Reset T-PIN</CardTitle>
            <CardDescription>Set a new 4-6 digit Transaction PIN</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">

            {/* Verifying token */}
            {verifying && (
              <div className="flex items-center justify-center gap-3 py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Verifying your reset link…</span>
              </div>
            )}

            {/* Invalid / expired token */}
            {!verifying && !tokenValid && tokenError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-red-50 border border-red-200 px-4 py-4 flex items-start gap-3"
              >
                <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Link expired or invalid</p>
                  <p className="text-xs text-red-600 mt-1 leading-relaxed">{tokenError}</p>
                  <button
                    className="mt-2 text-xs font-semibold text-red-700 underline underline-offset-2 hover:text-red-900"
                    onClick={() => setLocation("/account?tab=security")}
                  >
                    Go to Security Settings →
                  </button>
                </div>
              </motion.div>
            )}

            {/* Success state */}
            {done && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl bg-green-50 border border-green-200 px-4 py-6 flex flex-col items-center gap-3 text-center"
              >
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-sm font-semibold text-green-800">T-PIN reset successfully!</p>
                <p className="text-xs text-green-600 leading-relaxed">
                  Your Transaction PIN has been updated. You can now use your new T-PIN for transactions.
                </p>
                <Button
                  className="mt-2 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white border-0"
                  onClick={() => setLocation("/account?tab=security")}
                >
                  Go to Security Settings
                </Button>
              </motion.div>
            )}

            {/* Form */}
            {!verifying && tokenValid && !done && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-pin" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    New T-PIN (4–6 digits)
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-pin"
                      type={showPin ? "text" : "password"}
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Enter 4–6 digit PIN"
                      className="pr-10"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      autoFocus
                      data-testid="input-reset-tpin-new"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPin((v) => !v)}
                      tabIndex={-1}
                    >
                      {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-pin" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Confirm New T-PIN
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm-pin"
                      type={showConfirm ? "text" : "password"}
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Re-enter PIN"
                      className="pr-10"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                      data-testid="input-reset-tpin-confirm"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowConfirm((v) => !v)}
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmPin && pin && (
                    <p className={`text-[11px] flex items-center gap-1 ${pinsMatch ? "text-green-600" : "text-red-500"}`}>
                      {pinsMatch ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {pinsMatch ? "PINs match" : "PINs do not match"}
                    </p>
                  )}
                </div>

                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    type="submit"
                    className="w-full h-11 text-base font-semibold bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 border-0 text-white shadow-md"
                    disabled={submitting || !pinsMatch}
                    data-testid="btn-reset-tpin-submit"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2"><Spinner /> Resetting…</span>
                    ) : (
                      <span className="flex items-center gap-2"><Lock className="h-4 w-4" /> Set New T-PIN</span>
                    )}
                  </Button>
                </motion.div>
              </form>
            )}

          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
