import { useState, useEffect, useMemo } from "react";
import { useGetDocuments, getGetDocumentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  Search,
  Lock,
  Download,
  ExternalLink,
  Crown,
  ShieldCheck,
  BadgeCheck,
  Activity,
  Newspaper,
  ChevronDown,
  Eye,
  LogIn,
  Maximize2,
  ZoomIn,
  ZoomOut,
  FileCheck2,
  LayoutGrid,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { FadeInUp } from "@/components/motion";
import { useLanguage } from "@/lib/i18n";
import { usePrimeStatus } from "@/hooks/use-prime";
import { useAuth } from "@/hooks/use-auth";
import { PrimeUpgradeModal } from "@/components/prime-gate/PrimeUpgradeModal";
import { LiveDataDashboard } from "@/components/live-data/LiveDataDashboard";
import { NewsPanel } from "@/components/news/NewsPanel";
import { Link } from "wouter";

const FILE_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  PDF:   { icon: "📄", color: "text-red-600",    bg: "bg-red-50" },
  Word:  { icon: "📝", color: "text-blue-600",   bg: "bg-blue-50" },
  PPT:   { icon: "📊", color: "text-orange-600", bg: "bg-orange-50" },
  Image: { icon: "🖼️", color: "text-green-600",  bg: "bg-green-50" },
  File:  { icon: "📁", color: "text-gray-600",   bg: "bg-gray-50" },
};

interface GroupedDoc {
  id: number;
  title: string;
  description: string | null;
  fileUrl: string;
  fileName: string;
  fileType: string;
  category: string;
  isPrime: boolean;
  accessLevel?: string;
  groupId?: string | null;
  wordUrl?: string | null;
  wordFileName?: string | null;
  createdAt: string;
}

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

