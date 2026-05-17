import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { POPULAR_TOOLS, TOOLS, type ToolMeta } from "@/components/tools/tools-data";
import { ArrowRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

function badgeClass(b: ToolMeta["badge"]) {
  if (b === "Gov Ready") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (b === "New") return "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200";
  return "bg-amber-100 text-amber-700 border-amber-200";
}

export function FeaturedTools() {
  // Show "New" tools first, then the most popular ones — so freshly added
  // tools are visible to non-logged-in visitors right on the home page.
  const newOnes = TOOLS.filter((t) => t.badge === "New");
  const seen = new Set(newOnes.map((t) => t.slug));
  const rest = POPULAR_TOOLS.filter((t) => !seen.has(t.slug));
  const featured = [...newOnes, ...rest].slice(0, 9);
  return (
    <section className="py-20 md:py-24 px-4 bg-gradient-to-b from-violet-50/60 via-white to-white">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            Digital Service Tools
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-gray-900">
            Free tools every CSC operator needs
          </h2>
          <p className="text-gray-600 mt-3 max-w-2xl mx-auto text-sm md:text-base">
            Resize PAN photos, compress PDFs, merge Aadhaar — all 100% free, government-portal
            ready, and processed privately in your browser.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-8">
          {featured.map((t, i) => {
            const Icon = t.icon;
            return (
              <motion.div
                key={t.slug}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
              >
                <Link href={`/tools/${t.slug}`}>
                  <div className="group relative h-full bg-white rounded-2xl border border-gray-200/80 p-4 md:p-5 hover:border-indigo-300 hover:shadow-xl hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden">
                    <div
                      className={`absolute -top-10 -right-10 h-28 w-28 rounded-full bg-gradient-to-br ${t.accent} opacity-10 group-hover:opacity-20 transition-opacity`}
                    />
                    <div className="flex items-start justify-between mb-2">
                      <div
                        className={`h-10 w-10 md:h-11 md:w-11 rounded-xl bg-gradient-to-br ${t.accent} flex items-center justify-center shadow-md`}
                      >
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      {t.badge && (
                        <Badge className={`text-[9px] md:text-[10px] font-bold ${badgeClass(t.badge)}`}>
                          {t.badge}
                        </Badge>
                      )}
                    </div>
                    <div className="font-bold text-gray-900 text-sm md:text-base leading-tight">
                      {t.title}
                    </div>
                    <div className="text-[11px] md:text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">
                      {t.short}
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="text-center">
          <Link href="/tools">
            <Button
              size="lg"
              className="bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-bold shadow-lg shadow-indigo-200"
            >
              Explore all tools
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
