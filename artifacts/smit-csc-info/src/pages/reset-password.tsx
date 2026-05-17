import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, KeyRound, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const schema = z
  .object({
    password:        z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

function Spinner() {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"
    />
  );
}

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [showPass, setShowPass]         = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [done, setDone]                 = useState(false);
  const [tokenError, setTokenError]     = useState(false);

  useEffect(() => {
    if (!token) setTokenError(true);
  }, [token]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setSubmitting(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password: data.password }),
      });
      setDone(true);
    } catch (err: any) {
      const msg = err?.message ?? "Failed to reset password.";
      if (msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("invalid")) {
        setTokenError(true);
      } else {
        toast({ variant: "destructive", title: "Error", description: msg });
      }
    } finally {
      setSubmitting(false);
    }
  };

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
                <KeyRound className="h-8 w-8 text-indigo-600" />
              </div>
            </motion.div>
            <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
            <CardDescription>Enter your new password below</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">

            {/* ── Invalid / expired token ── */}
            {tokenError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-red-50 border border-red-200 px-4 py-4 flex items-start gap-3"
              >
                <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Link expired or invalid</p>
                  <p className="text-xs text-red-600 mt-1 leading-relaxed">
                    This reset link is invalid or has expired (links are valid for 1 hour).
                    Please request a new one from the login page.
                  </p>
                  <button
                    className="mt-2 text-xs font-semibold text-red-700 underline underline-offset-2 hover:text-red-900"
                    onClick={() => setLocation("/login")}
                  >
                    Back to Login →
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Success state ── */}
            {done && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl bg-green-50 border border-green-200 px-4 py-6 flex flex-col items-center gap-3 text-center"
              >
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-sm font-semibold text-green-800">Password reset successfully!</p>
                <p className="text-xs text-green-600 leading-relaxed">
                  Your password has been updated. You can now log in with your new password.
                </p>
                <Button
                  className="mt-2 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white border-0"
                  onClick={() => setLocation("/login")}
                >
                  Go to Login
                </Button>
              </motion.div>
            )}

            {/* ── Form ── */}
            {!done && !tokenError && (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPass ? "text" : "password"}
                              placeholder="At least 6 characters"
                              className="pr-10"
                              {...field}
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowPass((v) => !v)}
                            >
                              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm New Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showConfirm ? "text" : "password"}
                              placeholder="Repeat your password"
                              className="pr-10"
                              {...field}
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowConfirm((v) => !v)}
                            >
                              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                    <Button
                      type="submit"
                      className="w-full h-11 text-base font-semibold bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 border-0 text-white shadow-md"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <span className="flex items-center gap-2"><Spinner /> Resetting…</span>
                      ) : "Set New Password"}
                    </Button>
                  </motion.div>
                </form>
              </Form>
            )}

          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
