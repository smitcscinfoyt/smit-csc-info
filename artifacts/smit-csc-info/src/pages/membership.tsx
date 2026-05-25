import { useGetMembershipPlans, getGetMembershipPlansQueryKey, useSubscribeMembership, useGetMembershipStatus, getGetMembershipStatusQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Star, Zap, Crown, Calendar, AlertTriangle, RefreshCw, Sparkles, MessageCircle } from "lucide-react";
import { format, isValid } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Stagger, StaggerItem, FadeInUp } from "@/components/motion";
import { useLanguage } from "@/lib/i18n";

export default function Membership() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [, setLocation] = useLocation();

  const { data: plans, isLoading } = useGetMembershipPlans({
    query: { queryKey: getGetMembershipPlansQueryKey() }
  });
  const planList = Array.isArray(plans) ? plans : [];

  const { data: status } = useGetMembershipStatus({
    query: { queryKey: getGetMembershipStatusQueryKey(), enabled: !!user }
  });

  const subscribeMutation = useSubscribeMembership();

  const handleSubscribe = (planId: string) => {
    if (!user) {
      setLocation("/login");
      return;
    }
    // Route to checkout page for billing details + optional coupon, then PhonePe.
    setLocation(`/checkout/prime/${planId}`);
  };
  void subscribeMutation; // legacy mutation kept available

  return (
    <div className="flex-1 bg-gray-50">
      {/* Hero — matches Content Library / Documents look */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-800 to-violet-800 px-4 py-12 md:py-14">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-indigo-400/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-violet-400/20 blur-3xl pointer-events-none" />
        <div className="container mx-auto max-w-5xl relative z-10">
          <div className="inline-flex items-center gap-2 border border-white/30 backdrop-blur-sm bg-white/10 px-3 py-1.5 rounded-full text-xs font-bold text-white mb-5">
            <Star className="h-3.5 w-3.5 fill-current" /> {t.membership.badge}
          </div>
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 md:h-16 md:w-16 rounded-2xl flex items-center justify-center shadow-xl flex-shrink-0 bg-gradient-to-br from-indigo-500 to-violet-600">
              <Crown className="h-7 w-7 md:h-8 md:w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-5xl font-black leading-tight text-white">
                {t.membership.title}
              </h1>
              <p className="text-sm md:text-base mt-1.5 max-w-xl text-indigo-100">
                {t.membership.subtitle}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto max-w-5xl px-4 py-10">
        <FadeInUp className="text-center mb-10">
          {status?.isActive && !status?.inGracePeriod && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-6 inline-block bg-green-100 text-green-700 px-5 py-2 rounded-full font-medium border border-green-200"
            >
              ✓ {t.membership.activePlan
                  .replace("{plan}", status.plan ?? "")
                  .replace("{days}", String(status.daysRemaining))}
            </motion.div>
          )}
          {status?.inGracePeriod && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-6 inline-block bg-orange-100 text-orange-800 px-5 py-2 rounded-full font-semibold border border-orange-300"
            >
              ⏳ Grace period — {status.gracePeriodDaysLeft ?? 0} day{(status.gracePeriodDaysLeft ?? 0) === 1 ? "" : "s"} of access remaining
            </motion.div>
          )}
          {status?.isExpired && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-6 inline-block bg-gray-200 text-gray-800 px-5 py-2 rounded-full font-semibold border border-gray-300"
            >
              🔒 Prime expired — reactivate to restore access
            </motion.div>
          )}
        </FadeInUp>

        {/* AI Sahayak — Prime upsell (hidden for active Prime members) */}
        {!status?.isActive && (
          <motion.a
            href="#plans"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("plans")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="group mb-10 flex items-center gap-4 rounded-2xl px-5 py-4 md:px-6 md:py-5 bg-gradient-to-br from-purple-700 via-purple-800 to-amber-700 text-white shadow-xl border border-amber-300/40 hover:shadow-2xl hover:-translate-y-0.5 transition-all"
            data-testid="cta-ai-sahayak"
          >
            <div className="h-12 w-12 md:h-14 md:w-14 shrink-0 rounded-2xl bg-gradient-to-br from-amber-300 to-yellow-500 flex items-center justify-center shadow-md">
              <MessageCircle className="h-6 w-6 md:h-7 md:w-7 text-purple-950" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-200" />
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-amber-200">
                  Smit AI Sahayak
                </span>
              </div>
              <div className="text-base md:text-lg font-extrabold leading-tight">
                Upgrade to Prime to unlock AI Sahayak
              </div>
              <div className="text-xs md:text-sm text-purple-100/90 mt-0.5">
                24/7 Gujarati AI assistant for CSC operators — instant answers on schemes, forms & tools.
              </div>
            </div>
            <div className="shrink-0 hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-400 text-purple-950 text-xs font-bold shadow group-hover:bg-amber-300 transition-colors">
              See Plans <Zap className="h-3.5 w-3.5" />
            </div>
          </motion.a>
        )}

        {/* Grace period — urgent banner */}
        {status?.inGracePeriod && status.expiresAt && (() => {
          const expDate = new Date(status.expiresAt);
          const graceLeft = status.gracePeriodDaysLeft ?? 0;
          return (
            <motion.div
              id="renew"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-10 rounded-2xl border-2 border-orange-400 bg-gradient-to-br from-orange-50 via-red-50 to-white shadow-lg overflow-hidden"
              data-testid="grace-period-section"
            >
              <div className="p-6 md:p-8">
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                  <div className="h-14 w-14 shrink-0 rounded-2xl flex items-center justify-center shadow-md bg-gradient-to-br from-orange-500 to-red-600 text-white">
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-red-700">
                        Prime Expired — Grace Period Active
                      </span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-600 text-white animate-pulse">
                        Urgent
                      </span>
                    </div>
                    <h2 className="text-xl md:text-2xl font-extrabold text-gray-900 mb-1">
                      {graceLeft === 0 ? "Last day of access" : `${graceLeft} day${graceLeft === 1 ? "" : "s"} of grace access left`}
                    </h2>
                    <div className="flex items-center gap-1.5 text-sm text-gray-700">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span>
                        Your <strong>{status.plan}</strong> plan expired on{" "}
                        <strong className="text-gray-900">{isValid(expDate) ? format(expDate, "dd MMMM yyyy") : ""}</strong>.
                        Renew now to keep your benefits.
                      </span>
                    </div>
                  </div>
                  <a
                    href="#plans"
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById("plans")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-white shadow-lg transition-transform hover:scale-105 bg-gradient-to-r from-red-600 via-orange-500 to-amber-500"
                    data-testid="button-grace-renew"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Renew Now
                  </a>
                </div>
              </div>
            </motion.div>
          );
        })()}

        {/* Fully expired — reactivate banner */}
        {status?.isExpired && status.expiresAt && (() => {
          const expDate = new Date(status.expiresAt);
          return (
            <motion.div
              id="renew"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-10 rounded-2xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 via-fuchsia-50 to-white shadow-lg overflow-hidden"
              data-testid="reactivate-section"
            >
              <div className="p-6 md:p-8">
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                  <div className="h-14 w-14 shrink-0 rounded-2xl flex items-center justify-center shadow-md bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white">
                    <Crown className="h-7 w-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-purple-700">
                        Reactivate Your Plan
                      </span>
                    </div>
                    <h2 className="text-xl md:text-2xl font-extrabold text-gray-900 mb-1">
                      Welcome back! Restore your Prime access
                    </h2>
                    <div className="flex items-center gap-1.5 text-sm text-gray-700">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span>
                        Your <strong>{status.plan}</strong> plan expired on{" "}
                        <strong className="text-gray-900">{isValid(expDate) ? format(expDate, "dd MMMM yyyy") : ""}</strong>.
                        Reactivate to unlock all premium documents, videos, and HD credits.
                      </span>
                    </div>
                  </div>
                  <a
                    href="#plans"
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById("plans")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-white shadow-lg transition-transform hover:scale-105 bg-gradient-to-r from-purple-600 via-fuchsia-600 to-purple-700"
                    data-testid="button-reactivate"
                  >
                    <Zap className="h-4 w-4" />
                    Reactivate Now
                  </a>
                </div>
              </div>
            </motion.div>
          );
        })()}

        {/* Renewal Section */}
        {(() => {
          if (!status?.isActive || !status.expiresAt) return null;
          const expDate = new Date(status.expiresAt);
          if (!isValid(expDate)) return null;
          const daysLeft =
            typeof status.daysRemaining === "number" &&
            Number.isFinite(status.daysRemaining)
              ? Math.max(0, status.daysRemaining)
              : null;
          const isExpiringSoon = daysLeft !== null && daysLeft <= 7;
          const isUrgent = daysLeft !== null && daysLeft <= 3;
          const headlineDays =
            daysLeft === null
              ? "Active membership"
              : daysLeft === 0
                ? "Expires today"
                : daysLeft === 1
                  ? "1 day left"
                  : `${daysLeft} days left`;
          return (
          <motion.div
            id="renew"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`mb-10 rounded-2xl border-2 shadow-lg overflow-hidden ${
              isExpiringSoon
                ? "border-red-300 bg-gradient-to-br from-red-50 via-amber-50 to-white"
                : "border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-white"
            }`}
            data-testid="renewal-section"
          >
            <div className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                <div
                  className={`h-14 w-14 shrink-0 rounded-2xl flex items-center justify-center shadow-md ${
                    isExpiringSoon
                      ? "bg-gradient-to-br from-red-500 to-amber-500 text-white"
                      : "bg-gradient-to-br from-amber-400 to-yellow-500 text-white"
                  }`}
                >
                  {isExpiringSoon ? (
                    <AlertTriangle className="h-7 w-7" />
                  ) : (
                    <Crown className="h-7 w-7" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                      {isExpiringSoon
                        ? "Renew Your Plan"
                        : "Current Membership"}
                    </span>
                    {isUrgent && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
                        Urgent
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl md:text-2xl font-extrabold text-gray-900 mb-1">
                    {status.plan} Plan ·{" "}
                    <span
                      className={
                        isExpiringSoon ? "text-red-600" : "text-amber-700"
                      }
                    >
                      {headlineDays}
                    </span>
                  </h2>
                  <div className="flex items-center gap-1.5 text-sm text-gray-700">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <span>
                      Expires on{" "}
                      <strong className="text-gray-900">
                        {format(expDate, "dd MMMM yyyy")}
                      </strong>{" "}
                      at{" "}
                      <strong className="text-gray-900">
                        {format(expDate, "HH:mm")}
                      </strong>
                    </span>
                  </div>
                </div>
                <a
                  href="#plans"
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById("plans")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-white shadow-lg transition-transform hover:scale-105 bg-gradient-to-r from-purple-600 via-fuchsia-600 to-amber-500"
                  data-testid="button-scroll-to-plans"
                >
                  <RefreshCw className="h-4 w-4" />
                  Renew Now
                </a>
              </div>
            </div>
          </motion.div>
          );
        })()}

        <div id="plans" />

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => <div key={i} className="h-96 animate-pulse bg-gray-200 rounded-xl" />)}
          </div>
        ) : (
          <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            {planList.map((plan) => {
              const isPopular = plan.id === "quarterly";
              return (
                <StaggerItem key={plan.id}>
                  <motion.div
                    whileHover={{ y: isPopular ? -4 : -8, boxShadow: isPopular ? "0 32px 60px rgba(0,0,0,0.18)" : "0 24px 48px rgba(0,0,0,0.12)" }}
                    transition={{ type: "spring", stiffness: 300, damping: 22 }}
                    className={`relative flex flex-col bg-white rounded-2xl h-full ${isPopular ? 'border-2 border-primary shadow-xl scale-105 z-10' : 'border border-border/50 shadow-md'}`}
                  >
                    {isPopular && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
                        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-5 py-1.5 rounded-full text-sm font-bold shadow-md flex items-center gap-1"
                      >
                        <Zap className="h-3 w-3" /> {t.membership.mostPopular}
                      </motion.div>
                    )}

                    <CardHeader className="text-center pb-2 pt-8">
                      <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                      {language === "gu" && (
                        <CardDescription className="text-lg font-medium text-primary/80">{plan.nameGu}</CardDescription>
                      )}
                    </CardHeader>

                    <CardContent className="flex-1 pt-6">
                      <motion.div
                        className="text-center mb-8"
                        initial={{ scale: 0.8, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
                      >
                        <span className="text-5xl font-black">₹{plan.price}</span>
                        <span className="text-muted-foreground font-medium">/{plan.durationUnit}</span>
                      </motion.div>

                      <ul className="space-y-3">
                        <motion.li
                          initial={{ opacity: 0, x: -10 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.15 }}
                          className="flex items-start gap-3 -mx-2 px-2 py-1.5 rounded-lg bg-gradient-to-r from-amber-50 to-purple-50 border border-amber-200/60"
                          data-testid="plan-feature-ai-sahayak"
                        >
                          <Sparkles className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                          <span className="text-sm font-bold text-gray-900">
                            24/7 AI Sahayak Support
                          </span>
                        </motion.li>
                        {plan.features
                          .filter((f) => !/ai\s*sahayak/i.test(f))
                          .map((feature, i) => (
                            <motion.li
                              key={i}
                              initial={{ opacity: 0, x: -10 }}
                              whileInView={{ opacity: 1, x: 0 }}
                              viewport={{ once: true }}
                              transition={{ delay: i * 0.07 + 0.25 }}
                              className="flex items-start gap-3"
                            >
                              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                              <span className="text-sm font-medium text-gray-700">{feature}</span>
                            </motion.li>
                          ))}
                      </ul>
                    </CardContent>

                    <CardFooter className="pt-6 pb-8 px-6">
                      <motion.div
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: "spring", stiffness: 400, damping: 18 }}
                        className="w-full"
                      >
                        <Button
                          className="w-full text-lg h-12 font-bold"
                          variant={isPopular ? 'default' : 'outline'}
                          onClick={() => handleSubscribe(plan.id)}
                          disabled={subscribeMutation.isPending}
                        >
                          {subscribeMutation.isPending ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              {t.membership.processing}
                            </span>
                          ) : (
                            t.membership.subscribe
                          )}
                        </Button>
                      </motion.div>
                    </CardFooter>
                  </motion.div>
                </StaggerItem>
              );
            })}
          </Stagger>
        )}

        <FadeInUp delay={0.3} className="mt-10 text-center text-sm text-muted-foreground space-y-1">
          <p>{t.membership.securePayment}</p>
          <p>{t.membership.paymentMethods}</p>
        </FadeInUp>
      </div>
    </div>
  );
}
