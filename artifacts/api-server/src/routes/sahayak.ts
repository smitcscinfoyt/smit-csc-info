import { Router, type IRouter } from "express";
import { SAHAYAK_KNOWLEDGE } from "../lib/sahayak-knowledge";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SYSTEM_PROMPT = `àª¤àª®à« "Smit AI Sahayak" àªà« â Smit CSC Info àª¨à« AI assistant.
àª¤àª®à« CSC (Common Service Centre) operators àªàª¨à« àªà«àª°àª¾àª®à«àª¯ àª¨àª¾àªàª°àª¿àªà«àª¨à« àªà«àªàª°àª¾àª¤à« àª­àª¾àª·àª¾àª®àª¾àª àª¸àª¹àª¾àª¯ àªàª°à« àªà«.

â ï¸ àªàª¡àª àª¨àª¿àª¯àª®à« (STRICT RULES):
1. àª¹àªàª®à«àª¶àª¾ àªà«àªàª°àª¾àª¤à«àª®àª¾àª àª àªàªµàª¾àª¬ àªàªªà«.
2. ONLY àª¨à«àªà« àªàªªà«àª² Knowledge Base àª¨à« àª®àª¾àª¹àª¿àª¤à« àªµàª¾àªªàª°à« â àªà«àª¯àª¾àª°à«àª¯ àªªà«àª¤àª¾àª¨à« àª¤àª°àª«àª¥à« URL, website, phone number, process INVENT àª¨ àªàª°à«.
3. Knowledge base àª®àª¾àª àª¨ àª¹à«àª¯ àª¤à« EXACTLY àª àªàª¹à«: "àª àª®àª¾àª¹àª¿àª¤à« àªàªªàª²àª¬à«àª§ àª¨àª¥à«. CSC Helpline 1800-3000-3468 àªªàª° call àªàª°à«."
4. àªà«àªà« URL, wrong website, invented steps NEVER share àªàª°à« â users àª¨à« àª­à«àª°àª¾àª®àª àª®àª¾àª¹àª¿àª¤à« àª¨ àªàªªà«.
5. àªà«àªàªàª¾, clear bullet points (max 5 bullets), verified info only.
6. Fees, documents, steps â exactly knowledge base àª¨à« info, àªàª®à«àª°à«-àªàªàª¾àª¡à« àª¨ àªàª°à«.
7. Prime membership àª¨àª¾ àª«àª¾àª¯àª¦àª¾ mention àªàª°à« àªà«àª¯àª¾àª°à« relevant àª¹à«àª¯.
8. WhatsApp group: https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh

Knowledge Base (ONLY àª source use àªàª°à« â àª¬à«àªà« àªà«àª information invent àª¨ àªàª°à«):
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
router.post("/sahayak/chat", async (req, res): Promise<void> => {
  try {
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
      ? "\n[User is a Prime Member â mention Prime features where relevant]"
      : "\n[User is NOT a Prime Member â suggest upgrading where beneficial]";

    const systemWithPrime = SYSTEM_PROMPT + primeNote;

    const safeHistory: ChatMessage[] = Array.isArray(history)
      ? history.slice(-10).filter(
          (m) =>
            (m.role === "user" || m.role === "model") &&
            Array.isArray(m.parts) &&
            m.parts.every((p) => typeof p?.text === "string"),
        )
      : [];

    // ââ Priority 0: External Sahayak AI server âââââââââââââââââââââââââââââââââ
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
          logger.warn("sahayak external: empty reply â falling through to built-in AI");
        } else {
          const text = await upstream.text().catch(() => upstream.statusText);
          logger.warn(
            { status: upstream.status, body: text.slice(0, 300) },
            "sahayak external upstream non-OK â falling through to built-in AI",
          );
        }
      } catch (err) {
        logger.warn({ err }, "sahayak external chat unreachable â falling through to built-in AI");
      }
    }

    // ââ Priority 1: SambaNova ââââââââââââââââââââââââââââââââââââââââââââââââââ
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
              model: "DeepSeek-V3.1",
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
          logger.warn("sahayak sambanova: empty reply â falling through to Gemini");
        } else {
          const text = await upstream.text();
          logger.warn(
            { status: upstream.status, body: text.slice(0, 300) },
            "sahayak sambanova upstream non-OK â falling through to Gemini",
          );
        }
      } catch (err) {
        logger.warn({ err }, "sahayak sambanova call failed â falling through to Gemini");
      }
    }

    // ââ Priority 2: Gemini fallback ââââââââââââââââââââââââââââââââââââââââââââ
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

    // ââ All providers exhausted â use built-in knowledge-base search ââââââââââââ
    // This fallback works even with NO API keys configured. It searches the
    // SAHAYAK_KNOWLEDGE text for sections relevant to the user's message and
    // returns a formatted Gujarati response.
    logger.warn("sahayak: All AI providers failed â falling back to built-in knowledge search");

    const reply = knowledgeSearch(trimmed);
    res.json({ reply });
  } catch (unexpectedErr) {
      logger.error({ err: unexpectedErr }, "sahayak: unexpected top-level error");
      if (!res.headersSent) {
        res.json({ reply: "ક્ષમા કરશો, અડચણ આવી. CSC Helpline: 1800-3000-3468" });
      }
    }
});

// âââ Built-in knowledge-base keyword search (no API key required) âââââââââââââ
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
      "àª¨àª®àª¸à«àªàª¾àª°! ð Smit AI Sahayak àªàª¹à«àª àªà«.",
      "",
      "àª¤àª®àª¾àª°à« àªªà«àª°àª¶à«àª¨ àªàª®àª¾àª°à« knowledge base àª®àª¾àª àª¨ àª®àª³à«àª¯à«.",
      "àªà«àªªàª¾ àªàª°à« àªµàª§à« specific keywords àª¸àª¾àª¥à« àª«àª°à« àªªà«àªà«, àªà«àª® àªà«:",
      "â¢ Aadhaar, PAN, Passport, Driving Licence",
      "â¢ PM Kisan, Ayushman, e-Shram, Ration Card",
      "â¢ Recharge, Wallet, Prime Membership",
      "",
      "ð CSC Helpline: 1800-3000-3468",
      "ð¬ WhatsApp: https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh",
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
