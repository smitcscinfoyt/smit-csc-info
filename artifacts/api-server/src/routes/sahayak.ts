import { Router, type IRouter } from "express";
import { SAHAYAK_KNOWLEDGE } from "../lib/sahayak-knowledge";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SYSTEM_PROMPT = `તમે "Smit AI Sahayak" છો — Smit CSC Info નો AI assistant.
તમે CSC (Common Service Centre) operators અને ગ્રામ્ય નાગરિકોને ગુજરાતી ભાષામાં સહાય કરો છો.

⚠️ કડક નિયમો (STRICT RULES):
1. હંમેશા ગુજરાતીમાં જ જવાબ આપો.
2. ONLY નીચે આપેલ Knowledge Base ની માહિતી વાપરો — ક્યારેય પોતાની તરફથી URL, website, phone number, process INVENT ન કરો.
3. Knowledge base માં ન હોય તો EXACTLY આ કહો: "આ માહિતી ઉપલબ્ધ નથી. CSC Helpline 1800-3000-3468 પર call કરો."
4. ખોટી URL, wrong website, invented steps NEVER share કરો — users ને ભ્રામક માહિતી ન આપો.
5. ટૂંકા, clear bullet points (max 5 bullets), verified info only.
6. Fees, documents, steps — exactly knowledge base ની info, ઉમેરો-ઘટાડો ન કરો.
7. Prime membership ના ફાયદા mention કરો જ્યારે relevant હોય.
8. WhatsApp group: https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh

Knowledge Base (ONLY આ source use કરો — બીજી કોઈ information invent ન કરો):
${SAHAYAK_KNOWLEDGE}`;

interface ChatMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

