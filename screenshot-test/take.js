const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 800, height: 800 }
  });
  
  const fileUrl = 'file:///' + path.resolve('../widget-preview.html').replace(/\\/g, '/');
  console.log('Loading', fileUrl);
  await page.goto(fileUrl);
  
  // Wait a moment for tailwind to load and apply
  await page.waitForTimeout(1000);
  
  await page.screenshot({ path: '../widget-screenshot.png' });
  console.log('Saved screenshot');
  await browser.close();
})();
