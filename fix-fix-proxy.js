const fs = require('fs');

let code = fs.readFileSync('fix-proxy.js', 'utf8');
code = code.replace(
  '...safeHistory.map(m => ({ role: m.role as any, parts: [{ text: m.content }] })),',
  '...safeHistory.map(m => ({ role: (m.role === "assistant" ? "model" : "user") as any, parts: [{ text: m.content }] })),'
);
fs.writeFileSync('fix-proxy.js', code);
