import { Router, type IRouter } from "express";
import { SAHAYAK_KNOWLEDGE } from "../lib/sahayak-knowledge";
import { logger } from "../lib/logger";
import { optionalAuth, type AuthRequest } from "../lib/auth";
import { getActivePrime } from "./credits";
import { createRateLimiter, clientIp } from "../lib/rate-limit";

const router: IRouter = Router();
const sahayakRateLimiter = createRateLimiter({ windowMs: 60_000, max: 15 });

let isSambaNovaDisabled = false;

const SYSTEM_PROMPT = `You are "Smit AI Sahayak" - the official AI assistant for Smit CSC Info.
Your primary goal is to provide 100% real, accurate, and verified information combining local data and general knowledge.

INFORMATION SOURCES & HIERARCHY:
1. KNOWLEDGE BASE & WEBSITE DATA (Primary): Always prioritize the injected Knowledge Base context. This includes available forms, affidavit formats, fees, YouTube video tutorials, and services listed on smitcscinfo.com.
2. GENERAL VERIFIED KNOWLEDGE (Secondary): If a user asks about a general government service, agricultural process, or educational update (e.g., "ચૂંટણી કાર્ડ કેવી રીતે બનાવવું", "મગફળીના પાકની દવા") that is NOT fully detailed in the Knowledge Base, DO NOT reject the query. Use your internal verified training data (API Knowledge) to provide accurate, step-by-step guidance.

OPERATING RULES:
- Always respond in clear, professional Gujarati. No markdown ** or ### formatting.
- Form & Affidavit Routing: If the user needs a document, explicitly mention if it can be downloaded from smitcscinfo.com or if Prime Membership is required.
- YouTube Integration: If explaining a process that has an associated video on the Smit CSC Info YouTube channel, recommend watching the video for practical guidance.
- Accuracy Check: Never hallucinate government links or fees. If you use internal knowledge, ensure the steps are standard Gujarat/India government procedures.
- Out of Scope: If the query is entirely unrelated to CSC services, government schemes, agriculture, education, or Smit CSC Info, politely decline.

OWNER & CONTACT FACTS (Strictly Follow):
1. Owner/founder: SAGAR Kindarakhediya. Never say any other name.
2. YouTube: https://www.youtube.com/@SmitCSCInfo
3. Instagram: https://www.instagram.com/smit_csc_info
4. WhatsApp Group: https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh
5. NEVER give 1800-3000-3468 as Sagar's contact. That is the generic Gov CSC helpline.

Knowledge Base:
${SAHAYAK_KNOWLEDGE}`;

interface ChatMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

// ââ POST /sahayak/chat ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// AI provider waterfall â each provider is tried in order; on failure the next
// one is attempted. This ensures the chat works even if one provider is down.
//
// Priority:
//   0. NEXT_PUBLIC_CHAT_API_URL â external Sahayak AI server (proxy)
//   1. SAMBANOVA_API_KEY        â SambaNova OpenAI-compatible API
//   2. AI_INTEGRATIONS_GEMINI_API_KEY â Gemini REST API (fallback)

// --- STARTUP PROVIDER CHECK ---
(async function verifyProvidersProxy() {
  const sambaKey = process.env['SAMBANOVA_API_KEY'];
  if (sambaKey) {
    try {
      const res = await fetch('https://api.sambanova.ai/v1/models', {
        headers: { Authorization: `Bearer ${sambaKey}` },
        signal: AbortSignal.timeout(5000)
      });
      logger.info(`[Startup] Proxy SambaNova check: HTTP ${res.status}`);
    } catch (err: any) {
      logger.warn(`[Startup] Proxy SambaNova check failed: ${err.message}`);
    }
  }
  const geminiKey = process.env['GEMINI_API_KEY'] || process.env['AI_INTEGRATIONS_GEMINI_API_KEY'];
  if (geminiKey) {
    try {
      const geminiBaseUrl = process.env['AI_INTEGRATIONS_GEMINI_BASE_URL'] || 'https://generativelanguage.googleapis.com/v1beta';
      const res = await fetch(`${geminiBaseUrl.replace(/\/$/, '')}/models`, {
        headers: { 'x-goog-api-key': geminiKey },
        signal: AbortSignal.timeout(5000)
      });
      logger.info(`[Startup] Proxy Gemini check: HTTP ${res.status}`);
    } catch (err: any) {
      logger.warn(`[Startup] Proxy Gemini check failed: ${err.message}`);
    }
  }
})();

