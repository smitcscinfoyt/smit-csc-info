import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Sparkles, Crown, X, Lock, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";

const SAHAYAK_APP_URL =
  "https://4d344117-7475-4a77-afc2-97eb084417ae-00-1cp7xayvr76vs.riker.replit.dev/";

declare global {
  interface Window {
    SmitCSCPrime?: boolean;
  }
}

/**
 * Floating "Smit AI Sahayak" chat bubble.
 *
 * Visibility: Always visible to every visitor (logged-out, free, prime).
 * Access:
 *   • Prime members  -> taps open a slide-up chat panel that embeds the
 *                       Smit AI Sahayak app in an iframe.
 *   • Everyone else  -> taps show an "Upgrade to Prime" sheet that
 *                       deep-links to the Membership page.
 */
export function AiSahayakWidget() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: status } = useQuery<{ is_prime: boolean }>({
    queryKey: ["user-status"],
    queryFn: () => apiFetch<{ is_prime: boolean }>("/api/user/status"),
    enabled: !!user,
    staleTime: 60_000,
  });

  const isPrime = !!user && !!status?.is_prime;
  if (typeof window !== "undefined") window.SmitCSCPrime = isPrime;

  const [chatOpen, setChatOpen] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);

  function handleClick() {
    if (isPrime) {
      setChatOpen(true);
      return;
    }
    setShowUpsell(true);
  }

  function goToMembership() {
    setShowUpsell(false);
    setLocation("/membership");
  }

  return (
    <>
      {/* Floating bubble — always visible (hidden while chat panel is open) */}
      {!chatOpen && (
        <motion.button
          type="button"
          onClick={handleClick}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.4 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          aria-label="Open Smit AI Sahayak"
          data-testid="ai-sahayak-bubble"
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-[60] h-14 w-14 rounded-full shadow-2xl shadow-purple-900/40 flex items-center justify-center text-purple-950 group"
          style={{
            background: "linear-gradient(135deg, #FFD700 0%, #DAA520 50%, #B8860B 100%)",
            boxShadow:
              "0 10px 30px rgba(76,29,149,0.45), 0 0 0 3px rgba(255,215,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)",
          }}
        >
          <span className="absolute inset-0 rounded-full bg-amber-300/60 animate-ping opacity-40 pointer-events-none" />
          <MessageCircle className="h-6 w-6 relative z-10" />
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gradient-to-br from-purple-700 to-purple-900 flex items-center justify-center shadow ring-2 ring-amber-300">
            <Crown className="h-2.5 w-2.5 text-amber-300" />
          </span>
          <span className="hidden lg:flex absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap px-3 py-1.5 rounded-lg bg-purple-950 text-amber-200 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
            Smit AI Sahayak
          </span>
        </motion.button>
      )}

      {/* Prime chat panel (iframe) */}
      <AnimatePresence>
        {chatOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setChatOpen(false)}
              className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
              data-testid="ai-sahayak-chat-backdrop"
            />
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-sahayak-chat-title"
              className="fixed z-[71] right-2 left-2 bottom-2 lg:right-6 lg:left-auto lg:bottom-6 lg:w-[400px] h-[min(82vh,640px)] rounded-2xl overflow-hidden shadow-2xl border border-amber-300/40 flex flex-col"
              style={{
                background:
                  "linear-gradient(160deg, #1a0938 0%, #2d0a5b 45%, #3b0764 100%)",
              }}
              data-testid="ai-sahayak-chat-panel"
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-3 border-b border-amber-300/20"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,215,0,0.12), rgba(124,58,237,0.18))",
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center shadow"
                    style={{ background: "linear-gradient(135deg, #FFD700, #DAA520)" }}
                  >
                    <Sparkles className="h-5 w-5 text-purple-950" />
                  </div>
                  <div className="min-w-0">
                    <h3
                      id="ai-sahayak-chat-title"
                      className="text-sm font-extrabold bg-gradient-to-r from-amber-200 to-yellow-100 bg-clip-text text-transparent truncate"
                    >
                      Smit AI Sahayak
                    </h3>
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-300/90">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Prime Member · Online
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  aria-label="Close chat"
                  className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-amber-200 flex items-center justify-center transition-colors"
                  data-testid="ai-sahayak-chat-close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Iframe body */}
              <div className="relative flex-1 bg-white">
                {!iframeLoaded && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-purple-50 to-amber-50">
                    <Loader2 className="h-7 w-7 text-purple-600 animate-spin" />
                    <div className="text-xs font-semibold text-purple-700">
                      Loading Smit AI Sahayak…
                    </div>
                  </div>
                )}
                <iframe
                  src={SAHAYAK_APP_URL}
                  title="Smit AI Sahayak"
                  className="w-full h-full border-0"
                  onLoad={() => setIframeLoaded(true)}
                  allow="clipboard-write; microphone"
                  data-testid="ai-sahayak-iframe"
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Upgrade sheet for non-prime */}
      <AnimatePresence>
        {showUpsell && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUpsell(false)}
              className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-sm"
              data-testid="ai-sahayak-backdrop"
            />
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-sahayak-title"
              className="fixed z-[71] left-1/2 -translate-x-1/2 bottom-6 w-[calc(100%-1.5rem)] max-w-sm rounded-2xl overflow-hidden shadow-2xl border border-amber-300/40"
              style={{
                background:
                  "linear-gradient(160deg, #1a0938 0%, #2d0a5b 45%, #3b0764 100%)",
              }}
              data-testid="ai-sahayak-upsell"
            >
              <button
                type="button"
                onClick={() => setShowUpsell(false)}
                aria-label="Close"
                className="absolute top-3 right-3 h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-amber-200 flex items-center justify-center transition-colors z-10"
                data-testid="ai-sahayak-close"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="p-5 pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg"
                    style={{ background: "linear-gradient(135deg, #FFD700, #DAA520)" }}
                  >
                    <Sparkles className="h-6 w-6 text-purple-950" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300/90">
                      Prime Feature
                    </div>
                    <h3
                      id="ai-sahayak-title"
                      className="text-lg font-extrabold bg-gradient-to-r from-amber-200 to-yellow-100 bg-clip-text text-transparent"
                    >
                      Smit AI Sahayak
                    </h3>
                  </div>
                </div>

                <p className="text-sm text-purple-100/85 leading-relaxed mb-4">
                  24/7 Gujarati AI assistant for CSC operators — instant help on
                  schemes, forms, document tools and more.
                </p>

                <div className="space-y-2 mb-5">
                  {[
                    "Gujarati-first answers, anytime",
                    "Step-by-step scheme & form guidance",
                    "Tool recommendations + quick links",
                  ].map((line) => (
                    <div key={line} className="flex items-start gap-2 text-xs text-amber-100/90">
                      <Lock className="h-3.5 w-3.5 text-amber-300 shrink-0 mt-0.5" />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={goToMembership}
                  className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl font-bold text-purple-950 shadow-lg active:scale-[0.98] transition-transform"
                  style={{
                    background:
                      "linear-gradient(135deg, #FFD700 0%, #DAA520 50%, #B8860B 100%)",
                  }}
                  data-testid="ai-sahayak-upgrade-cta"
                >
                  <Crown className="h-4 w-4" />
                  Upgrade to Prime to unlock
                </button>

                {!user && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowUpsell(false);
                      setLocation("/login");
                    }}
                    className="w-full mt-2 text-xs font-medium text-amber-200/80 hover:text-amber-100 transition-colors py-2"
                    data-testid="ai-sahayak-login"
                  >
                    Already a Prime member? Log in →
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
