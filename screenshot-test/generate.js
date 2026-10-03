
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { background: #f0f0f0; font-family: system-ui, -apple-system, sans-serif; }
</style>
</head>
<body class="flex items-center justify-center h-screen bg-gray-100">
<div class="relative w-full h-[640px] rounded-2xl overflow-hidden shadow-2xl border border-amber-300/40 flex flex-col" style="max-width: 400px; background: linear-gradient(160deg, #1a0938 0%, #2d0a5b 45%, #3b0764 100%)">
  <div class="p-5 pt-6 flex-shrink-0">
    <div class="flex items-center gap-3 mb-4">
      <div class="h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg" style="background: linear-gradient(135deg, #FFD700, #DAA520)"></div>
      <div>
        <h2 class="text-[17px] font-semibold text-amber-50">Smit AI Sahayak</h2>
      </div>
    </div>
  </div>
  <div class="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col min-h-0">
    <!-- User msg -->
    <div class="flex min-w-0 max-w-[88%] text-[13px] leading-relaxed rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap select-text break-words [overflow-wrap:anywhere] self-end bg-gradient-to-br from-purple-700 to-purple-900 text-amber-100 border border-amber-300/20 rounded-br-sm">
      Can you show me the link?
    </div>
    
    <!-- AI msg (FIXED VERSION - no flex) -->
    <div class="min-w-0 max-w-[88%] text-[13px] leading-relaxed rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap select-text break-words [overflow-wrap:anywhere] self-start bg-white/6 text-amber-100/90 border border-amber-300/10 rounded-bl-sm">
      REPLACE_ME
    </div>
  </div>
</div>
</body>
</html>`;

const cases = {
  "short-message": "Hello! How can I help you today?",
  "whatsapp-url": "<span>Please join our group: </span><span><a href=\"https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh\" class=\"underline break-all\">https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh</a></span>",
  "long-message": "<span>Hello!<br>Here are some helpful links:<br>1. </span><span><a href=\"https://example.com/some/long/path?that=might&wrap=wrongly\" class=\"underline break-all\">https://example.com/some/long/path?that=might&wrap=wrongly</a></span><span><br>2. </span><span><a href=\"https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh\" class=\"underline break-all\">https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh</a></span><span><br>Enjoy!</span>"
};

(async () => {
  const browser = await chromium.launch();
  for (const size of ["mobile", "desktop"]) {
    const context = await browser.newContext(
      size === "mobile" ? { viewport: { width: 375, height: 812 } } : { viewport: { width: 1280, height: 720 } }
    );
    const page = await context.newPage();
    
    for (const [name, content] of Object.entries(cases)) {
      const html = htmlTemplate.replace("REPLACE_ME", content);
      const filePath = path.join(__dirname, `${name}.html`);
      fs.writeFileSync(filePath, html);
      
      await page.goto("file:///" + filePath.replace(/\\\\/g, "/"));
      await page.waitForTimeout(1000);
      
      const outPath = path.join(__dirname, `../screenshots-final/${name}-${size}.png`);
      await page.screenshot({ path: outPath });
      console.log(`Saved ${outPath}`);
    }
    await context.close();
  }
  await browser.close();
})();

