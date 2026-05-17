import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { TOOLS_BY_CATEGORY, type ToolMeta } from "@/components/tools/tools-data";
import { Sparkles, Wrench, Crown, ShieldCheck, ArrowRight, BadgeCheck, Flame, Star } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function badgeClass(b: ToolMeta["badge"]) {
  if (b === "Gov Ready") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (b === "New") return "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200";
  if (b === "Prime") return "bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 border-amber-400";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

// Badge styling for the Prime / dark-theme tools page. The non-Prime badges
// (Popular / New / Gov Ready) need a translucent treatment that reads
// clearly on the deep purple background.
function primeCardBadgeClass(b: ToolMeta["badge"]) {
  if (b === "New") return "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-300/40";
  if (b === "Gov Ready") return "bg-emerald-500/15 text-emerald-200 border-emerald-300/40";
  // Popular (and any unknown fallback) — warm orange tone, distinct from gold PRIME.
  return "bg-orange-500/15 text-orange-200 border-orange-300/40";
}

// ─── Free / standard tool card ─────────────────────────────────────────────
function ToolCard({ tool, idx }: { tool: ToolMeta; idx: number }) {
  const Icon = tool.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: idx * 0.04 }}
    >
      <Link href={`/tools/${tool.slug}`}>
        <div className="group relative h-full bg-white rounded-2xl border border-gray-200/80 p-5 hover:border-indigo-300 hover:shadow-xl hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden">
          <div
            className={`absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br ${tool.accent} opacity-10 group-hover:opacity-20 transition-opacity`}
          />
          <div className="flex items-start justify-between mb-3">
            <div
              className={`h-11 w-11 rounded-xl bg-gradient-to-br ${tool.accent} flex items-center justify-center shadow-md`}
            >
              <Icon className="h-5 w-5 text-white" />
            </div>
            {tool.badge && (
              <Badge className={`text-[10px] font-bold ${badgeClass(tool.badge)}`}>
                {tool.badge}
              </Badge>
            )}
          </div>
          <div className="font-bold text-gray-900 text-base leading-tight mb-1">{tool.title}</div>
          <div className="text-xs text-gray-500 leading-relaxed">{tool.short}</div>
          <div className="mt-3 text-xs font-semibold text-indigo-600 group-hover:text-indigo-700">
            Open tool →
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Prime tool card (glassmorphism + gold) ────────────────────────────────
function PrimeToolCard({ tool, idx }: { tool: ToolMeta; idx: number }) {
  const Icon = tool.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6 }}
    >
      <Link href={`/tools/${tool.slug}`}>
        <div
          className="group relative h-full rounded-2xl p-5 cursor-pointer overflow-hidden backdrop-blur-xl transition-all duration-300"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
            border: "1px solid rgba(218,165,32,0.35)",
            boxShadow: "0 8px 28px rgba(76,29,149,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
          data-testid={`prime-tool-card-${tool.slug}`}
        >
          {/* Gold glow on hover */}
          <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ boxShadow: "0 0 0 1px rgba(255,215,0,0.55), 0 0 30px rgba(255,215,0,0.25)" }} />
          {/* Decorative gradient blob */}
          <div className={`absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br ${tool.accent} opacity-25 group-hover:opacity-40 transition-opacity blur-xl`} />

          {/* Badge — gold PRIME only for Prime-locked tools, otherwise show
              the tool's own badge (Popular / New / Gov Ready) in a muted
              dark-theme style so visitors can distinguish at a glance. */}
          {tool.prime ? (
            <div
              className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shadow"
              style={{ background: "linear-gradient(135deg, #FFD700, #DAA520)", color: "#3b0764" }}
              data-testid={`prime-badge-${tool.slug}`}
            >
              <Crown className="h-3 w-3" />
              <span>PRIME</span>
            </div>
          ) : tool.badge && tool.badge !== "Prime" ? (
            <div
              className={`absolute top-3 right-3 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shadow border ${primeCardBadgeClass(tool.badge)}`}
              data-testid={`prime-badge-${tool.slug}`}
            >
              {tool.badge === "Popular" && <Flame className="h-3 w-3" />}
              {tool.badge === "New" && <Sparkles className="h-3 w-3" />}
              {tool.badge === "Gov Ready" && <Star className="h-3 w-3" />}
              <span>{tool.badge.toUpperCase()}</span>
            </div>
          ) : null}

          {/* Icon */}
          <div className="flex items-start justify-between mb-4 relative z-10">
            <div
              className={`h-12 w-12 rounded-xl bg-gradient-to-br ${tool.accent} flex items-center justify-center shadow-lg ring-1 ring-amber-300/50`}
            >
              <Icon className="h-6 w-6 text-white drop-shadow" />
            </div>
          </div>

          {/* Title + subtitle */}
          <div className="font-bold text-white text-base leading-tight mb-1.5 relative z-10">{tool.title}</div>
          <div className="text-xs text-purple-100/75 leading-relaxed mb-4 relative z-10 line-clamp-2">{tool.short}</div>

          {/* Gold gradient open button with shine */}
          <div className="relative z-10">
            <div className="relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold overflow-hidden"
              style={{ background: "linear-gradient(135deg, #FFD700 0%, #DAA520 50%, #B8860B 100%)", color: "#3b0764", boxShadow: "0 4px 12px rgba(218,165,32,0.4)" }}>
              <span className="relative z-10">Open tool</span>
              <ArrowRight className="h-3 w-3 relative z-10 group-hover:translate-x-0.5 transition-transform" />
              {/* Shine sweep */}
              <span
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
                style={{ background: "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)" }}
              />
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Prime banner ──────────────────────────────────────────────────────────
function PrimeBanner({ subtitle }: { subtitle: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-6 rounded-2xl px-5 py-4 flex items-center gap-3 backdrop-blur-xl"
      style={{
        background: "linear-gradient(135deg, rgba(218,165,32,0.18), rgba(124,58,237,0.18))",
        border: "1px solid rgba(218,165,32,0.45)",
        boxShadow: "0 8px 28px rgba(76,29,149,0.25)",
      }}
      data-testid="prime-banner"
    >
      <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-md"
        style={{ background: "linear-gradient(135deg, #FFD700, #DAA520)" }}>
        <Crown className="h-5 w-5 text-purple-950" />
      </div>
      <div className="min-w-0">
        <div className="text-sm sm:text-base font-black bg-gradient-to-r from-amber-200 to-yellow-100 bg-clip-text text-transparent">
          Exclusive Resources for Prime Members
        </div>
        <div className="text-[11px] sm:text-xs text-purple-100/80 mt-0.5">{subtitle}</div>
      </div>
    </motion.div>
  );
}