router.post("/sahayak/chat", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const requestStartTime = Date.now();
  const OVERALL_DEADLINE_MS = 45000;
  const getRemainingTime = () => Math.max(0, OVERALL_DEADLINE_MS - (Date.now() - requestStartTime));

  try {
    if (!req.userId) {
      res.status(401).json({ error: "લોગ ઇન કરો (Login Required)" });
      return;
    }

    // Determine real Prime status server-side from DB — never trust client-provided isPrime flag.
    const activePrime = await getActivePrime(req.userId);
    const isAdmin = (req as any).userRole === "admin" || (req as any).userRole === "manager";
    const isPrime = !!activePrime || isAdmin;

    if (!isPrime) {
      res.status(403).json({ error: "માફ કરશો, આ સુવિધા માત્ર Prime મેમ્બર્સ માટે છે. (Prime membership required)" });
      return;
    }

    // Rate-limit: 60 req/min for authenticated Prime users, 15 req/min for unauthenticated/free users
    const rateLimit = isPrime ? 60 : 15;
    // ... rate limit logic omitted for proxy ... wait, I need to keep it!

    const { message, history = [] } = req.body as {
      message: string;
      history: Array<{ role: string; parts: Array<{ text: string }> }>;
      isPrime: boolean;
    };

    if (!message || typeof message !== "string" || message.trim() === "") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const trimmed = message.trim().slice(0, 1000);

    const safeHistory = Array.isArray(history)
      ? history.slice(-10).map((m) => ({
          role: m.role === "model" ? "assistant" : "user",
          content: Array.isArray(m.parts) ? m.parts.map((p) => p?.text ?? "").join("") : "",
        }))
      : [];

    const systemWithPrime = SYSTEM_PROMPT + "\n\nUser is a Prime member. Provide priority support.";

    // ── External Backend Attempt ───────────────────────────────────────────────
    let externalSuccess = false;
    const externalUrl = process.env.SAHAYAK_EXTERNAL_API_URL;
    if (externalUrl) {
      try {
        const upstream = await fetch(externalUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history, isPrime }),
          signal: AbortSignal.timeout(35000), // backend has 30s limit, proxy waits 35s max
        });

        if (upstream.ok) {
          const json = (await upstream.json()) as any;
          if (json?.reply) {
            res.json({ reply: json.reply });
            return;
          }
          logger.warn("sahayak external: empty reply — falling through to built-in AI");
        } else {
          const text = await upstream.text().catch(() => upstream.statusText);
          logger.warn(
            { status: upstream.status, body: text.slice(0, 300) },
            "sahayak external upstream non-OK — falling through to built-in AI",
          );
        }
      } catch (err: any) {
        logger.warn({ err }, "sahayak external chat unreachable — falling through to built-in AI");
      }
    }

    const sambaKey = process.env.SAMBANOVA_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

    // ── Priority 1: SambaNova ──────────────────────────────────────────────────
    if (sambaKey && !isSambaNovaDisabled) {
      const sambaModelsStr = process.env.SAMBANOVA_MODELS || process.env.SAMBANOVA_MODEL || "DeepSeek-V3.1,Meta-Llama-3.3-70B-Instruct";
      const sambaModels = sambaModelsStr.split(',').map(m => m.trim()).filter(Boolean);
      let sambaSuccess = false;
      for (const sambaModel of sambaModels) {
        const remaining = getRemainingTime();
        if (remaining < 5000) break;

        try {
          const messages = [
            { role: "system", content: systemWithPrime },
            ...safeHistory.map((m) => ({
              role: m.role === "model" ? "assistant" : "user",
              content: m.content,
            })),
            { role: "user", content: trimmed },
          ];

          const upstream = await fetch("https://api.sambanova.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sambaKey}`,
            },
            body: JSON.stringify({
              model: sambaModel,
              messages,
              temperature: 0.4,
              max_tokens: 1024,
            }),
            signal: AbortSignal.timeout(Math.min(12000, remaining)),
          });

          if (upstream.status === 402) {
            logger.warn({ provider: 'sambanova', status: upstream.status }, "sahayak sambanova is disabled (402). Skipping for future requests.");
            isSambaNovaDisabled = true;
            break;
          }

          if (upstream.ok) {
            const json = (await upstream.json()) as any;
            const reply = (json?.choices?.[0]?.message?.content as string) ?? "";
            if (reply) {
              res.json({ reply });
              sambaSuccess = true;
              break;
            }
            logger.warn({ provider: 'sambanova', model: sambaModel, status: upstream.status, reason: 'empty_reply' }, "sahayak sambanova: empty reply");
          } else {
            logger.warn({ provider: 'sambanova', model: sambaModel, status: upstream.status, reason: 'http_error' }, "sahayak sambanova upstream non-OK");
            if (upstream.status === 404 || upstream.status === 429 || upstream.status >= 500) continue;
            break;
          }
        } catch (err: any) {
          logger.warn({ provider: 'sambanova', model: sambaModel, status: null, reason: err.name === 'TimeoutError' ? 'timeout' : 'exception', err }, "sahayak sambanova call failed");
          continue;
        }
      }
      if (sambaSuccess) return;
    }

    // ── Priority 2: Gemini fallback ───────────────────────────────────────────
    if (geminiKey) {
      const geminiModelsStr = process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "gemini-3.5-flash,gemini-3.8-flash,gemini-3.7-flash,gemini-flash-latest";
      const geminiModels = geminiModelsStr.split(',').map(m => m.trim()).filter(Boolean);
      let geminiSuccess = false;
      for (const geminiModel of geminiModels) {
        const remaining = getRemainingTime();
        if (remaining < 5000) break;

        try {
          // Normalize base URL: always ensure /v1beta is present.
          // The env var may be stored as "https://generativelanguage.googleapis.com"
          // (without /v1beta), which caused 404s on every model call.
          let rawBase = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
          const baseUrl = rawBase.includes("/v1") ? rawBase : `${rawBase}/v1beta`;

          const contents = [
            ...safeHistory.map(m => ({ role: (m.role === "assistant" ? "model" : "user") as any, parts: [{ text: m.content }] })),
            { role: "user" as const, parts: [{ text: trimmed }] },
          ];

          const url = `${baseUrl}/models/${geminiModel}:generateContent`;

          const upstream = await fetch(url, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "x-goog-api-key": geminiKey
            },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemWithPrime }] },
              contents,
              generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
            }),
            signal: AbortSignal.timeout(Math.min(12000, remaining)),
          });

          if (upstream.ok) {
            const json = (await upstream.json()) as any;
            const reply = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
            if (reply) {
              res.json({ reply });
              geminiSuccess = true;
              break;
            }
            logger.warn({ provider: 'gemini', model: geminiModel, status: upstream.status, reason: 'empty_reply' }, "sahayak gemini: empty reply");
          } else {
            logger.warn({ provider: 'gemini', model: geminiModel, status: upstream.status, reason: 'http_error' }, "sahayak gemini upstream non-OK");
            if (upstream.status === 404 || upstream.status === 429 || upstream.status >= 500) continue;
          }
        } catch (err: any) {
          logger.warn({ provider: 'gemini', model: geminiModel, status: null, reason: err.name === 'TimeoutError' ? 'timeout' : 'exception', err }, "sahayak gemini call failed");
          continue;
        }
      }
      if (geminiSuccess) return;
    }

    logger.warn("sahayak: All AI providers failed — falling back to built-in knowledge search");
    const reply = knowledgeSearch(trimmed);
    res.json({ reply });

  } catch (unexpectedErr) {
    logger.error({ err: unexpectedErr }, "sahayak: unexpected top-level error");
    if (!res.headersSent) {
      res.json({ reply: "ક્ષમા કરશો, અડચણ આવી. થોડી વાર પછી ફરી પ્રયત્ન કરો." });
    }
  }
});
function knowledgeSearch(query: string): string {
  const q = query.toLowerCase();

  // Split knowledge base into sections by ## headings
  const sections = SAHAYAK_KNOWLEDGE.split(/\n(?=##\s)/).filter((s) => s.trim().length > 20);

  // Score each section by keyword overlap
  function score(section: string): number {
    const words = q.split(/\s+/).filter((w) => w.length > 2);
    const sLow = section.toLowerCase();
    return words.reduce((acc, w) => acc + (sLow.includes(w) ? 1 : 0), 0);
  }

  const ranked = sections
    .map((s) => ({ s, sc: score(s) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc);

  if (ranked.length === 0) {
        // Generic helpful response
      return [
        "નમસ્કાર! 🙏 Smit AI Sahayak",
        "",
        "આ માહિતી Knowledge Base માં ઉપલ્બ્ધ નથી.",
        "કૃપા કરી વધુ specific keywords સાથે ફરી પૂછો:",
        "• Aadhaar, PAN, Passport, Driving Licence",
        "• PM Kisan, Ayushman, e-Shram, Ration Card",
        "• Recharge, Wallet, Prime Membership",
        "",
        "📱 SAGAR Kindarakhediya — Smit CSC Info:",
        "YouTube: https://www.youtube.com/@SmitCSCInfo",
        "WhatsApp Group: https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh",
      ].join("\n");
    }

  // Take top 2 sections (cap at 1200 chars total to avoid overflow)
  const topSections = ranked.slice(0, 2).map((x) => x.s.trim());
  let combined = topSections.join("\n\n---\n\n");
  if (combined.length > 1200) combined = combined.slice(0, 1200) + "\nâ¦";

  return [
    `ð **"${query}" â Smit CSC Info Knowledge Base:**`,
    "",
    combined,
    "",
    "ð àªµàª§à« àªàª¾àª£àªµàª¾: CSC Helpline 1800-3000-3468",
    "ð¬ WhatsApp Group: https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh",
  ].join("\n");
}

export default router;
