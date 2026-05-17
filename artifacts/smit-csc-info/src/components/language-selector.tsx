import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Globe } from "lucide-react";
import { useLanguage, type Language } from "@/lib/i18n";

interface LangOption {
  code:   Language;
  native: string;
  label:  string;
  icon:   React.ReactNode;
  badge?: string;
}

const LANGUAGES: LangOption[] = [
  {
    code:   "en",
    native: "English",
    label:  "English",
    icon:   <span className="text-base leading-none">🌐</span>,
    badge:  "GB",
  },
  {
    code:   "gu",
    native: "ગુજરાતી",
    label:  "Gujarati",
    icon:   <span className="text-base leading-none">🇮🇳</span>,
  },
  {
    code:   "hi",
    native: "हिन्दी",
    label:  "Hindi",
    icon:   <span className="text-base leading-none">🇮🇳</span>,
  },
];

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">

      {/* ── Trigger button ── */}
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="hidden sm:inline leading-none">{current.native}</span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0"
        >
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </motion.div>
      </motion.button>

      {/* ── Dropdown ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 mt-2 w-48 bg-background border border-border rounded-xl shadow-xl z-[200] overflow-hidden"
          >
            {LANGUAGES.map((lang, i) => (
              <motion.button
                key={lang.code}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => {
                  setLanguage(lang.code);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors hover:bg-primary/5 ${
                  language === lang.code
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-foreground"
                }`}
              >
                {/* Flag / globe icon — one only */}
                <span className="flex-shrink-0 w-6 flex justify-center">
                  {lang.icon}
                </span>

                {/* Language name + subtitle */}
                <span className="flex-1 flex flex-col min-w-0">
                  <span className="leading-snug">{lang.native}</span>
                  {lang.native !== lang.label && (
                    <span className="text-xs text-muted-foreground leading-snug">
                      {lang.label}
                    </span>
                  )}
                </span>

                {/* GB badge for English */}
                {lang.badge && (
                  <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground tracking-wide">
                    {lang.badge}
                  </span>
                )}

                {/* Active dot */}
                {language === lang.code && (
                  <motion.div
                    layoutId="lang-check"
                    className="flex-shrink-0 h-2 w-2 rounded-full bg-primary"
                  />
                )}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