export default function Documents() {
  const { isPrime } = usePrimeStatus();

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
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const [previewDoc, setPreviewDoc] = useState<GroupedDoc | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [primeModalOpen, setPrimeModalOpen] = useState(false);
  const isAffidavitSection = selectedCategory === "Affidavits";

  // Section 1: Debounce search input by ~200ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: documents, isLoading } = useGetDocuments(undefined, {
    query: { queryKey: getGetDocumentsQueryKey() },
  });

  // Section 2: Category "Affidavits" added to tabs
  const CATEGORIES = [
    { key: "All",           label: t.documents.catAll },
    { key: "General",       label: t.documents.catGeneral },
    { key: "Schemes",       label: t.documents.catSchemes },
    { key: "Forms",         label: t.documents.catForms },
    { key: "Affidavits",    label: t.documents.catAffidavits },
    { key: "Tutorials",     label: t.documents.catTutorials },
    { key: "Guidelines",    label: t.documents.catGuidelines },
    { key: "Notifications", label: t.documents.catNotifications },
  ];

  // Section 3: Group PDF and Word pairs into a single card
  const groupedDocs = useMemo(() => {
    if (!documents) return [];
    const map = new Map<string, GroupedDoc>();

    for (const doc of documents) {
      const key = doc.groupId ? `group_${doc.groupId}` : `title_${doc.title.trim().toLowerCase()}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, {
          id: doc.id,
          title: doc.title,
          description: doc.description ?? null,
          fileUrl: doc.fileUrl,
          fileName: doc.fileName,
          fileType: "PDF", // Card shows only PDF badge/icon per Section 3
          category: doc.category,
          isPrime: doc.isPrime,
          accessLevel: doc.accessLevel,
          groupId: doc.groupId,
          wordUrl: doc.wordUrl ?? (doc.fileType === "Word" ? doc.fileUrl : null),
          wordFileName: doc.wordFileName ?? (doc.fileType === "Word" ? doc.fileName : null),
          createdAt: doc.createdAt,
        });
      } else {
        if (doc.fileType === "PDF") {
          existing.id = doc.id;
          existing.fileUrl = doc.fileUrl;
          existing.fileName = doc.fileName;
        } else if (doc.fileType === "Word" || doc.wordUrl) {
          existing.wordUrl = doc.wordUrl || doc.fileUrl;
          existing.wordFileName = doc.wordFileName || doc.fileName;
        }
        if (doc.isPrime) existing.isPrime = true;
      }
    }

    return Array.from(map.values());
  }, [documents]);

  // Section 1: Filter combined with active category tab and debounced search
  const filtered = groupedDocs.filter((doc) => {
    const q = debouncedSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      doc.title.toLowerCase().includes(q) ||
      (doc.description && doc.description.toLowerCase().includes(q));
    const matchesCategory = selectedCategory === "All" || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const fileInfo = (type: string) => FILE_ICONS[type] ?? FILE_ICONS["File"];

  // Section 4 & 5: Interaction Handlers
  const handleDocClick = (doc: GroupedDoc) => {
    if (!user) {
      setLoginModalOpen(true);
      return;
    }
    setPreviewDoc(doc);
  };

  const handleDownloadClick = (doc: GroupedDoc, format: "pdf" | "word") => {
    if (!user) {
      setLoginModalOpen(true);
      return;
    }
    if (!isPrime) {
      setPrimeModalOpen(true);
      return;
    }
    // Prime direct download
    triggerDownload(doc.id, format);
  };

  function triggerDownload(docId: number, format: "pdf" | "word") {
    const token = typeof window !== "undefined" ? sessionStorage.getItem("auth_token") : null;
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
    const link = document.createElement("a");
    link.href = `/api/documents/${docId}/download?format=${format}${tokenParam}`;
    link.download = "";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ─── Free & Standard View ──────────────────────────────────────────────
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
                  data-testid="documents-search-input"
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
                    data-testid={`filter-${key.toLowerCase()}`}
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

          {!isLoading && filtered.length === 0 && (
            <FadeInUp delay={0.2}>
              <div className="text-center py-20 text-muted-foreground" data-testid="no-documents-found">
                <FileText className="h-14 w-14 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">{t.documents.noResults}</p>
                <p className="text-sm mt-1">{t.documents.noResultsHint}</p>
              </div>
            </FadeInUp>
          )}

          <AnimatePresence>
            <div className={isAffidavitSection
              ? "grid grid-cols-1 md:grid-cols-2 gap-6"
              : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            }>
              {filtered.map((doc, i) => {
                const info = fileInfo(doc.fileType);
                return (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.35 }}
                    whileHover={{ y: -4, boxShadow: "0 12px 32px rgba(0,0,0,0.08)" }}
                  >
                    <Card
                      className={[
                        "h-full overflow-hidden cursor-pointer flex flex-col justify-between transition-all",
                        isAffidavitSection
                          ? "rounded-2xl border-indigo-200/80 bg-white shadow-sm hover:border-indigo-400 hover:shadow-xl"
                          : "border-border/60",
                      ].join(" ")}
                      onClick={() => handleDocClick(doc)}
                      data-testid={`document-card-${doc.id}`}
                    >
                      {isAffidavitSection && <DocumentPreviewTile doc={doc} prime={false} />}
                      <CardContent className={isAffidavitSection
                        ? "p-5 flex items-start gap-4 flex-1"
                        : "p-4 flex items-start gap-4 flex-1"
                      }>
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
                          <div className="flex items-center justify-between mt-2 pt-2 border-t">
                            <div className="flex gap-1.5 items-center">
                              <Badge variant="secondary" className="text-[10px]">{doc.category}</Badge>
                              <span className={`text-[10px] font-medium ${info.color}`}>PDF</span>
                            </div>

                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={isAffidavitSection
                                  ? "h-9 px-3 text-xs text-primary gap-1.5 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10"
                                  : "h-7 px-3 text-[11px] text-primary gap-1 border border-primary/20 bg-primary/5 hover:bg-primary/10"
                                }
                                onClick={() => handleDocClick(doc)}
                              >
                                <Eye className="h-3.5 w-3.5" /> {t.documents.view}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>

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
        </div>

        {/* In-Browser PDF Preview Dialog */}
        <PdfPreviewDialog
          doc={previewDoc}
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          isPrime={isPrime}
          onDownload={handleDownloadClick}
          onOpenPrimeModal={() => setPrimeModalOpen(true)}
        />

        {/* Login Prompt Modal for Logged-Out users */}
        <LoginPromptModal
          isOpen={loginModalOpen}
          onClose={() => setLoginModalOpen(false)}
        />

        {/* Prime Upgrade Modal */}
        <PrimeUpgradeModal
          open={primeModalOpen}
          onOpenChange={setPrimeModalOpen}
        />
      </div>
    );
  }

  // ─── Prime Luxury View ───────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #1a0938 0%, #2d0a5b 25%, #1e1b4b 55%, #0f172a 100%)" }}
      data-testid="prime-documents-page"
    >
      <div className="absolute top-20 -left-32 h-96 w-96 rounded-full bg-purple-600/30 blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 -right-32 h-[28rem] w-[28rem] rounded-full bg-indigo-600/30 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none opacity-[0.04]">
        <div className="flex flex-col items-center gap-2">
          <BadgeCheck className="h-72 w-72 text-amber-300" strokeWidth={1} />
          <div className="text-amber-300 text-2xl font-black tracking-widest">VERIFIED BY SMIT CSC</div>
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 md:py-10">
        {/* Instant Search */}
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

        {/* Filter Pills */}
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

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-2xl animate-pulse"
                style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))", border: "1px solid rgba(218,165,32,0.15)" }} />
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
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

        {/* Document List */}
        <AnimatePresence>
          <div className={isAffidavitSection
            ? "grid grid-cols-1 md:grid-cols-2 gap-6"
            : "space-y-3"
          } data-testid="prime-doc-list">
            {filtered.map((doc, i) => {
              const info = fileInfo(doc.fileType);
              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -2 }}
                  className={[
                    "backdrop-blur-xl transition-all duration-200 group hover:border-amber-300/55 cursor-pointer",
                    isAffidavitSection ? "rounded-3xl p-4 sm:p-5" : "rounded-2xl p-4 sm:p-5",
                  ].join(" ")}
                  onClick={() => handleDocClick(doc)}
                  style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
                    border: "1px solid rgba(218,165,32,0.25)",
                    boxShadow: "0 6px 20px rgba(76,29,149,0.18)",
                  }}
                >
                  {isAffidavitSection && <DocumentPreviewTile doc={doc} prime />}
                  <div className={isAffidavitSection
                    ? "flex flex-col gap-4"
                    : "flex items-start sm:items-center gap-4"
                  }>
                  <div className="flex items-start sm:items-center gap-4">
                    <div className={`${info.bg} rounded-xl p-3 shrink-0 ring-1 ring-amber-300/30 shadow`}>
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
                        <span className="text-[10px] font-bold tracking-wider text-amber-300/80">PDF</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-amber-200 bg-white/5 border border-amber-300/25 hover:bg-white/10 hover:border-amber-300/50"
                        onClick={() => handleDocClick(doc)}
                      >
                        <Eye className="h-3 w-3" /> {t.documents.view}
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold overflow-hidden"
                            style={{
                              background: "linear-gradient(135deg, #FFD700 0%, #DAA520 50%, #B8860B 100%)",
                              color: "#3b0764",
                              boxShadow: "0 4px 12px rgba(218,165,32,0.4)",
                            }}
                          >
                            <Download className="h-3 w-3" />
                            <span>{t.documents.download}</span>
                            <ChevronDown className="h-3 w-3 opacity-70" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => handleDownloadClick(doc, "pdf")}>
                            <span className="text-red-500 mr-2">🔴</span>
                            <span>{t.documents.downloadPdf}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownloadClick(doc, "word")}>
                            <span className="text-blue-500 mr-2">🔵</span>
                            <span>{t.documents.downloadWord}</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
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

      {/* In-Browser PDF Preview Dialog */}
      <PdfPreviewDialog
        doc={previewDoc}
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        isPrime={isPrime}
        onDownload={handleDownloadClick}
        onOpenPrimeModal={() => setPrimeModalOpen(true)}
      />

      {/* Login Prompt Modal for Logged-Out users */}
      <LoginPromptModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
      />

      {/* Prime Upgrade Modal */}
      <PrimeUpgradeModal
        open={primeModalOpen}
        onOpenChange={setPrimeModalOpen}
      />
    </div>
  );
}

function DocumentPreviewTile({ doc, prime }: { doc: GroupedDoc; prime: boolean }) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border min-h-[190px] flex flex-col justify-between p-4",
        prime
          ? "border-amber-300/30 bg-gradient-to-br from-white/[0.12] via-purple-950/30 to-purple-950/80"
          : "border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50",
      ].join(" ")}
      data-testid={`document-preview-tile-${doc.id}`}
    >
      <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-indigo-400/15 blur-2xl pointer-events-none" />
      {prime && <div className="absolute -left-10 -bottom-12 h-32 w-32 rounded-full bg-amber-400/15 blur-2xl pointer-events-none" />}
      <div className="relative flex items-center justify-between gap-3">
        <span className={[
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
          prime ? "bg-amber-400/15 text-amber-200 border border-amber-300/25" : "bg-indigo-600/10 text-indigo-700 border border-indigo-200",
        ].join(" ")}>
          <FileCheck2 className="h-3 w-3" /> {doc.fileType || "PDF"}
        </span>
        <LayoutGrid className={prime ? "h-4 w-4 text-amber-200/60" : "h-4 w-4 text-indigo-400/70"} />
      </div>
      <div className="relative flex flex-1 items-center justify-center py-4">
        <div className={[
          "w-20 h-24 rounded-lg shadow-lg border flex flex-col items-center justify-center gap-2 rotate-[-3deg]",
          prime ? "bg-white/90 border-amber-200/50 text-purple-900" : "bg-white border-indigo-100 text-indigo-700",
        ].join(" ")}>
          <FileText className="h-8 w-8" />
          <span className="text-[9px] font-black tracking-[0.18em]">DOCUMENT</span>
          <span className="h-1 w-10 rounded-full bg-current opacity-20" />
          <span className="h-1 w-7 rounded-full bg-current opacity-20" />
        </div>
      </div>
      <div className={[
        "relative flex items-center gap-1.5 text-xs font-semibold",
        prime ? "text-amber-100/80" : "text-indigo-700/80",
      ].join(" ")}>
        <Eye className="h-3.5 w-3.5" />
        Click to open a readable preview
      </div>
    </div>
  );
}

// ─── Modal 1: In-Browser PDF Viewer with 3-Tier Download Options ─────────────
function PdfPreviewDialog({
  doc,
  isOpen,
  onClose,
  isPrime,
  onDownload,
  onOpenPrimeModal,
}: {
  doc: GroupedDoc | null;
  isOpen: boolean;
  onClose: () => void;
  isPrime: boolean;
  onDownload: (doc: GroupedDoc, format: "pdf" | "word") => void;
  onOpenPrimeModal: () => void;
}) {
  const { t } = useLanguage();
  const [previewData, setPreviewData] = useState<any>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const token = typeof window !== "undefined" ? sessionStorage.getItem("auth_token") : null;
  
  useEffect(() => {
    if (!isOpen || !doc) return;
    setShowPaywall(false); // Reset paywall on new doc
    const currentToken = typeof window !== "undefined" ? sessionStorage.getItem("auth_token") : null;
    fetch("/api/documents/" + doc.id + "/preview-v2", {
      headers: currentToken ? { Authorization: "Bearer " + currentToken } : undefined
    }).then(r => r.ok ? r.json() : null).then(setPreviewData).catch(console.error);
  }, [doc, isOpen]);

  // Document security: Disable context menu and shortcuts for non-Prime users
  useEffect(() => {
    if (!isOpen || isPrime) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'p' || e.key === 's' || e.key === 'P' || e.key === 'S')) {
        e.preventDefault();
      }
    };
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isOpen, isPrime]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isPrime) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // Trigger paywall when scrolled near the bottom (within 20px)
    if (scrollTop + clientHeight >= scrollHeight - 20) {
      setShowPaywall(true);
    }
  };

  if (!doc) return null;

  const previewUrl = "/api/documents/" + doc.id + "/preview" + (token ? "?token=" + encodeURIComponent(token) : "") + (isPrime ? "#toolbar=1" : "#toolbar=0");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="max-w-6xl w-[98vw] h-[92vh] md:h-[94vh] max-h-[96vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border bg-background shadow-2xl select-none"
        onContextMenu={(e) => { if (!isPrime) e.preventDefault(); }}
      >
        <DialogHeader className="px-4 sm:px-6 py-4 border-b bg-muted/40 flex flex-row items-center justify-between space-y-0 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-4">
            <span className="text-2xl">📄</span>
            <div className="min-w-0">
              <DialogTitle className="font-bold text-sm sm:text-base leading-tight truncate">
                {doc.title}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  {doc.category}
                </Badge>
                {!isPrime ? (
                  <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                    Watermarked preview · Download requires Prime
                  </span>
                ) : (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <Crown className="h-3 w-3" /> Prime Clean Preview
                  </span>
                )}
              </div>
            </div>
          </div>

          {isPrime && (
            <div className="flex items-center gap-2 mr-6">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-sm font-semibold h-8 text-xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{t.documents.download}</span>
                    <ChevronDown className="h-3 w-3 opacity-75" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    className="cursor-pointer py-2"
                    onClick={() => onDownload(doc, "pdf")}
                  >
                    <span className="text-red-500 mr-2 text-base">🔴</span>
                    <div className="flex-1">
                      <p className="font-medium text-xs">{t.documents.downloadPdf}</p>
                      <p className="text-[10px] text-muted-foreground">{doc.fileName}</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer py-2"
                    onClick={() => onDownload(doc, "word")}
                  >
                    <span className="text-blue-500 mr-2 text-base">🔵</span>
                    <div className="flex-1">
                      <p className="font-medium text-xs">{t.documents.downloadWord}</p>
                      <p className="text-[10px] text-muted-foreground">Editable Template (.docx)</p>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden bg-slate-100 dark:bg-slate-950 p-2 sm:p-4 relative flex items-center justify-center">
          {!isPrime && previewData?.mode === "free" ? (
            <div className="w-full h-full relative rounded-xl overflow-hidden border bg-white shadow-md">
              <div 
                className={`w-full h-full overflow-y-auto flex flex-col items-center py-4 ${showPaywall ? '!overflow-hidden' : ''}`}
                onScroll={handleScroll}
              >
                <div className={`w-full flex flex-col items-center gap-4 transition-all duration-300 ${showPaywall ? 'blur-md select-none pointer-events-none' : ''}`}>
                  {previewData.images.map((img: string, i: number) => (
                    <img key={i} src={img} className="max-w-full shadow-lg border bg-white pointer-events-none select-none" alt={"Page " + (i+1)} />
                  ))}
                  <div className="p-4 mt-4 bg-amber-50 border border-amber-200 rounded-lg max-w-2xl text-center">
                    <p className="font-bold text-amber-800">Preview limited to {previewData.previewPercent}% of the document.</p>
                    <p className="text-amber-700 text-sm mt-1">Upgrade to Prime to view the full document and remove watermarks.</p>
                  </div>
                </div>
              </div>

              {showPaywall && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                  <div className="bg-white p-8 rounded-2xl text-center max-w-md w-full shadow-2xl border border-amber-200">
                    <Crown className="h-14 w-14 text-amber-500 mx-auto mb-5 drop-shadow-sm" />
                    <h3 className="text-2xl font-black text-purple-950 mb-3 tracking-tight">Unlock Smit CSC Info Prime membership</h3>
                    <p className="text-sm text-gray-600 mb-8 leading-relaxed">
                      You've reached the end of the preview. Upgrade to Prime to access the full document, remove watermarks, and unlock unrestricted downloads.
                    </p>
                    <Button onClick={onOpenPrimeModal} className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-white font-bold h-12 text-base shadow-md">
                      Upgrade to Prime
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <iframe
              key={doc.id + "_" + (token ? "auth" : "anon")}
              src={previewUrl}
              className="w-full h-full min-h-0 rounded-xl border bg-white shadow-md pointer-events-auto"
              title={doc.title}
              onContextMenu={(e) => { if (!isPrime) e.preventDefault(); }}
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t bg-background px-4 py-3 text-xs text-muted-foreground shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1.5">
            <Maximize2 className="h-3.5 w-3.5" />
            Use the browser PDF controls to zoom and fit the document width.
          </span>
          <span className="sm:hidden">Pinch or use PDF controls to zoom.</span>
          <div className="flex items-center gap-2 text-muted-foreground">
            <ZoomOut className="h-3.5 w-3.5" />
            <ZoomIn className="h-3.5 w-3.5" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ??????? Modal 2: Login Prompt for Logged-Out Users (Section 4 & 5) ????????????????????????????????????????
function LoginPromptModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm text-center p-6 space-y-3 rounded-2xl">
        <div className="mx-auto w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <LogIn className="h-6 w-6" />
        </div>
        <DialogTitle className="text-lg font-bold">Login Required</DialogTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          આ દસ્તાવેજ જોવા (Watermarked Preview) અથવા ડાઉનલોડ કરવા માટે તમારા એકાઉન્ટમાં લૉગિન કરવું જરૂરી છે.
        </p>
        <div className="flex gap-2.5 justify-center pt-2">
          <Button variant="outline" size="sm" onClick={onClose} className="w-1/2">
            બંધ કરો
          </Button>
          <Button size="sm" asChild className="w-1/2 bg-indigo-600 hover:bg-indigo-700">
            <Link href="/login">
              Login કરો
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
