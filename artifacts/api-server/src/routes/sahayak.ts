import { Router, type IRouter } from "express";
import { SAHAYAK_KNOWLEDGE } from "../lib/sahayak-knowledge";
import { logger } from "../lib/logger";
import { optionalAuth, type AuthRequest } from "../lib/auth";
import { getActivePrime } from "./credits";
import { createRateLimiter, clientIp } from "../lib/rate-limit";

const router: IRouter = Router();
const sahayakRateLimiter = createRateLimiter({ windowMs: 60_000, max: 15 });

let isSambaNovaDisabled = false;

// ── Build-time version info ─────────────────────────────────────────────────
const BUILD_SHA = process.env.BUILD_SHA || "dev";
const BUILD_TIME = process.env.BUILD_TIME || new Date().toISOString();

// ── /api/version endpoint ───────────────────────────────────────────────────
router.get("/api/version", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ sha: BUILD_SHA, builtAt: BUILD_TIME });
});

// ── Whitelisted URLs (from KB + site config) ────────────────────────────────
const LINK_WHITELIST = [
  "smitcscinfo.com",
  "www.smitcscinfo.com",
  "youtube.com/@SmitCSCInfo",
  "www.youtube.com/@SmitCSCInfo",
  "instagram.com/smit_csc_info",
  "www.instagram.com/smit_csc_info",
  "facebook.com/share/1KQkXYXKcQ",
  "www.facebook.com/share/1KQkXYXKcQ",
  "chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh",
];

// ── Footer constants (code-controlled, never LLM-generated) ─────────────────
const WHATSAPP_LINK = "https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh";
const YOUTUBE_LINK = "https://www.youtube.com/@SmitCSCInfo";
const EMAIL = "smitcscinfoyt@gmail.com";

function buildFooter(youtubeVideoUrl?: string): string {
  const lines = [
    "",
    "\u{1F4CC} \u0AB5\u0AA7\u0AC1 \u0AAE\u0ABE\u0AB9\u0ABF\u0AA4\u0AC0 \u0A85\u0AA8\u0AC7 \u0AB8\u0A82\u0AAA\u0AB0\u0ACD\u0A95 \u0AAE\u0ABE\u0A9F\u0AC7:",
  ];
  if (youtubeVideoUrl) {
    lines.push(`YouTube Video: ${youtubeVideoUrl}`);
  }
  lines.push(`WhatsApp Group: ${WHATSAPP_LINK}`);
  lines.push(`Email: ${EMAIL}`);
  return lines.join("\n");
}

// ── Fixed replies ───────────────────────────────────────────────────────────
const FIXED_NO_INFO = "\u0A86 \u0AB5\u0ABF\u0AB7\u0AAF\u0AA8\u0AC0 verified \u0AAE\u0ABE\u0AB9\u0ABF\u0AA4\u0AC0 \u0AB9\u0ABE\u0AB2 \u0A89\u0AAA\u0AB2\u0AAC\u0ACD\u0AA7 \u0AA8\u0AA5\u0AC0.";
const FIXED_ERROR = "\u0A95\u0ACD\u0AB7\u0AAE\u0ABE \u0A95\u0AB0\u0AB6\u0ACB, \u0A85\u0AA1\u0A9A\u0AA3 \u0A86\u0AB5\u0AC0. \u0AA5\u0ACB\u0AA1\u0AC0 \u0AB5\u0ABE\u0AB0 \u0AAA\u0A9B\u0AC0 \u0AAB\u0AB0\u0AC0 \u0AAA\u0ACD\u0AB0\u0AAF\u0AA4\u0ACD\u0AA8 \u0A95\u0AB0\u0ACB.";
const FIXED_NOT_CONFIGURED = "\u0A95\u0ACD\u0AB7\u0AAE\u0ABE \u0A95\u0AB0\u0AB6\u0ACB, AI service configured \u0AA8\u0AA5\u0AC0.";