// ── POST /sahayak/chat ────────────────────────────────────────────────────────
// AI provider waterfall — each provider is tried in order; on failure the next
// one is attempted. This ensures the chat works even if one provider is down.
//
// Priority:
//   0. NEXT_PUBLIC_CHAT_API_URL → external Sahayak AI server (proxy)
//   1. SAMBANOVA_API_KEY        → SambaNova OpenAI-compatible API
//   2. AI_INTEGRATIONS_GEMINI_API_KEY → Gemini REST API (fallback)
router.post("/sahayak/chat", async (req, res): Promise<void> => {
  const externalUrl = (process.env.NEXT_PUBLIC_CHAT_API_URL ?? "").replace(/\/+$/, "");
  const sambaKey = process.env.SAMBANOVA_API_KEY;
  const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

  const { message, history = [], isPrime = false } = req.body as {
    message?: string;
    history?: ChatMessage[];
    isPrime?: boolean;
  };

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const trimmed = message.trim().slice(0, 1000);

  const primeNote = isPrime
    ? "\n[User is a Prime Member — mention Prime features where relevant]"
    : "\n[User is NOT a Prime Member — suggest upgrading where beneficial]";

  const systemWithPrime = SYSTEM_PROMPT + primeNote;

  const safeHistory: ChatMessage[] = Array.isArray(history)
    ? history.slice(-10).filter(
        (m) =>
          (m.role === "user" || m.role === "model") &&
          Array.isArray(m.parts) &&
          m.parts.every((p) => typeof p?.text === "string"),
      )
    : [];

  // ── Priority 0: External Sahayak AI server ─────────────────────────────────
  if (externalUrl) {
    try {
      const upstream = await fetch(`${externalUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, isPrime }),
        // 8-second timeout so we don't hang if the external server is down
        signal: AbortSignal.timeout(8000),
      });

      if (upstream.ok) {
        const json = await upstream.json() as { reply?: string };
        const reply = json.reply ?? "";
        if (reply) {
          res.json({ reply });
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
    } catch (err) {
      logger.warn({ err }, "sahayak external chat unreachable — falling through to built-in AI");
    }
  }

  // ── Priority 1: SambaNova ──────────────────────────────────────────────────
  if (sambaKey) {
    try {
      const messages = [
        { role: "system", content: systemWithPrime },
        ...safeHistory.map((m) => ({
          role: m.role === "model" ? "assistant" : "user",
          content: m.parts.map((p) => p.text).join(""),
        })),
        { role: "user", content: trimmed },
      ];

      const upstream = await fetch(
        "https://api.sambanova.ai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sambaKey}`,
          },
          body: JSON.stringify({
            model: "Meta-Llama-3.3-70B-Instruct",
            messages,
            temperature: 0.4,
            max_tokens: 1024,
          }),
          signal: AbortSignal.timeout(20000),
        },
      );

      if (upstream.ok) {
        const json = (await upstream.json()) as any;
        const reply = (json?.choices?.[0]?.message?.content as string) ?? "";
        if (reply) {
          res.json({ reply });
          return;
        }
        logger.warn("sahayak sambanova: empty reply — falling through to Gemini");
      } else {
        const text = await upstream.text();
        logger.warn(
          { status: upstream.status, body: text.slice(0, 300) },
          "sahayak sambanova upstream non-OK — falling through to Gemini",
        );
      }
    } catch (err) {
      logger.warn({ err }, "sahayak sambanova call failed — falling through to Gemini");
    }
  }

  // ── Priority 2: Gemini fallback ────────────────────────────────────────────
  if (geminiKey) {
    try {
      const baseUrl =
        process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ||
        "https://generativelanguage.googleapis.com/v1beta";

      const contents = [
        ...safeHistory,
        { role: "user" as const, parts: [{ text: trimmed }] },
      ];

      const url = `${baseUrl.replace(/\/$/, "")}/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`;

      const upstream = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemWithPrime }] },
          contents,
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (upstream.ok) {
        const json = (await upstream.json()) as any;
        const reply =
          json?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p?.text ?? "")
            .join("") ?? "";
        if (reply) {
          res.json({ reply });
          return;
        }
        logger.warn("sahayak gemini: empty reply");
      } else {
        const text = await upstream.text();
        logger.warn(
          { status: upstream.status, body: text.slice(0, 300) },
          "sahayak gemini upstream non-OK",
        );
      }
    } catch (err) {
      logger.warn({ err }, "sahayak gemini call failed");
    }
  }

  // ── All providers exhausted — use built-in knowledge-base search ────────────
  // This fallback works even with NO API keys configured. It searches the
  // SAHAYAK_KNOWLEDGE text for sections relevant to the user's message and
  // returns a formatted Gujarati response.
  logger.warn("sahayak: All AI providers failed — falling back to built-in knowledge search");

  const reply = knowledgeSearch(trimmed);
  res.json({ reply });
});

// ─── Built-in knowledge-base keyword search (no API key required) ─────────────
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
      "નમસ્કાર! 🙏 Smit AI Sahayak અહીં છે.",
      "",
      "તમારો પ્રશ્ન અમારી knowledge base માં ન મળ્યો.",
      "કૃપા કરી વધુ specific keywords સાથે ફરી પૂછો, જેમ કે:",
      "• Aadhaar, PAN, Passport, Driving Licence",
      "• PM Kisan, Ayushman, e-Shram, Ration Card",
      "• Recharge, Wallet, Prime Membership",
      "",
      "📞 CSC Helpline: 1800-3000-3468",
      "💬 WhatsApp: https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh",
    ].join("\n");
  }

  // Take top 2 sections (cap at 1200 chars total to avoid overflow)
  const topSections = ranked.slice(0, 2).map((x) => x.s.trim());
  let combined = topSections.join("\n\n---\n\n");
  if (combined.length > 1200) combined = combined.slice(0, 1200) + "\n…";

  return [
    `📖 **"${query}" — Smit CSC Info Knowledge Base:**`,
    "",
    combined,
    "",
    "📞 વધુ જાણવા: CSC Helpline 1800-3000-3468",
    "💬 WhatsApp Group: https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh",
  ].join("\n");
}

export default router;
