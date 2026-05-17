import { useState } from "react";
import { useGetDocuments, getGetDocumentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Search, Lock, Download, ExternalLink, Crown, ShieldCheck, BadgeCheck, Activity, Newspaper } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { FadeInUp } from "@/components/motion";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { LiveDataDashboard } from "@/components/live-data/LiveDataDashboard";
import { NewsPanel } from "@/components/news/NewsPanel";

const FILE_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  PDF:   { icon: "📄", color: "text-red-600",    bg: "bg-red-50" },
  Word:  { icon: "📝", color: "text-blue-600",   bg: "bg-blue-50" },
  PPT:   { icon: "📊", color: "text-orange-600", bg: "bg-orange-50" },
  Image: { icon: "🖼️", color: "text-green-600",  bg: "bg-green-50" },
  File:  { icon: "📁", color: "text-gray-600",   bg: "bg-gray-50" },
};

function StandardDocumentsHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-800 to-violet-800 px-4 py-12 md:py-14">
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-indigo-400/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-violet-400/20 blur-3xl pointer-events-none" />
      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="inline-flex items-center gap-2 border border-white/30 backdrop-blur-sm bg-white/10 px-3 py-1.5 rounded-full text-xs font-bold text-white mb-5">
          <FileText className="h-3.5 w-3.5" /> DOCUMENTS HUB
        </div>
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 md:h-16 md:w-16 rounded-2xl flex items-center justify-center shadow-xl flex-shrink-0 bg-gradient-to-br from-indigo-500 to-violet-600">
            <FileText className="h-7 w-7 md:h-8 md:w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl md:text-5xl font-black leading-tight text-white">
              Documents &amp; Resources
            </h1>
            <p className="text-sm md:text-base mt-1.5 max-w-xl text-indigo-100">
              Government forms, scheme guides, live mandi/weather data and the latest Gujarati news — all in one place.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PrimeDocumentsHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-purple-950 via-purple-900 to-purple-800 px-4 py-12 md:py-14">
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-amber-400/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-purple-500/25 blur-3xl pointer-events-none" />
      {/* faint gold "Verified" watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none opacity-[0.05]">
        <BadgeCheck className="h-64 w-64 text-amber-300" strokeWidth={1} />
      </div>
      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="inline-flex items-center gap-2 border border-amber-300/40 backdrop-blur-sm bg-amber-400/10 px-3 py-1.5 rounded-full text-xs font-bold text-amber-200 mb-5">
          <Crown className="h-3.5 w-3.5" /> PRIME · DOCUMENTS HUB
        </div>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className="h-14 w-14 md:h-16 md:w-16 rounded-2xl flex items-center justify-center shadow-xl flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #FFD700, #DAA520)" }}
            >
              <FileText className="h-7 w-7 md:h-8 md:w-8 text-purple-950" />
            </div>
            <div>
              <h1 className="text-3xl md:text-5xl font-black leading-tight bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
                Documents &amp; Resources
              </h1>
              <p className="text-sm md:text-base mt-1.5 max-w-xl text-amber-100/85">
                Curated forms, scheme guides, live mandi/weather data and the latest Gujarati news — verified for Gujarat CSC operators.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge className="bg-amber-400/20 text-amber-100 border-amber-300/30 hover:bg-amber-400/25">
                  <BadgeCheck className="h-3 w-3 mr-1" /> Verified by Smit CSC
                </Badge>
                <Badge className="bg-amber-400/20 text-amber-100 border-amber-300/30 hover:bg-amber-400/25">
                  <Crown className="h-3 w-3 mr-1" /> Prime Access
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function useIsPrimeUser() {
  const { user, membership } = useAuth();
  const { data: status } = useQuery<{ is_prime: boolean }>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<{ is_prime: boolean }>("/api/user/status"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const isActiveMember = membership?.status === "active";
  return !!user && (!!status?.is_prime || isActiveMember);
}

export default function Documents() {
  const isPrime = useIsPrimeUser();

  const stickyBarCls = isPrime
    ? "sticky top-0 z-20 bg-purple-950/95 backdrop-blur-md border-b border-amber-400/30 shadow-sm"
    : "sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm";

  const tabTriggerCls = isPrime
    ? "shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 border-amber-300/30 bg-purple-900/40 text-amber-200 hover:border-amber-400/60 hover:bg-purple-900/70 transition-all whitespace-nowrap data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-400 data-[state=active]:to-yellow-600 data-[state=active]:text-purple-950 data-[state=active]:border-amber-300 data-[state=active]:shadow-md"
    : "shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 border-gray-200 bg-white text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 transition-all whitespace-nowrap data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-violet-700 data-[state=active]:text-white data-[state=active]:border-indigo-600 data-[state=active]:shadow-md";

  return (
    <Tabs defaultValue="documents" className="w-full">
      {isPrime ? <PrimeDocumentsHero /> : <StandardDocumentsHero />}
      <div className={stickyBarCls}>
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <TabsList className="flex flex-wrap gap-2 bg-transparent p-0 h-auto py-3 justify-start">
            <TabsTrigger value="documents" data-testid="tab-documents" className={tabTriggerCls}>
              <FileText className="h-4 w-4" /> Documents
            </TabsTrigger>
            <TabsTrigger value="live-data" data-testid="tab-live-data" className={tabTriggerCls}>
              <Activity className="h-4 w-4" /> Live Data
            </TabsTrigger>
            <TabsTrigger value="news" data-testid="tab-news" className={tabTriggerCls}>
              <Newspaper className="h-4 w-4" /> Latest Updates
            </TabsTrigger>
          </TabsList>
        </div>
      </div>
      <TabsContent value="documents" className="mt-0">
        <DocumentsBody isPrime={isPrime} />
      </TabsContent>
      <TabsContent value="live-data" className="mt-0">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="mb-5">
            <h1 className="text-2xl font-bold mb-1">Live Data Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Real-time mandi prices, weather &amp; air quality, and reservoir levels —
              sourced from Government of India open APIs and OpenWeatherMap.
            </p>
          </div>
          <LiveDataDashboard />
        </div>
      </TabsContent>
      <TabsContent value="news" className="mt-0">
        <NewsPanel />
      </TabsContent>
    </Tabs>
  );
}

function DocumentsBody({ isPrime }: { isPrime: boolean }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const { data: documents, isLoading } = useGetDocuments({
    query: { queryKey: getGetDocumentsQueryKey() },
  });

  const CATEGORIES = [
    { key: "All",           label: t.documents.catAll },
    { key: "General",       label: t.documents.catGeneral },
    { key: "Schemes",       label: t.documents.catSchemes },
    { key: "Forms",         label: t.documents.catForms },
    { key: "Tutorials",     label: t.documents.catTutorials },
    { key: "Guidelines",    label: t.documents.catGuidelines },
    { key: "Notifications", label: t.documents.catNotifications },
  ];

  const filtered = documents?.filter((doc) => {
    const matchesSearch =
      !search ||
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      (doc.description && doc.description.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory === "All" || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const fileInfo = (type: string) => FILE_ICONS[type] ?? FILE_ICONS["File"];
  const canAccess = (docIsPrime: boolean) => !docIsPrime || isPrime;

  // ─── FREE / standard view (unchanged) ────────────────────────────────────
  if (!isPrime) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <FadeInUp delay={0.1}>
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t.documents.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {CATEGORIES.map(({ key, label }) => {
                const active = selectedCategory === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedCategory(key)}
                    className={[
                      "shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all whitespace-nowrap",
                      active
                        ? "bg-gradient-to-r from-indigo-600 to-violet-700 text-white border-indigo-600 shadow-md"
                        : "bg-white text-gray-700 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </FadeInUp>

          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && filtered?.length === 0 && (
            <FadeInUp delay={0.2}>
              <div className="text-center py-20 text-muted-foreground">
                <FileText className="h-14 w-14 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">{t.documents.noResults}</p>
                <p className="text-sm mt-1">{t.documents.noResultsHint}</p>
              </div>
            </FadeInUp>
          )}

          <AnimatePresence>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered?.map((doc, i) => {
                const info = fileInfo(doc.fileType);
                const accessible = canAccess(doc.isPrime);
                return (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.35 }}
                    whileHover={{ y: -4, boxShadow: "0 12px 32px rgba(0,0,0,0.08)" }}
                  >
                    <Card className="h-full border-border/60 overflow-hidden">
                      <CardContent className="p-4 flex items-start gap-4">
                        <div className={`${info.bg} rounded-xl p-3 shrink-0`}>
                          <span className="text-2xl">{info.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="font-semibold text-sm leading-tight line-clamp-2">{doc.title}</h3>
                            {doc.isPrime && (
                              <Badge className="bg-yellow-500 text-white shrink-0 text-[10px] px-1.5 py-0.5">
                                <Lock className="h-2.5 w-2.5 mr-0.5" />PRIME
                              </Badge>
                            )}
                          </div>
                          {doc.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{doc.description}</p>
                          )}
                          <div className="flex items-center justify-between">
                            <div className="flex gap-1.5 items-center">
                              <Badge variant="secondary" className="text-[10px]">{doc.category}</Badge>
                              <span className={`text-[10px] font-medium ${info.color}`}>{doc.fileType}</span>
                            </div>
                            {accessible ? (
                              <div className="flex gap-1">
                                <a
                                  href={doc.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" /> {t.documents.view}
                                </a>
                                <a
                                  href={doc.fileUrl}
                                  download={doc.fileName}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline ml-2"
                                >
                                  <Download className="h-3 w-3" /> {t.documents.download}
                                </a>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Lock className="h-3 w-3" />
                                <span>{t.documents.primeOnly}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>

          {!isPrime && documents && documents.some((d) => d.isPrime) && (
            <FadeInUp delay={0.3}>
              <div className="mt-10 rounded-2xl bg-gradient-to-r from-primary/10 to-blue-500/10 border border-primary/20 p-6 text-center">
                <Lock className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-bold text-lg mb-1">{t.documents.unlockTitle}</h3>
                <p className="text-muted-foreground text-sm mb-4">{t.documents.unlockDesc}</p>
                <Button asChild>
                  <a href="/membership">{t.documents.viewPrimePlans}</a>
                </Button>
              </div>
            </FadeInUp>
          )}
        </div>
      </div>
    );
  }

  // ─── PRIME view (luxury) ────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #1a0938 0%, #2d0a5b 25%, #1e1b4b 55%, #0f172a 100%)" }}
      data-testid="prime-documents-page"
    >
      {/* Ambient blur blobs */}
      <div className="absolute top-20 -left-32 h-96 w-96 rounded-full bg-purple-600/30 blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 -right-32 h-[28rem] w-[28rem] rounded-full bg-indigo-600/30 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />

      {/* "Verified by Smit CSC" watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none opacity-[0.04]">
        <div className="flex flex-col items-center gap-2">
          <BadgeCheck className="h-72 w-72 text-amber-300" strokeWidth={1} />
          <div className="text-amber-300 text-2xl font-black tracking-widest">VERIFIED BY SMIT CSC</div>
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 md:py-10">
        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18 }}
          className="mb-5"
        >
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-300/80" />
            <input
              placeholder={t.documents.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="prime-search"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-amber-300/25 text-white placeholder:text-purple-200/50 focus:outline-none focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/30 transition-all"
            />
          </div>
        </motion.div>

        {/* Golden pill filters */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.24 }}
          className="flex flex-wrap gap-2 mb-7"
        >
          {CATEGORIES.map(({ key, label }) => {
            const active = selectedCategory === key;
            return (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                data-testid={`prime-filter-${key.toLowerCase()}`}
                className="px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 border"
                style={
                  active
                    ? {
                        background: "linear-gradient(135deg, #FFD700, #DAA520)",
                        color: "#3b0764",
                        borderColor: "rgba(255,215,0,0.85)",
                        boxShadow: "0 4px 14px rgba(218,165,32,0.45), inset 0 1px 0 rgba(255,255,255,0.4)",
                      }
                    : {
                        background: "rgba(255,255,255,0.05)",
                        color: "rgba(252,211,77,0.85)",
                        borderColor: "rgba(218,165,32,0.3)",
                        backdropFilter: "blur(8px)",
                      }
                }
              >
                {label}
              </button>
            );
          })}
        </motion.div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-2xl animate-pulse"
                style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))", border: "1px solid rgba(218,165,32,0.15)" }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filtered?.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
            data-testid="prime-empty-state"
          >
            <div className="inline-flex h-16 w-16 rounded-2xl items-center justify-center mb-4 ring-1 ring-amber-300/30"
              style={{ background: "linear-gradient(135deg, rgba(218,165,32,0.15), rgba(124,58,237,0.15))" }}>
              <FileText className="h-8 w-8 text-amber-300/80" />
            </div>
            <p className="text-lg font-bold text-amber-100">{t.documents.noResults}</p>
            <p className="text-sm text-purple-200/70 mt-1">{t.documents.noResultsHint}</p>
          </motion.div>
        )}

        {/* Document list (clean rows with gold download accents) */}
        <AnimatePresence>
          <div className="space-y-3" data-testid="prime-doc-list">
            {filtered?.map((doc, i) => {
              const info = fileInfo(doc.fileType);
              const accessible = canAccess(doc.isPrime);
              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -2 }}
                  className="rounded-2xl p-4 sm:p-5 backdrop-blur-xl transition-all duration-200 group hover:border-amber-300/55"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
                    border: "1px solid rgba(218,165,32,0.25)",
                    boxShadow: "0 6px 20px rgba(76,29,149,0.18)",
                  }}
                >
                  <div className="flex items-start sm:items-center gap-4">
                    <div
                      className={`${info.bg} rounded-xl p-3 shrink-0 ring-1 ring-amber-300/30 shadow`}
                    >
                      <span className="text-2xl">{info.icon}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-bold text-sm sm:text-base text-white leading-tight line-clamp-1">{doc.title}</h3>
                        {doc.isPrime && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
                            style={{ background: "linear-gradient(135deg, #FFD700, #DAA520)", color: "#3b0764" }}>
                            <Crown className="h-2.5 w-2.5" /> PRIME
                          </span>
                        )}
                      </div>
                      {doc.description && (
                        <p className="text-xs text-purple-100/70 line-clamp-1 mb-2">{doc.description}</p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-700/40 text-purple-100 border border-purple-400/20">
                          {doc.category}
                        </span>
                        <span className="text-[10px] font-bold tracking-wider text-amber-300/80">{doc.fileType}</span>
                      </div>
                    </div>

                    {accessible ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-amber-200 bg-white/5 border border-amber-300/25 hover:bg-white/10 hover:border-amber-300/50 transition-all"
                          data-testid={`prime-doc-view-${doc.id}`}
                        >
                          <ExternalLink className="h-3 w-3" /> {t.documents.view}
                        </a>
                        <a
                          href={doc.fileUrl}
                          download={doc.fileName}
                          className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold overflow-hidden transition-all hover:shadow-lg"
                          style={{ background: "linear-gradient(135deg, #FFD700 0%, #DAA520 50%, #B8860B 100%)", color: "#3b0764", boxShadow: "0 4px 12px rgba(218,165,32,0.4)" }}
                          data-testid={`prime-doc-download-${doc.id}`}
                        >
                          <Download className="h-3 w-3 relative z-10" />
                          <span className="relative z-10">{t.documents.download}</span>
                          <span
                            className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
                            style={{ background: "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)" }}
                          />
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[11px] text-purple-200/70 shrink-0">
                        <Lock className="h-3 w-3" />
                        <span>{t.documents.primeOnly}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-10 flex items-center justify-center gap-2 text-xs text-purple-200/60"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Verified by Smit CSC · Updated regularly
        </motion.div>
      </div>
    </div>
  );
}
