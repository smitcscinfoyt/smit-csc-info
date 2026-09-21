import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useVerifyPayment, getGetMembershipStatusQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useLanguage } from "@/lib/i18n";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const params = new URLSearchParams(window.location.search);
  const txn = params.get("txn");
  const verifyMutation = useVerifyPayment();

  useEffect(() => {
    if (!txn) return;
    verifyMutation.mutate({ transactionId: txn }, {
      onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: getGetMembershipStatusQueryKey() });
queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: () => {
        setLocation(`/payment/pending?txn=${txn}&failed=1`);
      }
    });
  }, [txn]);

  if (verifyMutation.isPending) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 bg-gray-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <Card className="shadow-xl border-t-8 border-t-blue-500">
            <CardContent className="pt-10 pb-8 px-8 flex flex-col items-center text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                className="h-20 w-20 bg-blue-100 rounded-full flex items-center justify-center mb-6"
              >
                <Loader2 className="h-10 w-10 text-blue-600" />
              </motion.div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{t.paymentSuccess.confirming}</h1>
              <p className="text-muted-foreground">{t.paymentSuccess.confirmingDesc}</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (verifyMutation.isError) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 bg-gray-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <Card className="shadow-xl border-t-8 border-t-red-500">
            <CardContent className="pt-10 pb-8 px-8 flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
                className="h-20 w-20 bg-red-100 rounded-full flex items-center justify-center mb-6"
              >
                <XCircle className="h-10 w-10 text-red-600" />
              </motion.div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{t.paymentSuccess.failed}</h1>
              <p className="text-muted-foreground mb-8">{t.paymentSuccess.failedDesc}</p>
              <Link href="/membership" className="w-full">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button className="w-full h-12 text-lg">{t.paymentSuccess.tryAgain}</Button>
                </motion.div>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-gray-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <Card className="shadow-xl border-t-8 border-t-green-500 overflow-hidden relative">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute h-2 w-2 rounded-full"
                style={{
                  top: "30%", left: "50%",
                  backgroundColor: ["#22c55e","#f59e0b","#3b82f6","#ef4444","#a855f7","#ec4899"][i % 6]
                }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: (Math.random() - 0.5) * 300, y: (Math.random() - 0.5) * 200, opacity: 0, scale: 0.3 }}
                transition={{ delay: 0.3 + i * 0.04, duration: 1.2, ease: "easeOut" }}
              />
            ))}
          </div>

          <CardContent className="pt-10 pb-8 px-8 flex flex-col items-center text-center relative z-10">
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 320, damping: 16 }}
              className="h-24 w-24 bg-green-100 rounded-full flex items-center justify-center mb-6"
            >
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38, duration: 0.4 }}
              className="text-3xl font-bold text-gray-900 mb-2"
            >
              {t.paymentSuccess.success}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.48 }}
              className="text-muted-foreground mb-6"
            >
              {t.paymentSuccess.successDesc}
            </motion.p>

            {txn && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.56 }}
                className="text-xs text-muted-foreground mb-6 font-mono bg-gray-100 px-3 py-1 rounded"
              >
                {t.paymentSuccess.txnId} {txn}
              </motion.p>
            )}

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.62 }}
              className="flex flex-col w-full gap-3"
            >
              <Link href="/dashboard" className="w-full">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button className="w-full h-12 text-lg">{t.paymentSuccess.goDashboard}</Button>
                </motion.div>
              </Link>
              <Link href="/content" className="w-full">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button variant="outline" className="w-full h-12 text-lg">{t.paymentSuccess.browseContent}</Button>
                </motion.div>
              </Link>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
