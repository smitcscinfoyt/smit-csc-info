const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  await page.goto('https://github.com/smitcscinfoyt/smit-csc-sahayak/actions/runs/36669661218/job/109741729316', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  await page.screenshot({ path: 'gh_error.png' });
  
  await browser.close();
})();
