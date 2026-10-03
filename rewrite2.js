const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/routes/sahayak.ts', 'utf8');

// 1. Update SYSTEM_PROMPT
const oldPrompt = `const SYSTEM_PROMPT = \`You are "Smit AI Sahayak", the official assistant of Smit CSC Info. Give ONLY real, exact, relevant information. Never guess.
1. Answer ONLY the exact question. Use CONTEXT silently; never print or summarize it; never add other topics (income/caste certificate, PAN, EWS) unless asked.
2. Clean, professional Gujarati only (English for technical terms). Plain text, no markdown symbols.
3. Never write phone, helpline or toll-free numbers.
4. Never write a URL, email or link unless it is in CONTEXT verbatim. Never write a footer.
5. If CONTEXT lacks the answer, reply exactly: "\u0A86 \u0AB5\u0ABF\u0AB7\u0AAF\u0AA8\u0AC0 verified \u0AAE\u0ABE\u0AB9\u0ABF\u0AA4\u0AC0 \u0AB9\u0ABE\u0AB2 \u0A89\u0AAA\u0AB2\u0AAC\u0ACD\u0AA7 \u0AA8\u0AA5\u0AC0." Never use memory for fees, dates, forms, laws or links.
6. Affidavit/application: draft in Gujarati ONLY from a template in CONTEXT; no invented legal text.
7. Be brief: steps, documents, official link (if in CONTEXT).\`;`;

const newPrompt = `const SYSTEM_PROMPT = \`You are "Smit AI Sahayak", the official assistant of Smit CSC Info. Give ONLY real, exact, relevant information. Never guess.
1. Answer ONLY the exact question. Use CONTEXT silently; never print or summarize it; never add other topics (income/caste certificate, PAN, EWS) unless asked.
2. Clean, professional Gujarati only (English for technical terms). Plain text, no markdown symbols.
3. Never write phone, helpline or toll-free numbers.
4. Never write a URL, email or link unless it is in CONTEXT verbatim. Never write a footer.
5. If CONTEXT has the answer, use it. If CONTEXT lacks the answer BUT the user is asking about a general government service, form, or procedure (like Voter ID / \u0A9A\u0AC2\u0A82\u0A9F\u0AA3\u0AC0 \u0A95\u0ABE\u0AB0\u0ACD\u0AA1), you MAY use your internal verified training data to provide a factual, step-by-step guide. If the topic is completely unknown, reply exactly: "\u0A86 \u0AB5\u0ABF\u0AB7\u0AAF\u0AA8\u0AC0 verified \u0AAE\u0ABE\u0AB9\u0ABF\u0AA4\u0AC0 \u0AB9\u0ABE\u0AB2 \u0A89\u0AAA\u0AB2\u0AAC\u0ACD\u0AA7 \u0AA8\u0AA5\u0AC0." NEVER invent URLs, helplines, fees, or dates from internal memory.
6. Affidavit/application: draft in Gujarati ONLY from a template in CONTEXT; no invented legal text.
7. Be brief: steps, documents, official link (if in CONTEXT).\`;`;

if (code.includes(oldPrompt)) {
  code = code.replace(oldPrompt, newPrompt);
} else {
  console.log("Could not find old prompt");
}

// 2. Update retrieveContext
const oldRetrieveStart = `// ── Retrieval: split KB into sections, score and return top matches ─────────
function retrieveContext(query: string, maxChars = 3000): string {`;
const oldRetrieveEnd = `  return combined;
}`;

const newRetrieve = `// ── Retrieval: split KB into sections, score and return top matches ─────────
function retrieveContext(query: string, maxChars = 3000): string {
  const qNorm = query.normalize('NFC').toLowerCase();
  const qWords = (qNorm.match(/[\\p{L}\\p{M}\\p{N}]+/gu) || []).filter(w => w.length > 1);

  const expandedTerms = new Set<string>(qWords);
  for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
    const allTerms = [key, ...synonyms].map(t => t.normalize('NFC').toLowerCase());
    if (allTerms.some(t => qNorm.includes(t))) {
      allTerms.forEach(t => expandedTerms.add(t));
    }
  }

  // Split on ## and ###
  let rawSections = SAHAYAK_KNOWLEDGE.normalize('NFC').split(/\\n(?=#{2,3}\\s)/).filter(s => s.trim().length > 20);

  // Chunk sections > 1500 chars
  const chunkedSections: string[] = [];
  for (const sec of rawSections) {
    if (sec.length <= 1500) {
      chunkedSections.push(sec);
    } else {
      let currentChunk = "";
      const lines = sec.split('\\n');
      for (const line of lines) {
        if (currentChunk.length + line.length > 1500 && currentChunk.length > 0) {
          chunkedSections.push(currentChunk);
          currentChunk = line;
        } else {
          currentChunk += (currentChunk ? "\\n" : "") + line;
        }
      }
      if (currentChunk) chunkedSections.push(currentChunk);
    }
  }

  function score(section: string): number {
    const lines = section.split('\\n');
    const heading = lines[0].toLowerCase();
    const body = lines.slice(1).join('\\n').toLowerCase();
    
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

  (globalThis as any).__sahayakRankedSections = ranked.slice(0, 3).map(r => ({ heading: r.s.split('\\n')[0].substring(0, 50), score: r.sc }));

  if (ranked.length === 0) return "";

  let combined = "";
  for (const item of ranked.slice(0, 3)) {
    const section = item.s.trim();
    if (combined.length + section.length > maxChars) {
      const remaining = maxChars - combined.length;
      if (remaining > 200) {
        combined += "\\n\\n" + section.slice(0, remaining);
      }
      break;
    }
    combined += (combined ? "\\n\\n" : "") + section;
  }

  return combined;
}`;

