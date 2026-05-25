import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useLogin } from "@workspace/api-client-react";
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

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
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

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const loginMutation = useLogin();

  // Already signed in? Bounce them off the login page.
  useEffect(() => {
    if (!user) return;
    if (user.role === "admin" || user.role === "manager") setLocation("/admin");
    else setLocation("/");
  }, [user, setLocation]);

  const [socialLoading, setSocialLoading]       = useState<"google" | "facebook" | null>(null);
  const [showPassword, setShowPassword]         = useState(false);
  const [resetLoading, setResetLoading]         = useState(false);
  const [showReset, setShowReset]               = useState(false);
  const [resetEmail, setResetEmail]             = useState("");
  const [unverifiedEmail, setUnverifiedEmail]   = useState<string | null>(null);
  const [resendLoading, setResendLoading]       = useState(false);
  const [resendSent, setResendSent]             = useState(false);
  const [verifyStep, setVerifyStep]             = useState<string | null>(null);
  const [verifiedBanner, setVerifiedBanner]     = useState<"verified" | "already" | null>(() => {
    const p = new URLSearchParams(window.location.search).get("verified");
    return p === "true" ? "verified" : p === "already" ? "already" : null;
  });

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const handleResendVerification = async (email: string) => {
    setResendLoading(true);
    try {
      await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setResendSent(true);
      toast({ title: "Verification email sent!", description: "Check your inbox for the activation link." });
    } catch {
      toast({ variant: "destructive", title: "Failed to resend", description: "Please try again in a moment." });
    } finally {
      setResendLoading(false);
    }
  };

  // Silently re-send the verification link (used when an unverified user tries to log in).
  const silentResendVerification = async (email: string) => {
    try {
      await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    } catch {
      /* swallow — UI still shows the verification screen and a manual resend button */
    }
  };

  // Route the user to the right landing page based on their role.
  // Admins/managers → /admin. Everyone else (free OR Prime) → / (marketing home);
  // Prime members can open the gold premium dashboard later from the avatar menu.
  const routeAfterLogin = async (u: { role?: string }) => {
    if (u?.role === "admin" || u?.role === "manager") {
      setLocation("/admin");
      return;
    }
    setLocation("/");
  };

  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    setUnverifiedEmail(null);
    setResendSent(false);
    loginMutation.mutate({ data }, {
      onSuccess: async (res) => {
        login(res.token, res.user);
        toast({ title: "Welcome back!" });
        await routeAfterLogin(res.user as any);
      },
      onError: (err: any) => {
        const errMsg = err?.message ?? "";
        const apiCode = err?.data?.code ?? err?.data?.error;
        const isUnverified =
          apiCode === "email_not_verified" ||
          /not\s+verified/i.test(errMsg);
        if (isUnverified) {
          // Show the same "Verify your email" screen as registration and
          // automatically (re-)send a fresh activation link to their inbox.
          setVerifyStep(data.email);
          silentResendVerification(data.email);
          return;
        }
        // Friendly, specific messages — no technical codes.
        let title = "Login failed";
        let description = "Please check your details and try again.";
        if (apiCode === "invalid_password" || /^invalid password$/i.test(errMsg)) {
          title = "Invalid password";
          description = "The password you entered is incorrect.";
        } else if (apiCode === "invalid_email_and_password" || /invalid email and password/i.test(errMsg)) {
          title = "Invalid email and password";
          description = "We couldn't find an account with these details.";
        } else if (/network|fetch|failed to fetch/i.test(errMsg)) {
          title = "Connection problem";
          description = "Unable to process your request. Please check your connection.";
        }
        toast({ variant: "destructive", title, description });
      },
    });
  };

 const handleSocialLogin = async (provider: "google" | "facebook") => {
  setSocialLoading(provider);
  try {
    const selectedProvider = provider === "facebook" ? facebookProvider : googleProvider;

    // Always use popup — signInWithRedirect causes sessionStorage errors on
    // mobile browsers with storage partitioning (Chrome 115+, Safari 17+).
    const result = await signInWithPopup(auth, selectedProvider);
    const idToken = await result.user.getIdToken();
    const res = await exchangeFirebaseToken(idToken);
    login(res.token, res.user as any);
    toast({ title: provider === "facebook" ? t.login.signedInFacebook : t.login.signedInGoogle });
    await routeAfterLogin(res.user as any);
  } catch (err: any) {
    const msg =
      err?.code === "auth/popup-closed-by-user"
        ? "Sign-in cancelled."
        : err?.code === "auth/popup-blocked"
        ? "Popup blocked. Please allow popups for this site and try again."
        : err?.code === "auth/account-exists-with-different-credential"
        ? "An account already exists with this email. Try email/password login."
        : err?.code === "auth/unauthorized-domain"
        ? "This domain is not authorised. Please contact support."
        : err?.message ?? "Social login failed. Please try again.";
    toast({ variant: "destructive", title: "Sign-in failed", description: msg });
  } finally {
    setSocialLoading(null);
  }
};
  
  const handleForgotPassword = async () => {
    const email = resetEmail || form.getValues("email");
    if (!email || !email.includes("@")) {
      toast({ variant: "destructive", title: "Enter your email first", description: "Type your email in the field above and try again." });
      return;
    }
    setResetLoading(true);
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      toast({ title: "Reset link sent!", description: `Check your inbox at ${email} for the reset link.` });
      setShowReset(false);
    } catch (err: any) {
      const msg = err?.message ?? "";
      const isNotRegistered = /not registered/i.test(msg) || err?.status === 404;
      toast({
        variant: "destructive",
        title: isNotRegistered ? "Email not registered" : "Failed to send reset link",
        description: isNotRegistered ? "This email is not registered with us." : (msg || "Try again."),
      });
    } finally {
      setResetLoading(false);
    }
  };

  if (verifyStep) {
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
                We've sent a fresh verification link to <strong>{verifyStep}</strong>. Check your inbox and click the link to activate your account, then come back and log in.
              </p>
              <p className="text-xs text-gray-400 mb-6">Didn't get it? Check your spam folder or resend below.</p>

              <div className="space-y-2">
                {resendSent ? (
                  <p className="text-xs text-green-700 font-medium">✅ Verification email resent — check your inbox.</p>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleResendVerification(verifyStep)}
                    disabled={resendLoading}
                    data-testid="resend-verification"
                  >
                    {resendLoading ? <span className="flex items-center gap-2"><Spinner /> Sending…</span> : "Resend verification email"}
                  </Button>
                )}
                <Button
                  className="w-full bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white border-0"
                  onClick={() => { setVerifyStep(null); setResendSent(false); }}
                  data-testid="back-to-login"
                >
                  Back to Login
                </Button>
              </div>
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
            <CardTitle className="text-2xl font-bold">{t.login.title}</CardTitle>
            <CardDescription>{t.login.subtitle}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">

            {/* ── Email verified success banner ── */}
            {verifiedBanner && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 rounded-xl bg-green-50 border border-green-200 px-4 py-3"
              >
                <span className="text-green-500 text-lg mt-0.5">✅</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-800">
                    {verifiedBanner === "already" ? "Account already verified" : "Email verified successfully!"}
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">You can now log in with your credentials.</p>
                </div>
                <button onClick={() => setVerifiedBanner(null)} className="text-green-400 hover:text-green-600 text-sm">✕</button>
              </motion.div>
            )}

            {/* ── Email not verified alert ── */}
            {unverifiedEmail && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-2"
              >
                <div className="flex items-start gap-3">
                  <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800">Email not verified</p>
                    <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                      Your email is not verified. Please check your inbox and click the activation link.
                    </p>
                  </div>
                </div>
                {resendSent ? (
                  <p className="text-xs text-green-700 font-medium pl-8">✅ Verification email resent — check your inbox.</p>
                ) : (
                  <button
                    onClick={() => handleResendVerification(unverifiedEmail)}
                    disabled={resendLoading}
                    className="ml-8 text-xs font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900 disabled:opacity-60"
                  >
                    {resendLoading ? "Sending…" : "Resend verification email →"}
                  </button>
                )}
              </motion.div>
            )}

            {/* Social Login Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  variant="outline"
                  className="w-full h-11 font-semibold border-gray-200 gap-2 hover:bg-gray-50"
                  onClick={() => handleSocialLogin("google")}
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
                  onClick={() => handleSocialLogin("facebook")}
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
                <span className="bg-white px-2 text-gray-400 font-medium">{t.login.orEmail}</span>
              </div>
            </div>

            {/* Email / Password Form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {[
                  { name: "email" as const, label: t.login.email, placeholder: t.login.emailPlaceholder, type: "email" },
                  { name: "password" as const, label: t.login.password, placeholder: t.login.passwordPlaceholder, type: "password" },
                ].map(({ name, label, placeholder, type }, i) => (
                  <motion.div
                    key={name}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + i * 0.08, duration: 0.35 }}
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

                {/* Forgot password */}
                <div className="flex justify-end -mt-1">
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline font-medium"
                    onClick={() => {
                      setResetEmail(form.getValues("email"));
                      setShowReset(true);
                    }}
                  >
                    {t.login.forgotPassword}
                  </button>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Button
                    type="submit"
                    className="w-full h-11 text-base font-semibold bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 border-0 text-white shadow-md"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? (
                      <span className="flex items-center gap-2">
                        <Spinner />
                        {t.login.loading}
                      </span>
                    ) : t.login.submit}
                  </Button>
                </motion.div>
              </form>
            </Form>
          </CardContent>

          <CardFooter className="text-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }} className="text-sm text-muted-foreground w-full">
              {t.login.noAccount}{" "}
              <Link href="/register" className="text-primary hover:underline font-medium">{t.login.registerLink}</Link>
            </motion.div>
          </CardFooter>
        </Card>
      </motion.div>

      {/* Forgot Password Modal */}
      {showReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm"
          >
            <h3 className="text-lg font-bold mb-1">{t.login.resetTitle}</h3>
            <p className="text-sm text-gray-500 mb-4">{t.login.resetDesc}</p>
            <Input
              type="email"
              placeholder={t.login.emailPlaceholderReset}
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className="mb-4"
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowReset(false)}>{t.login.cancel}</Button>
              <Button
                className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white border-0"
                onClick={handleForgotPassword}
                disabled={resetLoading}
              >
                {resetLoading ? <span className="flex items-center gap-2"><Spinner /> {t.login.sendingResetLink}</span> : t.login.sendResetLink}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
