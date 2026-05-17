import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Clock, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useVerifyPayment, getGetMembershipStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useLanguage } from "@/lib/i18n";

export default function PaymentPending() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const params = new URLSearchParams(window.location.search);
  const txn = params.get("txn");
  const failed = params.get("failed") === "1";

  const verifyMutation = useVerifyPayment();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);
  const MAX_ATTEMPTS = 10;

  useEffect(() => {
    if (!txn || failed) return;
    const poll = () => {
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        return;
      }
      attemptsRef.current += 1;
      verifyMutation.mutate({ transactionId: txn }, {
        onSuccess: () => {
          if (pollingRef.current) clearInterval(pollingRef.current);
          queryClient.invalidateQueries({ queryKey: getGetMembershipStatusQueryKey() });
          setLocation(`/payment/success?txn=${txn}`);
        },
      });
    };
    pollingRef.current = setInterval(poll, 5000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [txn, failed]);

  if (failed) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 bg-gray-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.88, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md"
        >
          <Card className="shadow-xl border-t-8 border-t-red-500">
            <CardContent className="pt-10 pb-8 px-8 flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0, rotate: 20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 320, damping: 16 }}
                className="h-24 w-24 bg-red-100 rounded-full flex items-center justify-center mb-6"
              >
                <XCircle className="h-12 w-12 text-red-600" />
              </motion.div>
              <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="text-3xl font-bold text-gray-900 mb-2">
                {t.paymentPending.failed}
              </motion.h1>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="text-muted-foreground mb-8">
                {t.paymentPending.failedDesc}
              </motion.p>
              {txn && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.52 }} className="text-xs text-muted-foreground mb-6 font-mono bg-gray-100 px-3 py-1 rounded">
                  {t.paymentPending.txnId} {txn}
                </motion.p>
              )}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.58 }} className="flex flex-col w-full gap-3">
                <Link href="/membership" className="w-full">
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button className="w-full h-12 text-lg">{t.paymentPending.tryAgain}</Button>
                  </motion.div>
                </Link>
                <Link href="/dashboard" className="w-full">
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button variant="outline" className="w-full h-12 text-lg">{t.paymentPending.returnDashboard}</Button>
                  </motion.div>
                </Link>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-gray-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <Card className="shadow-xl border-t-8 border-t-yellow-500">
          <CardContent className="pt-10 pb-8 px-8 flex flex-col items-center text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 280, damping: 15 }}
              className="h-24 w-24 bg-yellow-100 rounded-full flex items-center justify-center mb-6"
            >
              <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
                <Clock className="h-12 w-12 text-yellow-600" />
              </motion.div>
            </motion.div>

            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="text-3xl font-bold text-gray-900 mb-2">
              {t.paymentPending.pending}
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.44 }} className="text-muted-foreground mb-4">
              {t.paymentPending.pendingDesc}
            </motion.p>

            {txn && verifyMutation.isPending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.52 }} className="flex items-center gap-2 text-sm text-muted-foreground mb-4 bg-yellow-50 px-4 py-2 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin text-yellow-600" />
                {t.paymentPending.checking}
              </motion.div>
            )}

            {txn && attemptsRef.current >= MAX_ATTEMPTS && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-amber-600 mb-6">
                {t.paymentPending.stillWaiting}
              </motion.p>
            )}

            {txn && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.56 }} className="text-xs text-muted-foreground mb-6 font-mono bg-gray-100 px-3 py-1 rounded">
                {t.paymentPending.txnId} {txn}
              </motion.p>
            )}

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.62 }} className="w-full">
              <Link href="/dashboard" className="w-full">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button variant="outline" className="w-full h-12 text-lg">{t.paymentPending.returnDashboard}</Button>
                </motion.div>
              </Link>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