const startIndex = code.indexOf(oldRetrieveStart);
if (startIndex !== -1) {
  const endIndex = code.indexOf(oldRetrieveEnd, startIndex) + oldRetrieveEnd.length;
  code = code.substring(0, startIndex) + newRetrieve + code.substring(endIndex);
} else {
  console.log("Could not find retrieveContext");
}

// Add missing synonyms
code = code.replace('"\\u0A9A\\u0AC2\\u0A82\\u0A9F\\u0AA3\\u0AC0": ["voter", "epic", "\\u0AAE\\u0AA4\\u0AA6\\u0ABE\\u0AB0", "form 6", "election", "\\u0A9A\\u0AC2\\u0A82\\u0A9F\\u0AA3\\u0AC0 \\u0A95\\u0ABE\\u0AB0\\u0ACD\\u0AA1"],', '"\\u0A9A\\u0AC2\\u0A82\\u0A9F\\u0AA3\\u0AC0": ["voter", "epic", "\\u0AAE\\u0AA4\\u0AA6\\u0ABE\\u0AB0", "form 6", "election", "\\u0A9A\\u0AC2\\u0A82\\u0A9F\\u0AA3\\u0AC0 \\u0A95\\u0ABE\\u0AB0\\u0ACD\\u0AA1", "\\u0A9A\\u0AC1\\u0A82\\u0A9F\\u0AA3\\u0AC0", "\\u0A9A\\u0AC1\\u0A82\\u0A9F\\u0AA3\\u0AC0 \\u0A95\\u0ABE\\u0AB0\\u0ACD\\u0AA1"],\n  "\\u0AA1\\u0ACB\\u0A95\\u0ACD\\u0AAF\\u0AC1\\u0AAE\\u0AC7\\u0AA8\\u0ACD\\u0A9F": ["\\u0AA6\\u0AB8\\u0ACD\\u0AA4\\u0ABE\\u0AB5\\u0AC7\\u0A9C", "documents", "document"],');

// 3. Add Reason Codes & Debug logging
if (!code.includes('llm_said_unavailable')) {
  code = code.replace('let reply = postFilter(rawReply);', 'let reply = postFilter(rawReply);\n      if (reply.includes("\\u0A86 \\u0AB5\\u0ABF\\u0AB7\\u0AAF\\u0AA8\\u0AC0 verified \\u0AAE\\u0ABE\\u0AB9\\u0ABF\\u0AA4\\u0AC0 \\u0AB9\\u0ABE\\u0AB2 \\u0A89\\u0AAA\\u0AB2\\u0AAC\\u0ACD\\u0AA7 \\u0AA8\\u0AA5\\u0AC0.")) {\n        (req as any)._sahayakReason = "llm_said_unavailable";\n      }');

  code = code.replace(
    'const sendReply = (rawReply: string) => {',
    `const sendReply = (rawReply: string, providerInfo: any = { provider: "unknown", status: "ok" }) => {`
  );

  code = code.replace(
    'reply += buildFooter();\n      res.json({ reply });',
    `reply += buildFooter();
      
      const debugData: any = {};
      if (req.headers['x-admin-token'] === 'smit-admin-debug' || (req.query as any).debug === 'true') {
         debugData.debug = {
            reason: (req as any)._sahayakReason || "ok",
            provider: providerInfo.provider,
            status: providerInfo.status || "ok",
            matchedSections: (globalThis as any).__sahayakRankedSections || []
         };
      }
      res.json({ reply, ...debugData });`
  );

  code = code.replace('sendReply(json.reply);', 'sendReply(json.reply, { provider: "external", status: "ok" });');
  code = code.replace('sendReply(reply);\n              sambaSuccess = true;', 'sendReply(reply, { provider: "sambanova", status: "ok" });\n              sambaSuccess = true;');
  code = code.replace('sendReply(reply);\n              geminiSuccess = true;', 'sendReply(reply, { provider: "gemini", status: "ok" });\n              geminiSuccess = true;');

  code = code.replace(
    'const fallbackReply = context\n      ? FIXED_NO_INFO\n      : FIXED_NO_INFO;\n    sendReply(fallbackReply);',
    'const fallbackReply = FIXED_NO_INFO;\n    (req as any)._sahayakReason = "llm_error";\n    sendReply(fallbackReply, { provider: "fallback", status: "all_providers_failed" });'
  );

  code = code.replace(
    'const contextBlock = context\n      ? `\\n\\nCONTEXT:\\n${context}`\n      : "\\n\\nCONTEXT: No specific information available for this query.";',
    `const contextBlock = context\n      ? \`\\n\\nCONTEXT:\\n\${context}\`\n      : "\\n\\nCONTEXT: No specific information available for this query.";\n    if (!context) { (req as any)._sahayakReason = "no_match"; }`
  );
}

fs.writeFileSync('artifacts/api-server/src/routes/sahayak.ts', code, 'utf8');
console.log("Rewritten successfully");