export default function ToolsPage() {
  const categories = Object.entries(TOOLS_BY_CATEGORY);
  const { user, membership } = useAuth();
  const { data: status } = useQuery<{ is_prime: boolean }>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<{ is_prime: boolean }>("/api/user/status"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const isActiveMember = membership?.status === "active";
  const isPrime = !!status?.is_prime || isActiveMember;

  if (!isPrime) {
    // ─── Free / standard view (unchanged) ───────────────────────────────
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-violet-50/40 via-white to-white">
        <section className="relative bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900 py-16 md:py-24 px-4 overflow-hidden">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-10 left-1/4 h-72 w-72 rounded-full bg-violet-500 blur-3xl" />
            <div className="absolute bottom-10 right-1/4 h-72 w-72 rounded-full bg-indigo-500 blur-3xl" />
          </div>
          <div className="container mx-auto max-w-5xl text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/20 text-white/90 text-xs font-semibold mb-5">
              <Sparkles className="h-3.5 w-3.5" />
              Digital Service Tools
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-white mb-4 leading-tight">
              All-in-one toolkit for CSC operators
            </h1>
            <p className="text-base md:text-lg text-violet-100/90 max-w-2xl mx-auto">
              Resize photos, compress files, merge documents and more — every tool is built for
              Indian government portal requirements. 100% free, 100% private, runs in your browser.
            </p>
          </div>
        </section>

        <section className="container mx-auto max-w-6xl px-4 py-12 md:py-16">
          {categories.map(([cat, tools], ci) => (
            <div key={cat} className={ci > 0 ? "mt-12" : ""}>
              <div className="flex items-center gap-3 mb-5">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <Wrench className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-gray-900">{cat}</h2>
                  <div className="text-xs text-gray-500">
                    {tools.length} tool{tools.length > 1 ? "s" : ""}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tools.map((t, i) => (
                  <ToolCard key={t.slug} tool={t} idx={i} />
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    );
  }

  // ─── Prime view (luxury) ────────────────────────────────────────────────
  return (
    <div
      className="min-h-[calc(100vh-4rem)] relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #1a0938 0%, #2d0a5b 25%, #1e1b4b 55%, #0f172a 100%)",
      }}
      data-testid="prime-tools-page"
    >
      {/* Ambient blurred glow blobs */}
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

      <div className="relative z-10 container mx-auto max-w-6xl px-4 py-8 md:py-10">
        <PrimeBanner subtitle="Premium-grade utilities crafted for Gujarat CSC operators" />

        {/* Hero header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-8"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase mb-3"
            style={{ background: "linear-gradient(135deg, rgba(218,165,32,0.2), rgba(124,58,237,0.2))", border: "1px solid rgba(218,165,32,0.4)", color: "#FCD34D" }}>
            <Sparkles className="h-3 w-3" /> Digital Service Tools
          </div>
          <h1 className="text-3xl md:text-5xl font-black leading-tight">
            <span className="bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
              Your Premium Toolkit
            </span>
          </h1>
          <p className="text-sm md:text-base text-purple-100/80 mt-2 max-w-2xl">
            Every tool, refined for Indian government portal requirements — fast, private, and
            beautifully built for your workflow.
          </p>
        </motion.div>

        {/* Categories */}
        {categories.map(([cat, tools], ci) => (
          <motion.div
            key={cat}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 + ci * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className={ci > 0 ? "mt-10" : ""}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center shadow-lg ring-1 ring-amber-300/40"
                style={{ background: "linear-gradient(135deg, #DAA520, #FFD700)" }}>
                <Wrench className="h-5 w-5 text-purple-950" />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-bold text-white">{cat}</h2>
                <div className="text-[11px] text-purple-200/70">
                  {tools.length} premium tool{tools.length > 1 ? "s" : ""}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tools.map((t, i) => (
                <PrimeToolCard key={t.slug} tool={t} idx={i} />
              ))}
            </div>
          </motion.div>
        ))}

        {/* Trust footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-12 flex items-center justify-center gap-2 text-xs text-purple-200/60"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Verified by Smit CSC · Runs locally in your browser
        </motion.div>
      </div>
    </div>
  );
}

export { BASE };
