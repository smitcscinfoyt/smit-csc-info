import { Router, type IRouter } from "express";
import { SAHAYAK_KNOWLEDGE } from "../lib/sahayak-knowledge";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SYSTEM_PROMPT = `તમે "Smit AI Sahayak" છો — Smit CSC Info નો AI assistant.
તમે CSC (Common Service Centre) operators અને ગ્રામ્ય નાગરિકોને ગુજરાતી ભાષામાં સહાય કરો છો.

નિયમો:
1. હંમેશા ગુજરાતીમાં જ જવાબ આપો (user English માં પૂછે તો પણ ગુજરાતીમાં જ).
2. ટૂંકા, સ્પષ્ટ અને practical જવાબ આપો.
3. Documents list, fees, steps — bullet points માં આપો.
4. જો knowledge base માં information ન હોય, તો honestly કહો: "આ માહિતી મારી પાસે નથી, CSC Helpline 1800-3000-3468 પર call કરો."
5. Prime membership ના ફાયદા mention કરો જ્યારે relevant હોય.
6. WhatsApp group link share કરો: https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh

Knowledge Base:
${SAHAYAK_KNOWLEDGE}`;

interface ChatMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

// ── POST /sahayak/chat ────────────────────────────────────────────────────────
// Env var priority:
//   1. AI_INTEGRATIONS_GEMINI_BASE_URL + AI_INTEGRATIONS_GEMINI_API_KEY
//      → set automatically by Replit AI integrations in dev
//   2. AI_INTEGRATIONS_GEMINI_API_KEY alone (ENV_GEMINI_API_KEY GitHub secret)
//      → production: base URL defaults to Google's public Gemini endpoint
router.post("/sahayak/chat", async (req, res): Promise<void> => {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

  if (!apiKey) {
    logger.warn("sahayak: AI_INTEGRATIONS_GEMINI_API_KEY not configured");
    res.status(503).json({ error: "AI Sahayak service is not configured. Please contact the admin." });
    return;
  }

  // When running on Replit the integration provides its own proxy URL.
  // In production (Oracle VM) that var is absent so we fall back to Google's
  // public v1beta endpoint — same request format, just a different host.
  const baseUrl =
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta";

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

  const contents = [
    ...safeHistory,
    { role: "user" as const, parts: [{ text: trimmed }] },
  ];

  const url = `${baseUrl.replace(/\/$/, "")}/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemWithPrime }] },
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      logger.warn(
        { status: upstream.status, body: text.slice(0, 300) },
        "sahayak gemini upstream failed",
      );
      res.status(502).json({ error: "AI service error. Please try again." });
      return;
    }

    const json = (await upstream.json()) as any;
    const reply: string =
      json?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text ?? "")
        .join("") ?? "";

    if (!reply) {
      res.status(502).json({ error: "Empty response from AI." });
      return;
    }

    res.json({ reply });
  } catch (err) {
    logger.error({ err }, "sahayak chat call failed");
    res.status(502).json({ error: "Could not reach AI service." });
  }
});

export default router;
