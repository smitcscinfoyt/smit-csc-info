import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Sparkles,
  Crown,
  X,
  Lock,
  Send,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";

interface ChatMessage {
  role: "user" | "bot";
  text: string;
}

interface GeminiHistory {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

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

  const [chatOpen, setChatOpen] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<GeminiHistory[]>([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  function handleOpen() {
    if (isPrime) {
      if (messages.length === 0) {
        setMessages([
          {
            role: "bot",
            text: "નમસ્કાર! હું Smit AI Sahayak છું 🙏\nCSC સ્કીમ, document list, સરકારી યોજના — ગુજરાતીમાં પૂછો!",
          },
        ]);
      }
      setChatOpen(true);
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      setShowUpsell(true);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setSending(true);

    try {
      const data = await apiFetch<{ reply: string }>("/api/sahayak/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyRef.current,
          isPrime,
        }),
      });
      const reply = data.reply ?? "ક્ષમા કરશો, ત્રુટિ આવી.";
      historyRef.current = [
        ...historyRef.current,
        { role: "user", parts: [{ text }] },
        { role: "model", parts: [{ text: reply }] },
      ].slice(-20);
      setMessages((prev) => [...prev, { role: "bot", text: reply }]);
    } catch (err: any) {
      const msg =
        err?.data?.error ||
        err?.message ||
        "ક્ષમા કરશો, server સાથે જોડાણ ન થઈ.";
      setMessages((prev) => [...prev, { role: "bot", text: msg }]);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {/* Floating bubble */}
      {!chatOpen && (
        <motion.button
          type="button"
          onClick={handleOpen}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.4 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          aria-label="Open Smit AI Sahayak"
          data-testid="ai-sahayak-bubble"
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-[60] h-14 w-14 rounded-full shadow-2xl flex items-center justify-center text-purple-950 group"
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

      {/* Chat panel */}
      <AnimatePresence>
        {chatOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setChatOpen(false)}
              className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
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
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-3 border-b border-amber-300/20 flex-shrink-0"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,215,0,0.12), rgba(124,58,237,0.18))",
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center shadow flex-shrink-0"
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
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 min-h-0">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex max-w-[85%] text-[13px] leading-relaxed rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "self-end bg-gradient-to-br from-purple-700 to-purple-900 text-amber-100 border border-amber-300/20 rounded-br-sm"
                        : "self-start bg-white/6 text-amber-100/90 border border-amber-300/10 rounded-bl-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
                {sending && (
                  <div className="self-start flex items-center gap-2 px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-white/6 border border-amber-300/10">
                    <Loader2 className="h-3.5 w-3.5 text-amber-300 animate-spin" />
                    <span className="text-[12px] text-amber-300/70">ટાઇપ કરે છે...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex-shrink-0 flex gap-2 items-center p-3 border-t border-amber-300/15 bg-black/20">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="ગુજરાતીમાં લખો..."
                  disabled={sending}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/6 border border-amber-300/20 text-amber-100 placeholder-amber-300/40 text-[13px] outline-none focus:border-amber-400/50 transition-colors disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className="h-10 w-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, #FFD700, #DAA520)",
                  }}
                  aria-label="Send"
                >
                  <Send className="h-4 w-4 text-purple-950" />
                </button>
              </div>

              <div className="flex-shrink-0 text-center py-1.5 text-[10px] text-amber-300/25 border-t border-amber-300/8">
                Smit CSC Info — Powered by Gemini AI
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
            >
              <button
                type="button"
                onClick={() => setShowUpsell(false)}
                aria-label="Close"
                className="absolute top-3 right-3 h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-amber-200 flex items-center justify-center transition-colors z-10"
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
                  onClick={() => { setShowUpsell(false); setLocation("/membership"); }}
                  className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl font-bold text-purple-950 shadow-lg active:scale-[0.98] transition-transform"
                  style={{
                    background:
                      "linear-gradient(135deg, #FFD700 0%, #DAA520 50%, #B8860B 100%)",
                  }}
                >
                  <Crown className="h-4 w-4" />
                  Upgrade to Prime to unlock
                </button>

                {!user && (
                  <button
                    type="button"
                    onClick={() => { setShowUpsell(false); setLocation("/login"); }}
                    className="w-full mt-2 text-xs font-medium text-amber-200/80 hover:text-amber-100 transition-colors py-2"
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