// ── Synonym map for retrieval scoring ───────────────────────────────────────
const SYNONYM_MAP: Record<string, string[]> = {
  "\u0A9A\u0AC2\u0A82\u0A9F\u0AA3\u0AC0": ["voter", "epic", "\u0AAE\u0AA4\u0AA6\u0ABE\u0AB0", "form 6", "election", "\u0A9A\u0AC2\u0A82\u0A9F\u0AA3\u0AC0 \u0A95\u0ABE\u0AB0\u0ACD\u0AA1", "\u0A9A\u0AC1\u0A82\u0A9F\u0AA3\u0AC0", "\u0A9A\u0AC1\u0A82\u0A9F\u0AA3\u0AC0 \u0A95\u0ABE\u0AB0\u0ACD\u0AA1"],
  "\u0AA1\u0ACB\u0A95\u0ACD\u0AAF\u0AC1\u0AAE\u0AC7\u0AA8\u0ACD\u0A9F": ["\u0AA6\u0AB8\u0ACD\u0AA4\u0ABE\u0AB5\u0AC7\u0A9C", "documents", "document"],
  "\u0A86\u0AA7\u0ABE\u0AB0": ["aadhaar", "uidai", "aadhar", "\u0A86\u0AA7\u0ABE\u0AB0 \u0A95\u0ABE\u0AB0\u0ACD\u0AA1"],
  "pan": ["pan card", "\u0AAA\u0AC7\u0AA8", "income tax", "itr"],
  "\u0AAA\u0ABE\u0AB8\u0AAA\u0ACB\u0AB0\u0ACD\u0A9F": ["passport", "psk"],
  "\u0AB0\u0AC7\u0AB6\u0AA8": ["ration", "ration card", "\u0AB0\u0ABE\u0AB6\u0AA8 \u0A95\u0ABE\u0AB0\u0ACD\u0AA1"],
  "\u0A86\u0AB5\u0A95": ["income", "\u0A86\u0AB5\u0A95\u0AA8\u0ACB \u0AA6\u0ABE\u0A96\u0AB2\u0ACB", "income certificate"],
  "\u0A9C\u0ABE\u0AA4\u0ABF": ["caste", "\u0A9C\u0ABE\u0AA4\u0ABF\u0AA8\u0ACB \u0AA6\u0ABE\u0A96\u0AB2\u0ACB", "caste certificate"],
  "\u0A9C\u0AAE\u0AC0\u0AA8": ["land", "\u0A9C\u0AAE\u0AC0\u0AA8 \u0AAE\u0AB9\u0AC7\u0AB8\u0AC2\u0AB2", "anyror", "e-dhara"],
  "prime": ["prime membership", "\u0AAA\u0ACD\u0AB0\u0ABE\u0A87\u0AAE", "\u0AAE\u0AC7\u0AAE\u0ACD\u0AAC\u0AB0\u0AB6\u0ABF\u0AAA"],
  "\u0AA1\u0ACD\u0AB0\u0ABE\u0A87\u0AB5\u0ABF\u0A82\u0A97": ["driving", "licence", "license", "dl", "sarathi"],
  "\u0A9C\u0AA8\u0ACD\u0AAE": ["birth", "death", "\u0AAE\u0AB0\u0AA3", "birth certificate", "death certificate"],
  "\u0AB8\u0ACB\u0A97\u0A82\u0AA6": ["affidavit", "\u0AB8\u0ACB\u0A97\u0A82\u0AA6\u0AA8\u0ABE\u0AAE\u0AC1\u0A82", "\u0AB8\u0ACB\u0A97\u0AA8\u0ACD\u0AA6\u0AA8\u0ABE\u0AAE\u0AC1\u0A82"],
  "\u0A85\u0AB0\u0A9C\u0AC0": ["application", "\u0A85\u0AB0\u0A9C\u0AC0 \u0AAA\u0AA4\u0ACD\u0AB0"],
  "msme": ["gumasta", "\u0A97\u0AC1\u0AAE\u0ABE\u0AB8\u0ACD\u0AA4\u0ABE", "business"],
  "\u0A95\u0AC3\u0AB7\u0ABF": ["agriculture", "\u0A96\u0AC7\u0AA4\u0AC0", "\u0A96\u0AC7\u0AA1\u0AC2\u0AA4", "farmer"],
};

