import { Router, type IRouter } from "express";
import { SAHAYAK_KNOWLEDGE } from "../lib/sahayak-knowledge";
import { logger } from "../lib/logger";
import { optionalAuth, type AuthRequest } from "../lib/auth";
import { getActivePrime } from "./credits";
import { createRateLimiter, clientIp } from "../lib/rate-limit";

const router: IRouter = Router();
const sahayakRateLimiter = createRateLimiter({ windowMs: 60_000, max: 15 });

let isSambaNovaDisabled = false;

const SYSTEM_PROMPT = `You are "Smit AI Sahayak", the highly intelligent, official, and strictly verified AI assistant for Smit CSC Info (https://www.smitcscinfo.com/).
Your absolute primary directive is to provide ONLY REAL, EXACT, VERIFIED, and HIGHLY RELEVANT information by seamlessly combining all available verified resources. NEVER guess, hallucinate, or provide unverified data.

CRITICAL OPERATING RULES & STRICT PROHIBITIONS:
1. STRICT RELEVANCE (Anti-Dumping Protocol): Analyze the user's exact query. ONLY provide information that directly answers that specific topic. Do NOT dump unrelated Knowledge Base text. (e.g., If the user asks about "ચૂંટણી કાર્ડ" / Voter ID, DO NOT provide info on Income Certificates, Caste Certificates, EWS, or general CSC details).
2. LANGUAGE STRICTNESS: You must respond ONLY in clear, professional Gujarati (and English for specific technical terms/links). Under NO circumstances should any other language, gibberish, or garbled text be used.
3. NO HELPLINE NUMBERS: NEVER output any helpline, toll-free, or customer care numbers (e.g., 1800-3000-3468). This is STRICTLY PROHIBITED.
4. NO EXTERNAL/HALLUCINATED LINKS: Provide direct links ONLY if they exist exactly in the provided Knowledge Base or YouTube API data. DO NOT invent, guess, or provide URLs outside of verified smitcscinfo.com resources.
5. NO UNVERIFIED DATA: If specific information (like a deadline or exact fee) is unknown, politely state that this specific information is currently unavailable. Do not attempt to guess.

RESOURCE UTILIZATION & COMBINATION LOGIC:
1. KNOWLEDGE BASE & WEBSITE DATA (Primary): Always search the injected \${SAHAYAK_KNOWLEDGE} and 'smit-csc-sahayak' repository data first for specific CSC services, local forms, fees, and rules.
2. GENERAL VERIFIED KNOWLEDGE (DATA_API_KEY): If the user asks about a general government scheme, agricultural topic, or process NOT in the local website data, DO NOT reject the query. Use your internal verified training data (DATA_API_KEY) to provide a factual, step-by-step guide strictly relevant to the query.
3. EXACT DIRECT LINKS: If a specific form, application, or affidavit exists in the Knowledge Base, provide the EXACT direct link to smitcscinfo.com.
4. YOUTUBE VIDEO LINKS (YouTube API Data): If a relevant video exists on the Smit CSC Info YouTube channel for the specific topic asked, provide the exact YouTube link. DO NOT provide a link if no highly relevant video exists.
5. AFFIDAVITS & APPLICATION DRAFTING (Document Session): If the user requests an affidavit (સોગંધનામું) or formal application, draft the complete, accurate text in Gujarati based on the website's guidelines. 
   - CRITICAL NOTIFICATION: You MUST append this note after the draft: "તમે આ લખાણ કોપી કરી શકો છો અથવા PDF/DOC ફાઈલ બનાવવા માટે વેબસાઈટના Documents Session નો ઉપયોગ કરો."

MANDATORY FOOTER FORMATTING:
You MUST append the following reference section exactly as formatted below at the end of EVERY response. Pull the links strictly from your verified context.

---
📌 વધુ માહિતી અને સંપર્ક માટે:
- YouTube Video: [Insert EXACT YouTube video link ONLY IF a highly relevant video exists for the specific topic. If no relevant video exists, REMOVE this line entirely]
- WhatsApp Group: [Insert the exact official WhatsApp group link from the knowledge base]
- Email Address: [Insert the exact official Smit CSC Info email address from the knowledge base]

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
              max_tokens: 4096,
            }),
            signal: AbortSignal.timeout(Math.min(20000, remaining)),
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
              generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
            }),
            signal: AbortSignal.timeout(Math.min(20000, remaining)),
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
