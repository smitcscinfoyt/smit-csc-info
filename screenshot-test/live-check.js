const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Desktop
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto("https://smitcscinfo.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(__dirname, "../screenshots-final/live-homepage.png"), fullPage: false });
  console.log("Homepage screenshot done");

  // Check if the AI Sahayak button is visible
  const btn = page.locator("button").filter({ hasText: "Sahayak" }).first();
  const btnVisible = await btn.isVisible().catch(() => false);
  console.log("Chat button visible:", btnVisible);

  await browser.close();
})();
