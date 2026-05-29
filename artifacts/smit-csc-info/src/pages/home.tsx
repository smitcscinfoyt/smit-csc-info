import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Video, FileText, Smartphone, ArrowRight, BookOpen, Bell, Star, Shield, Zap, Users, Play, Crown } from "lucide-react";
import { useGetMembershipPlans, getGetMembershipPlansQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { HeroText, Stagger, StaggerItem, FadeInUp } from "@/components/motion";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { MemberStoriesSlider } from "@/components/member-stories-slider";
import { FeaturedTools } from "@/components/featured-tools";
import { apiFetch } from "@/lib/api";

export default function Home() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const isStaff = user?.role === "admin" || user?.role === "manager";
  const { data: status } = useQuery<{ is_prime: boolean }>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<{ is_prime: boolean }>("/api/user/status"),
    enabled: !!user && !isStaff,
    staleTime: 60_000,
  });
  const isPrime = !!status?.is_prime;

  // The marketing home page is shown to EVERY visitor — including admins/managers.
  // Admins reach the admin panel via the dedicated shield icon in the navbar.

  const { data: plans, isLoading: isLoadingPlans } = useGetMembershipPlans({
    query: { queryKey: getGetMembershipPlansQueryKey() }
  });
  const planList = Array.isArray(plans) ? plans : [];

  const handleJoinNow = () => {
    if (user) {
      setLocation("/membership");
    } else {
      setLocation("/register");
    }
  };

  const features = [
    { icon: Video, title: t.home.feature1Title, desc: t.home.feature1Desc, gradient: "from-blue-500 to-indigo-600", bg: "bg-blue-50" },
    { icon: FileText, title: t.home.feature2Title, desc: t.home.feature2Desc, gradient: "from-green-500 to-emerald-600", bg: "bg-green-50" },
    { icon: Smartphone, title: t.home.feature3Title, desc: t.home.feature3Desc, gradient: "from-purple-500 to-violet-600", bg: "bg-purple-50" },
    { icon: Bell, title: t.home.feature4Title, desc: t.home.feature4Desc, gradient: "from-orange-500 to-amber-600", bg: "bg-orange-50" },
  ];

  const howItWorks = [
    { step: "01", title: t.home.step1Title, desc: t.home.step1Desc },
    { step: "02", title: t.home.step2Title, desc: t.home.step2Desc },
    { step: "03", title: t.home.step3Title, desc: t.home.step3Desc },
  ];

  const trustBadges = [
    { icon: Shield, label: t.home.trustBadge1, color: "text-indigo-600 bg-indigo-50" },
    { icon: Star, label: t.home.trustBadge2, color: "text-amber-600 bg-amber-50" },
    { icon: Smartphone, label: t.home.trustBadge3, color: "text-green-600 bg-green-50" },
    { icon: CheckCircle2, label: t.home.trustBadge4, color: "text-blue-600 bg-blue-50" },
  ];

  const { data: platformStats } = useQuery<{ members: number; transactions: number; states: number; priceFrom: number }>({
    queryKey: ["platform-stats"],
    queryFn: () => apiFetch<{ members: number; transactions: number; states: number; priceFrom: number }>("/api/stats"),
    staleTime: 5 * 60_000,
  });

  function formatCount(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K+`;
    return `${n}+`;
  }

  const stats = [
    { value: platformStats ? formatCount(platformStats.members) : "500+", label: t.home.statLabel1 },
    { value: platformStats ? formatCount(platformStats.transactions) : "10K+", label: t.home.statLabel2 },
    { value: platformStats ? String(platformStats.states) : "33", label: t.home.statLabel3 },
    { value: platformStats ? `₹${platformStats.priceFrom}` : "₹299", label: t.home.statLabel4 },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* ── Hero ── */}
      <section className={`relative py-20 md:py-32 px-4 overflow-hidden ${
        isPrime
          ? "bg-gradient-to-br from-purple-950 via-purple-900 to-amber-900"
          : "bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900"
      }`}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-400/30 to-purple-400/20 blur-3xl"
            animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-gradient-to-br from-blue-400/20 to-indigo-400/30 blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          />
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-radial from-violet-500/10 to-transparent blur-2xl"
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
          />
        </div>

        <div className="container mx-auto max-w-5xl text-center relative z-10">
          <HeroText delay={0}>
            <motion.div
              className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white/90 border border-white/20 px-4 py-1.5 rounded-full text-sm font-semibold mb-8"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              {t.home.badge}
            </motion.div>
          </HeroText>

          <HeroText delay={0.15}>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight text-white mb-6 leading-tight">
              {t.home.heroTitle}
            </h1>
          </HeroText>

          <HeroText delay={0.28}>
            <p className="text-lg md:text-xl text-white/70 mb-10 max-w-2xl mx-auto leading-relaxed">
              {t.home.heroSub}
            </p>
          </HeroText>

          <HeroText delay={0.4}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {isPrime ? (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
                  <Button
                    size="lg"
                    onClick={() => setLocation("/dashboard")}
                    className="w-full sm:w-auto text-base h-13 px-8 font-bold bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 hover:from-amber-500 hover:via-yellow-600 hover:to-amber-700 border-0 shadow-lg shadow-amber-900/40 text-indigo-950"
                    data-testid="button-prime-access"
                  >
                    <Crown className="mr-2 h-5 w-5" /> Prime Access
                  </Button>
                </motion.div>
              ) : (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
                  <Button
                    size="lg"
                    onClick={handleJoinNow}
                    className="w-full sm:w-auto text-base h-13 px-8 font-bold bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 border-0 shadow-lg shadow-indigo-900/40"
                  >
                    {t.home.joinNow} <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </motion.div>
              )}
              <Link href="/content">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
                  <Button size="lg" variant="outline" className="w-full sm:w-auto text-base h-13 px-8 font-semibold bg-white/10 backdrop-blur-sm text-white border-white/30 hover:bg-white/20 hover:text-white">
                    <Play className="mr-2 h-5 w-5" /> {t.home.browseContent}
                  </Button>
                </motion.div>
              </Link>
            </div>
          </HeroText>

          <HeroText delay={0.55}>
            <div className="flex flex-wrap items-center justify-center gap-6 mt-14 text-sm text-white/60">
              {[t.home.stat1, t.home.stat2, t.home.stat3].map((stat, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                  <span className="font-medium">{stat}</span>
                </div>
              ))}
            </div>
          </HeroText>
        </div>
      </section>

      {/* ── Featured Tools ── */}
      <FeaturedTools />

      {/* ── Stats Bar ── */}
      <section className="bg-white border-b py-8 px-4">
        <div className="container mx-auto max-w-4xl">
          <Stagger className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {stats.map(({ value, label }) => (
              <StaggerItem key={label}>
                <div className="py-2">
                  <div className="text-2xl md:text-3xl font-black text-primary mb-1">{value}</div>
                  <div className="text-sm text-muted-foreground font-medium">{label}</div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 md:py-28 px-4 bg-gray-50/80">
        <div className="container mx-auto max-w-6xl">
          <FadeInUp className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
              <Zap className="h-4 w-4" /> {t.home.whyChooseUsBadge}
            </div>
            <h2 className="text-3xl md:text-4xl font-black mb-4 text-foreground">{t.home.featuresTitle}</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{t.home.featuresSub}</p>
          </FadeInUp>
          <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map(({ icon: Icon, title, desc, gradient, bg }) => (
              <StaggerItem key={title}>
                <motion.div
                  whileHover={{ y: -8, boxShadow: "0 24px 48px rgba(79,70,229,0.12)" }}
                  transition={{ type: "spring", stiffness: 320, damping: 24 }}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 h-full flex flex-col"
                >
                  <div className={`h-12 w-12 rounded-xl ${bg} flex items-center justify-center mb-5 shrink-0`}>
                    <div className={`h-6 w-6 bg-gradient-to-br ${gradient} rounded-lg flex items-center justify-center`}>
                      <Icon className="h-3.5 w-3.5 text-white" />
                    </div>
                  </div>
                  <h3 className="font-bold text-base mb-2 text-foreground">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed flex-1">{desc}</p>
                </motion.div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── How It Works ── (hidden for Prime members) */}
      {!isPrime && (
      <section className="py-20 md:py-28 px-4 bg-white">
        <div className="container mx-auto max-w-4xl">
          <FadeInUp className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
              <BookOpen className="h-4 w-4" /> {t.home.howItWorksBadge}
            </div>
            <h2 className="text-3xl md:text-4xl font-black mb-4">{t.home.howItWorksTitle}</h2>
            <p className="text-muted-foreground text-lg">{t.home.howItWorksSub}</p>
          </FadeInUp>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-10 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-indigo-200 via-purple-200 to-indigo-200" />
            {howItWorks.map(({ step, title, desc }, i) => (
              <FadeInUp key={step} delay={i * 0.12}>
                <div className="text-center relative">
                  <motion.div
                    whileHover={{ scale: 1.08 }}
                    transition={{ type: "spring", stiffness: 360, damping: 22 }}
                    className="h-20 w-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-200"
                  >
                    <span className="text-2xl font-black text-white">{step}</span>
                  </motion.div>
                  <h3 className="font-bold text-lg mb-2 text-foreground">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
                </div>
              </FadeInUp>
            ))}
          </div>
        </div>
      </section>

      )}

      {/* ── Plans ── (hidden for Prime members) */}
      {!isPrime && (
      <section className="py-20 md:py-28 px-4 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto max-w-5xl">
          <FadeInUp className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
              <Star className="h-4 w-4 fill-current" /> {t.home.plansTitle}
            </div>
            <h2 className="text-3xl md:text-4xl font-black mb-4 text-foreground">{t.home.plansTitle}</h2>
            <p className="text-muted-foreground text-lg">{t.home.plansSub}</p>
          </FadeInUp>
          {isLoadingPlans ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => <div key={i} className="h-96 animate-pulse bg-gray-200 rounded-2xl" />)}
            </div>
          ) : (
            <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start">
              {planList.map((plan) => {
                const isPopular = plan.name === "Quarterly";
                return (
                  <StaggerItem key={plan.id}>
                    <motion.div
                      whileHover={{ y: isPopular ? -4 : -8, boxShadow: isPopular ? "0 32px 64px rgba(79,70,229,0.22)" : "0 24px 48px rgba(0,0,0,0.10)" }}
                      transition={{ type: "spring", stiffness: 300, damping: 22 }}
                      className={`relative flex flex-col rounded-2xl h-full overflow-hidden ${
                        isPopular
                          ? "bg-gradient-to-br from-indigo-600 to-violet-700 border-0 shadow-2xl shadow-indigo-200 scale-105 z-10"
                          : "bg-white border border-gray-200 shadow-md"
                      }`}
                    >
                      {isPopular && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4, type: "spring" }}
                          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-5 py-1.5 rounded-full text-xs font-black shadow-lg flex items-center gap-1"
                        >
                          <Zap className="h-3 w-3" /> {t.home.mostPopular}
                        </motion.div>
                      )}

                      <div className={`px-6 pt-8 pb-4 ${isPopular ? "text-white" : ""}`}>
                        <h3 className={`text-xl font-bold mb-1 ${isPopular ? "text-white" : "text-foreground"}`}>{plan.name}</h3>
                        {language === "gu" && (
                          <p className={`text-sm mb-3 ${isPopular ? "text-white/70" : "text-muted-foreground"}`}>{plan.nameGu}</p>
                        )}
                        <div className="flex items-end gap-1 my-5">
                          <span className={`text-5xl font-black ${isPopular ? "text-white" : "text-foreground"}`}>₹{plan.price}</span>
                          <span className={`text-base font-medium mb-2 ${isPopular ? "text-white/70" : "text-muted-foreground"}`}>/{plan.durationUnit}</span>
                        </div>
                      </div>

                      <div className="px-6 flex-1 pb-4">
                        <ul className="space-y-3">
                          {plan.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-3">
                              <CheckCircle2 className={`h-5 w-5 shrink-0 mt-0.5 ${isPopular ? "text-green-300" : "text-green-500"}`} />
                              <span className={`text-sm font-medium ${isPopular ? "text-white/90" : "text-gray-700"}`}>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="px-6 pb-7 pt-4">
                        <Link href="/membership" className="w-full">
                          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                            <Button
                              className={`w-full h-12 text-base font-bold rounded-xl ${
                                isPopular
                                  ? "bg-white text-indigo-700 hover:bg-white/90 border-0 shadow-lg"
                                  : "bg-gradient-to-r from-indigo-600 to-violet-700 text-white border-0 hover:from-indigo-700 hover:to-violet-800 shadow-md"
                              }`}
                            >
                              {t.home.choosePlan} <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                          </motion.div>
                        </Link>
                      </div>
                    </motion.div>
                  </StaggerItem>
                );
              })}
            </Stagger>
          )}
        </div>
      </section>
      )}

      {/* ── Testimonials / Live Reviews — Slider ── */}
      <section className="py-20 md:py-28 px-4 bg-white">
        <div className="container mx-auto max-w-6xl">
          <FadeInUp className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-yellow-100 text-yellow-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
              <Users className="h-4 w-4" /> {t.home.memberStoriesBadge}
            </div>
            <h2 className="text-3xl md:text-4xl font-black mb-4">{t.home.testimonialsTitle}</h2>
            <p className="text-muted-foreground text-lg">{t.home.testimonialsSub}</p>
          </FadeInUp>

          <MemberStoriesSlider />
        </div>
      </section>

      {/* ── Trust Badges ── */}
      <section className="py-12 px-4 bg-gray-50/80 border-y">
        <div className="container mx-auto max-w-4xl">
          <Stagger className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {trustBadges.map(({ icon: Icon, label, color }) => (
              <StaggerItem key={label}>
                <div className="flex flex-col items-center gap-2 py-2">
                  <div className={`h-10 w-10 rounded-xl ${color} flex items-center justify-center`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold text-gray-600 text-center leading-snug">{label}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── Final CTA ── (hidden for Prime members) */}
      {!isPrime && (
      <section className="relative bg-gradient-to-br from-indigo-900 via-violet-900 to-indigo-950 py-20 md:py-28 px-4 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute top-0 right-0 w-72 h-72 rounded-full bg-violet-500/20 blur-3xl"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-indigo-400/20 blur-3xl"
            animate={{ scale: [1.1, 1, 1.1] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <div className="container mx-auto max-w-3xl text-center relative z-10">
          <FadeInUp>
            <h2 className="text-3xl md:text-5xl font-black text-white mb-6 leading-tight">{t.home.ctaTitle}</h2>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <p className="text-white/70 mb-10 text-lg leading-relaxed max-w-xl mx-auto">{t.home.ctaSub}</p>
          </FadeInUp>
          <FadeInUp delay={0.2}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.96 }} className="inline-block">
                <Button
                  size="lg"
                  onClick={handleJoinNow}
                  className="h-13 px-10 text-base font-bold bg-gradient-to-r from-indigo-400 to-violet-500 hover:from-indigo-500 hover:to-violet-600 border-0 shadow-xl shadow-indigo-950/40 text-white"
                >
                  {t.home.getStarted} <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </motion.div>
              <Link href="/membership">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="inline-block">
                  <Button size="lg" variant="outline" className="h-13 px-8 text-base font-semibold bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white">
                    {t.home.viewPlans}
                  </Button>
                </motion.div>
              </Link>
            </div>
          </FadeInUp>
        </div>
      </section>
      )}

    </div>
  );
}
