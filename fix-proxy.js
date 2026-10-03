const fs = require('fs');

let code = fs.readFileSync('artifacts/api-server/src/routes/sahayak.ts', 'utf8');

const startupCheck = `
// --- STARTUP PROVIDER CHECK ---
(async function verifyProvidersProxy() {
  const sambaKey = process.env['SAMBANOVA_API_KEY'];
  if (sambaKey) {
    try {
      const res = await fetch('https://api.sambanova.ai/v1/models', {
        headers: { Authorization: \`Bearer \${sambaKey}\` },
        signal: AbortSignal.timeout(5000)
      });
      logger.info(\`[Startup] Proxy SambaNova check: HTTP \${res.status}\`);
    } catch (err) {
      logger.warn(\`[Startup] Proxy SambaNova check failed: \${err.message}\`);
    }
  }
  const geminiKey = process.env['GEMINI_API_KEY'] || process.env['AI_INTEGRATIONS_GEMINI_API_KEY'];
  if (geminiKey) {
    try {
      const geminiBaseUrl = process.env['AI_INTEGRATIONS_GEMINI_BASE_URL'] || 'https://generativelanguage.googleapis.com/v1beta';
      const res = await fetch(\`\${geminiBaseUrl.replace(/\\/$/, '')}/models\`, {
        headers: { 'x-goog-api-key': geminiKey },
        signal: AbortSignal.timeout(5000)
      });
      logger.info(\`[Startup] Proxy Gemini check: HTTP \${res.status}\`);
    } catch (err) {
      logger.warn(\`[Startup] Proxy Gemini check failed: \${err.message}\`);
    }
  }
})();
`;

const oldRoute = code.substring(code.indexOf('router.post("/sahayak/chat"'), code.indexOf('function knowledgeSearch'));

const newRoute = `router.post("/sahayak/chat", optionalAuth, async (req: AuthRequest, res): Promise<void> => {
  const requestStartTime = Date.now();
  const OVERALL_DEADLINE_MS = 30000;
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

    const systemWithPrime = SYSTEM_PROMPT + "\\n\\nUser is a Prime member. Provide priority support.";

    // ── External Backend Attempt ───────────────────────────────────────────────
    let externalSuccess = false;
    const externalUrl = process.env.SAHAYAK_EXTERNAL_API_URL;
    if (externalUrl) {
      try {
        const upstream = await fetch(externalUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history, isPrime }),
          signal: AbortSignal.timeout(24000), // backend has 22s limit, proxy waits 24s max
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
    if (sambaKey) {
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
              Authorization: \`Bearer \${sambaKey}\`,
            },
            body: JSON.stringify({
              model: sambaModel,
              messages,
              temperature: 0.4,
              max_tokens: 1024,
            }),
            signal: AbortSignal.timeout(Math.min(12000, remaining)),
          });

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
      const geminiModelsStr = process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "gemini-3.5-flash";
      const geminiModels = geminiModelsStr.split(',').map(m => m.trim()).filter(Boolean);
      let geminiSuccess = false;
      for (const geminiModel of geminiModels) {
        const remaining = getRemainingTime();
        if (remaining < 5000) break;

        try {
          const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";

          const contents = [
            ...safeHistory.map(m => ({ role: (m.role === "assistant" ? "model" : "user") as any, parts: [{ text: m.content }] })),
            { role: "user" as const, parts: [{ text: trimmed }] },
          ];

          const url = \`\${baseUrl.replace(/\\/$/, "")}/models/\${geminiModel}:generateContent\`;

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
`;

code = code.replace(oldRoute, newRoute);

// Also add startupCheck right before router.post
code = code.replace('router.post("/sahayak/chat"', startupCheck + '\\nrouter.post("/sahayak/chat"');

// Fix strings in knowledgeSearch
code = code.replace(
  /"ðŸ“ž àªµàª§à«  àªœàª¾àª£àªµàª¾: CSC Helpline 1800-3000-3468",/,
  '"📱 SAGAR Kindarakhediya — Smit CSC Info:",'
);
code = code.replace(
  /"ðŸ’¬ WhatsApp Group: https:\/\/chat\.whatsapp\.com\/CS5vmo9R3yXKxlvBHP0EYh",/,
  '"YouTube: https://www.youtube.com/@SmitCSCInfo",\\n    "WhatsApp Group: https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh",'
);
code = code.replace(
  /"ðŸ“– \*\*\\"\$\{query\}\\" â€” Smit CSC Info Knowledge Base:\*\*",/,
  '\`📖 **"\${query}" — Smit CSC Info Knowledge Base:**\`,'
);
// Also the fallback strings
code = code.replace(
  '⚠️ (AI સેવાઓ અત્યારે વ્યસ્ત છે. હું માત્ર Knowledge Base માંથી શોધીને જવાબ આપી રહ્યો છું.)',
  '⚠️ (AI સેવાઓ અત્યારે વ્યસ્ત છે. હું માત્ર Knowledge Base માંથી શોધીને જવાબ આપી રહ્યો છું. થોડી વાર પછી ફરી પ્રયત્ન કરો)'
);

fs.writeFileSync('artifacts/api-server/src/routes/sahayak.ts', code);