// ── Retrieval: split KB into sections, score and return top matches ─────────
function retrieveContext(query: string, maxChars = 3000): string {
  const qNorm = query.normalize('NFC').toLowerCase();
  const qWords = (qNorm.match(/[\p{L}\p{M}\p{N}]+/gu) || []).filter(w => w.length > 1);

  const expandedTerms = new Set<string>(qWords);
  for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
    const allTerms = [key, ...synonyms].map(t => t.normalize('NFC').toLowerCase());
    if (allTerms.some(t => qNorm.includes(t))) {
      allTerms.forEach(t => expandedTerms.add(t));
    }
  }

  // Split on ## and ###
  let rawSections = SAHAYAK_KNOWLEDGE.normalize('NFC').split(/\n(?=#{2,3}\s)/).filter(s => s.trim().length > 20);

  // Chunk sections > 1500 chars
  const chunkedSections: string[] = [];
  for (const sec of rawSections) {
    if (sec.length <= 1500) {
      chunkedSections.push(sec);
    } else {
      let currentChunk = "";
      const lines = sec.split('\n');
      for (const line of lines) {
        if (currentChunk.length + line.length > 1500 && currentChunk.length > 0) {
          chunkedSections.push(currentChunk);
          currentChunk = line;
        } else {
          currentChunk += (currentChunk ? "\n" : "") + line;
        }
      }
      if (currentChunk) chunkedSections.push(currentChunk);
    }
  }

  function score(section: string): number {
    const lines = section.split('\n');
    const heading = lines[0].toLowerCase();
    const body = lines.slice(1).join('\n').toLowerCase();
    
    let sc = 0;
    for (const term of Array.from(expandedTerms)) {
      if (heading.includes(term)) sc += (term.length > 3 ? 6 : 3); // Heading x3 weight
      if (body.includes(term)) sc += (term.length > 3 ? 2 : 1);
    }
    return sc;
  }

  const ranked = chunkedSections
    .map(s => ({ s, sc: score(s) }))
    .filter(x => x.sc > 0)
    .sort((a, b) => b.sc - a.sc);

  (globalThis as any).__sahayakRankedSections = ranked.slice(0, 3).map(r => ({ heading: r.s.split('\n')[0].substring(0, 50), score: r.sc }));

  if (ranked.length === 0) return "";

  let combined = "";
  for (const item of ranked.slice(0, 3)) {
    const section = item.s.trim();
    if (combined.length + section.length > maxChars) {
      const remaining = maxChars - combined.length;
      if (remaining > 200) {
        combined += "\n\n" + section.slice(0, remaining);
      }
      break;
    }
    combined += (combined ? "\n\n" : "") + section;
  }

  return combined;
}

// ── Post-filter: strip markdown, helplines, mojibake, unauthorized URLs ─────
function postFilter(text: string): string {
  let lines = text.split("\n");

  lines = lines.map(line => {
    // Strip markdown symbols: **, ##, ---
    let cleaned = line
      .replace(/#{1,6}\s*/g, "")
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
      .replace(/^-{3,}$/g, "")
      .replace(/`([^`]+)`/g, "$1");
    return cleaned;
  });

  // Drop lines with helpline/toll-free numbers
  // Keep bare "Helpline" (e.g., "Voter Helpline App"), drop lines with phone patterns
  const helplinePhonePattern = /(?:helpline|toll[\s-]*free|\u0A9F\u0ACB\u0AB2\s*\u0AAB\u0ACD\u0AB0\u0AC0)\s*[:\-]?\s*\d{3,}/i;
  const phonePattern = /1800[-\s]?\d{3,}[-\s]?\d{3,}/;
  lines = lines.filter(line => {
    if (helplinePhonePattern.test(line)) return false;
    if (phonePattern.test(line)) return false;
    return true;
  });

  // Drop lines with mojibake markers
  const mojibakePattern = /[\u00C0-\u00FF]{3,}|[\u0080-\u009F]|\u00C3[\u00A0-\u00BF]|\u00E2\u0080[\u0090-\u009F]/;
  lines = lines.filter(line => {
    if (mojibakePattern.test(line)) {
      logger.warn({ droppedLine: line.slice(0, 100) }, "sahayak post-filter: dropped mojibake line");
      return false;
    }
    return true;
  });

  // Strip unauthorized URLs
  lines = lines.map(line => {
    return line.replace(/https?:\/\/[^\s)]+/g, (url) => {
      try {
        const hostname = new URL(url).hostname;
        if (LINK_WHITELIST.some(wl => hostname.includes(wl) || url.includes(wl))) {
          return url;
        }
      } catch { /* invalid URL */ }
      return "";
    });
  });

  // Remove empty lines at end
  let result = lines.join("\n").trim();

  // If MAX_TOKENS caused cut-off, trim at last full sentence
  if (result.length > 0 && !/[.!?\u0ACD\u0AC7\u0AC8\u0ABE\u0ABF\u0AC0]$/.test(result)) {
    // Find last sentence boundary
    const lastSentence = result.lastIndexOf(".");
    const lastGujarati = Math.max(
      result.lastIndexOf("\u0AC7"),  // e matra
      result.lastIndexOf("\u0ABE"),  // aa matra
      result.lastIndexOf("\u0AC0"),  // ii matra
    );
    const cutPoint = Math.max(lastSentence, lastGujarati);
    if (cutPoint > result.length * 0.5) {
      result = result.slice(0, cutPoint + 1);
    }
  }

  return result;
}

// ── Check if query is asking for affidavit/application ──────────────────────
function isDocumentQuery(query: string): boolean {
  const q = query.toLowerCase();
  const docTerms = [
    "\u0AB8\u0ACB\u0A97\u0A82\u0AA6\u0AA8\u0ABE\u0AAE\u0AC1\u0A82",
    "\u0AB8\u0ACB\u0A97\u0AA8\u0ACD\u0AA6\u0AA8\u0ABE\u0AAE\u0AC1\u0A82",
    "\u0AB8\u0ACB\u0A97\u0A82\u0AA6\u0AA8\u0ABE\u0AAE\u0AC2",
    "\u0A85\u0AB0\u0A9C\u0AC0",
    "affidavit",
    "application",
  ];
  return docTerms.some(t => q.includes(t));
}

const DOC_APPEND = "\u0AA4\u0AAE\u0AC7 \u0A86 \u0AB2\u0A96\u0ABE\u0AA3 \u0A95\u0ACB\u0AAA\u0AC0 \u0A95\u0AB0\u0AC0 \u0AB6\u0A95\u0ACB \u0A9B\u0ACB \u0A85\u0AA5\u0AB5\u0ABE PDF/DOC \u0AAB\u0ABE\u0A88\u0AB2 \u0AAC\u0AA8\u0ABE\u0AB5\u0AB5\u0ABE \u0AAE\u0ABE\u0A9F\u0AC7 \u0AB5\u0AC7\u0AAC\u0AB8\u0ABE\u0A88\u0A9F\u0AA8\u0ABE Documents Session \u0AA8\u0ACB \u0A89\u0AAA\u0AAF\u0ACB\u0A97 \u0A95\u0AB0\u0ACB.";

// ── System prompt (CONTEXT injected separately by code) ─────────────────────
const SYSTEM_PROMPT = `You are "Smit AI Sahayak", the official assistant of Smit CSC Info. Give ONLY real, exact, relevant information. Never guess.
1. Answer ONLY the exact question. Use CONTEXT silently; never print or summarize it; never add other topics (income/caste certificate, PAN, EWS) unless asked.
2. Clean, professional Gujarati only (English for technical terms). Plain text, no markdown symbols.
3. Never write phone, helpline or toll-free numbers.
4. Never write a URL, email or link unless it is in CONTEXT verbatim. Never write a footer.
5. If CONTEXT has the answer, use it. If CONTEXT lacks the answer BUT the user is asking about a general government service, form, or procedure (like Voter ID / ચૂંટણી કાર્ડ), you MAY use your internal verified training data to provide a factual, step-by-step guide. If the topic is completely unknown, reply exactly: "\u0A86 \u0AB5\u0ABF\u0AB7\u0AAF\u0AA8\u0AC0 verified \u0AAE\u0ABE\u0AB9\u0ABF\u0AA4\u0AC0 \u0AB9\u0ABE\u0AB2 \u0A89\u0AAA\u0AB2\u0AAC\u0ACD\u0AA7 \u0AA8\u0AA5\u0AC0." NEVER invent URLs, helplines, fees, or dates from internal memory.
6. Affidavit/application: draft in Gujarati ONLY from a template in CONTEXT; no invented legal text.
7. Be brief: steps, documents, official link (if in CONTEXT).`;

interface ChatMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

// ── STARTUP PROVIDER CHECK ──────────────────────────────────────────────────
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

// ── POST /sahayak/chat ──────────────────────────────────────────────────────
router.post("/sahayak/chat", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  // Always set proper headers
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const requestStartTime = Date.now();
  const OVERALL_DEADLINE_MS = 45000;
  const getRemainingTime = () => Math.max(0, OVERALL_DEADLINE_MS - (Date.now() - requestStartTime));

  try {
    if (!req.userId) {
      res.status(401).json({ error: "\u0AB2\u0ACB\u0A97 \u0A87\u0AA8 \u0A95\u0AB0\u0ACB (Login Required)" });
      return;
    }

    const activePrime = await getActivePrime(req.userId);
    const isAdmin = (req as any).userRole === "admin" || (req as any).userRole === "manager";
    const isPrime = !!activePrime || isAdmin;

    if (!isPrime) {
      res.status(403).json({ error: "\u0AAE\u0ABE\u0AAB \u0A95\u0AB0\u0AB6\u0ACB, \u0A86 \u0AB8\u0AC1\u0AB5\u0ABF\u0AA7\u0ABE \u0AAE\u0ABE\u0AA4\u0ACD\u0AB0 Prime \u0AAE\u0AC7\u0AAE\u0ACD\u0AAC\u0AB0\u0ACD\u0AB8 \u0AAE\u0ABE\u0A9F\u0AC7 \u0A9B\u0AC7. (Prime membership required)" });
      return;
    }

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

    // ── Retrieve relevant context (NOT the full KB) ───────────────────────
    const context = retrieveContext(trimmed);
    const contextBlock = context
      ? `\n\nCONTEXT:\n${context}`
      : "\n\nCONTEXT: No specific information available for this query.";
    if (!context) { (req as any)._sahayakReason = "no_match"; }

    const fullPrompt = SYSTEM_PROMPT + contextBlock + "\n\nUser is a Prime member. Provide priority support.";

    const safeHistory = Array.isArray(history)
      ? history.slice(-10).map((m) => ({
          role: m.role === "model" ? "assistant" : "user",
          content: Array.isArray(m.parts) ? m.parts.map((p) => p?.text ?? "").join("") : "",
        }))
      : [];

    // ── Helper: send filtered reply ───────────────────────────────────────
    const sendReply = (rawReply: string, providerInfo: any = { provider: "unknown", status: "ok" }) => {
      let reply = postFilter(rawReply);
      if (reply.includes("\u0A86 \u0AB5\u0ABF\u0AB7\u0AAF\u0AA8\u0AC0 verified \u0AAE\u0ABE\u0AB9\u0ABF\u0AA4\u0AC0 \u0AB9\u0ABE\u0AB2 \u0A89\u0AAA\u0AB2\u0AAC\u0ACD\u0AA7 \u0AA8\u0AA5\u0AC0.")) {
        (req as any)._sahayakReason = "llm_said_unavailable";
      }
      // Append document notice if applicable
      if (isDocumentQuery(trimmed) && !reply.includes(DOC_APPEND)) {
        reply += "\n\n" + DOC_APPEND;
      }
      // Append code-controlled footer
      reply += buildFooter();
      
      const debugData: any = {};
      if (req.headers['x-admin-token'] === 'smit-admin-debug' || (req.query as any).debug === 'true') {
         debugData.debug = {
            reason: (req as any)._sahayakReason || "ok",
            provider: providerInfo.provider,
            status: providerInfo.status || "ok",
            matchedSections: (globalThis as any).__sahayakRankedSections || []
         };
      }
      res.json({ reply, ...debugData });
    };

    // ── External Backend Attempt ──────────────────────────────────────────
    const externalUrl = process.env.SAHAYAK_EXTERNAL_API_URL;
    if (externalUrl) {
      try {
        const upstream = await fetch(externalUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history, isPrime }),
          signal: AbortSignal.timeout(35000),
        });

        if (upstream.ok) {
          const json = (await upstream.json()) as any;
          if (json?.reply) {
            sendReply(json.reply, { provider: "external", status: "ok" });
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

    // ── Priority 1: SambaNova ─────────────────────────────────────────────
    if (sambaKey && !isSambaNovaDisabled) {
      const sambaModelsStr = process.env.SAMBANOVA_MODELS || process.env.SAMBANOVA_MODEL || "DeepSeek-V3.1,Meta-Llama-3.3-70B-Instruct";
      const sambaModels = sambaModelsStr.split(',').map(m => m.trim()).filter(Boolean);
      let sambaSuccess = false;
      for (const sambaModel of sambaModels) {
        const remaining = getRemainingTime();
        if (remaining < 5000) break;

        try {
          const messages = [
            { role: "system", content: fullPrompt },
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
            logger.warn({ provider: 'sambanova', status: upstream.status }, "sahayak sambanova is disabled (402).");
            isSambaNovaDisabled = true;
            break;
          }

          if (upstream.ok) {
            const json = (await upstream.json()) as any;
            const reply = (json?.choices?.[0]?.message?.content as string) ?? "";
            if (reply) {
              sendReply(reply, { provider: "sambanova", status: "ok" });
              sambaSuccess = true;
              break;
            }
            logger.warn({ provider: 'sambanova', model: sambaModel, reason: 'empty_reply' }, "sahayak sambanova: empty reply");
          } else {
            logger.warn({ provider: 'sambanova', model: sambaModel, status: upstream.status }, "sahayak sambanova upstream non-OK");
            if (upstream.status === 404 || upstream.status === 429 || upstream.status >= 500) continue;
            break;
          }
        } catch (err: any) {
          logger.warn({ provider: 'sambanova', model: sambaModel, reason: err.name === 'TimeoutError' ? 'timeout' : 'exception' }, "sahayak sambanova call failed");
          continue;
        }
      }
      if (sambaSuccess) return;
    }

    // ── Priority 2: Gemini ────────────────────────────────────────────────
    if (geminiKey) {
      const geminiModelsStr = process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "gemini-3.5-flash,gemini-3.8-flash,gemini-3.7-flash,gemini-flash-latest";
      const geminiModels = geminiModelsStr.split(',').map(m => m.trim()).filter(Boolean);
      let geminiSuccess = false;
      for (const geminiModel of geminiModels) {
        const remaining = getRemainingTime();
        if (remaining < 5000) break;

        try {
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
              system_instruction: { parts: [{ text: fullPrompt }] },
              contents,
              generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
            }),
            signal: AbortSignal.timeout(Math.min(20000, remaining)),
          });

          if (upstream.ok) {
            const json = (await upstream.json()) as any;
            const reply = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
            if (reply) {
              sendReply(reply, { provider: "gemini", status: "ok" });
              geminiSuccess = true;
              break;
            }
            logger.warn({ provider: 'gemini', model: geminiModel, reason: 'empty_reply' }, "sahayak gemini: empty reply");
          } else {
            logger.warn({ provider: 'gemini', model: geminiModel, status: upstream.status }, "sahayak gemini upstream non-OK");
            if (upstream.status === 404 || upstream.status === 429 || upstream.status >= 500) continue;
          }
        } catch (err: any) {
          logger.warn({ provider: 'gemini', model: geminiModel, reason: err.name === 'TimeoutError' ? 'timeout' : 'exception' }, "sahayak gemini call failed");
          continue;
        }
      }
      if (geminiSuccess) return;
    }

    // ── All providers exhausted — fixed reply, NEVER raw KB ──────────────
    logger.warn("sahayak: All AI providers failed — returning fixed reply");
    const fallbackReply = FIXED_NO_INFO;
    (req as any)._sahayakReason = "llm_error";
    sendReply(fallbackReply, { provider: "fallback", status: "all_providers_failed" });

  } catch (unexpectedErr) {
    logger.error({ err: unexpectedErr }, "sahayak: unexpected top-level error");
    if (!res.headersSent) {
      res.json({ reply: postFilter(FIXED_ERROR) + buildFooter() });
    }
  }
});

export default router;
