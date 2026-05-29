import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { motion } from "framer-motion";
import { useLanguage } from "@/lib/i18n";
import { Eye, EyeOff } from "lucide-react";
import {
  auth,
  googleProvider,
  facebookProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  exchangeFirebaseToken,
} from "@/lib/firebase";

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  mobile: z.string().min(10, "Enter a valid 10-digit mobile number"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Please re-enter your password"),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

function Spinner({ white = false }: { white?: boolean }) {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      className={`inline-block h-4 w-4 border-2 ${white ? "border-white border-t-transparent" : "border-current border-t-transparent"} rounded-full`}
    />
  );
}

export default function Register() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();

  const [socialLoading, setSocialLoading] = useState<"google" | "facebook" | null>(null);
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [showPassword, setShowPassword]   = useState(false);
  const [step, setStep]                   = useState<"form" | "verify">("form");
  const [verifyMsg, setVerifyMsg]         = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent]       = useState(false);

  const handleResendVerification = async () => {
    if (!verifyMsg) return;
    setResendLoading(true);
    try {
      await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: verifyMsg }),
      });
      setResendSent(true);
      toast({ title: "Verification email sent!", description: "Check your inbox for the activation link." });
    } catch {
      toast({ variant: "destructive", title: "Failed to resend", description: "Please try again in a moment." });
    } finally {
      setResendLoading(false);
    }
  };

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", mobile: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async (data: z.infer<typeof registerSchema>) => {
    setIsSubmitting(true);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name: data.name, email: data.email, mobile: data.mobile, password: data.password }),
      });
      setVerifyMsg(data.email);
      setStep("verify");
    } catch (err: any) {
      const msg = err?.message === "Email already registered"
        ? "This email is already registered. Please login instead."
        : err?.message ?? "Could not create account. Please try again.";
      toast({ variant: "destructive", title: "Registration failed", description: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Facebook redirect result when page loads after redirect
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return;
        setSocialLoading("facebook");
        const idToken = await result.user.getIdToken();
        const res = await exchangeFirebaseToken(idToken);
        login(res.token, res.user as any);
        toast({ title: t.register.createdWithFacebook });
        setLocation("/");
      })
      .catch((err: any) => {
        if (!err) return;
        const msg = err?.code === "auth/account-exists-with-different-credential"
          ? "An account already exists with this email. Try email/password login."
          : err?.message ?? "Facebook sign-up failed. Please try again.";
        toast({ variant: "destructive", title: "Facebook sign-up failed", description: msg });
      })
      .finally(() => setSocialLoading(null));
  }, []);

  const handleSocialSignup = async (provider: "google" | "facebook") => {
    setSocialLoading(provider);
    try {
      if (provider === "facebook") {
        // Use redirect for Facebook — bypasses popup domain restrictions
        await signInWithRedirect(auth, facebookProvider);
        return;
      }
      // Google: popup works fine
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      const res = await exchangeFirebaseToken(idToken);
      login(res.token, res.user as any);
      toast({ title: t.register.createdWithGoogle });
      setLocation("/");
    } catch (err: any) {
      console.error("[Firebase] Social signup error code:", err?.code);
      console.error("[Firebase] Social signup error message:", err?.message);
      const msg =
        err?.code === "auth/popup-closed-by-user" ? "Sign-up cancelled." :
        err?.code === "auth/account-exists-with-different-credential" ? "An account already exists with this email. Try email/password login." :
        err?.code === "auth/unauthorized-domain" ? "This domain is not authorised. Please contact support." :
        err?.message ?? "Social sign-up failed. Please try again.";
      toast({ variant: "destructive", title: "Sign-up failed", description: msg });
    } finally {
      setSocialLoading(null);
    }
  };

  if (step === "verify") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 bg-gradient-to-br from-indigo-50 via-white to-violet-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <Card className="shadow-2xl border-t-4 border-t-green-500 text-center">
            <CardContent className="pt-10 pb-8 px-8">
              <div className="text-6xl mb-4">📬</div>
              <h2 className="text-2xl font-bold mb-2">Verify your email</h2>
              <p className="text-gray-500 mb-4">
                We've sent a verification link to <strong>{verifyMsg}</strong>. Check your inbox and click the link to activate your account.
              </p>
              <p className="text-xs text-gray-400 mb-4">Didn't get it? Check your spam folder or resend below.</p>
              {resendSent ? (
                <p className="text-sm text-green-600 font-medium mb-4">✓ Verification email sent! Check your inbox.</p>
              ) : (
                <Button
                  variant="outline"
                  className="w-full mb-3 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                  onClick={handleResendVerification}
                  disabled={resendLoading}
                  data-testid="resend-verification"
                >
                  {resendLoading ? <span className="flex items-center gap-2"><Spinner /> Sending…</span> : "Resend verification email"}
                </Button>
              )}
              <Button
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white border-0"
                onClick={() => setLocation("/")}
              >
                Continue to Home
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

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
              className="mx-auto mb-2"
            >
              <img src="/logo.png" alt="Smit CSC Info Logo" className="h-16 w-16 object-contain drop-shadow-md mx-auto" />
            </motion.div>
            <CardTitle className="text-2xl font-bold">{t.register.title}</CardTitle>
            <CardDescription>{t.register.subtitle}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Social Sign-up */}
            <div className="grid grid-cols-2 gap-3">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  variant="outline"
                  className="w-full h-11 font-semibold border-gray-200 gap-2 hover:bg-gray-50"
                  onClick={() => handleSocialSignup("google")}
                  disabled={!!socialLoading}
                >
                  {socialLoading === "google" ? (
                    <Spinner />
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  Google
                </Button>
              </motion.div>

              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  variant="outline"
                  className="w-full h-11 font-semibold border-gray-200 gap-2 hover:bg-blue-50"
                  onClick={() => handleSocialSignup("facebook")}
                  disabled={!!socialLoading}
                >
                  {socialLoading === "facebook" ? (
                    <Spinner />
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#1877F2">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  )}
                  Facebook
                </Button>
              </motion.div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-400 font-medium">or register with email</span>
              </div>
            </div>

            {/* Registration Form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {[
                  { name: "name" as const, label: t.register.name, placeholder: t.register.namePlaceholder, type: "text" },
                  { name: "email" as const, label: t.register.email, placeholder: t.register.emailPlaceholder, type: "email" },
                  { name: "mobile" as const, label: t.register.mobile, placeholder: t.register.mobilePlaceholder, type: "tel" },
                  { name: "password" as const, label: t.register.password, placeholder: t.register.passwordPlaceholder, type: "password" },
                  { name: "confirmPassword" as const, label: (t.register as any).confirmPassword ?? "Confirm Password", placeholder: (t.register as any).confirmPasswordPlaceholder ?? "Re-enter your password", type: "password" },
                ].map(({ name, label, placeholder, type }, i) => (
                  <motion.div
                    key={name}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.07, duration: 0.35 }}
                  >
                    <FormField
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{label}</FormLabel>
                          <FormControl>
                            {type === "password" ? (
                              <div className="relative">
                                <Input
                                  placeholder={placeholder}
                                  type={showPassword ? "text" : "password"}
                                  className="transition-shadow focus:shadow-md pr-10"
                                  {...field}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPassword((v) => !v)}
                                  aria-label={showPassword ? "Hide password" : "Show password"}
                                  data-testid="btn-toggle-password"
                                  className="absolute inset-y-0 right-0 flex items-center justify-center w-10 text-gray-500 hover:text-indigo-600 transition-colors"
                                  tabIndex={-1}
                                >
                                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                            ) : (
                              <Input placeholder={placeholder} type={type} className="transition-shadow focus:shadow-md" {...field} />
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </motion.div>
                ))}

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Button
                    type="submit"
                    className="w-full mt-2 h-11 text-base font-semibold bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white border-0 shadow-md"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <Spinner white />
                        {t.register.loading}
                      </span>
                    ) : t.register.submit}
                  </Button>
                </motion.div>
              </form>
            </Form>

            <p className="text-center text-xs text-gray-400">
              {t.register.terms}{" "}
              <Link href="/terms" className="text-primary hover:underline">{t.register.termsLink}</Link>
              {" "}{t.register.and}{" "}
              <Link href="/privacy" className="text-primary hover:underline">{t.register.privacyLink}</Link>
            </p>
          </CardContent>

          <CardFooter className="text-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }} className="text-sm text-muted-foreground w-full">
              {t.register.haveAccount}{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">{t.register.loginLink}</Link>
            </motion.div>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
