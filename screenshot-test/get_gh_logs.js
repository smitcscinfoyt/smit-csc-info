const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://github.com/smitcscinfoyt/smit-csc-sahayak/actions/runs/36669661218/job/109741729316', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // Give React time to render
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log(text.substring(0, 5000));
  
  await browser.close();
})();
