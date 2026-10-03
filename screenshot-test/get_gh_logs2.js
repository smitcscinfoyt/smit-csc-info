const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Set a longer timeout and just wait for the page to load
  await page.goto('https://github.com/smitcscinfoyt/smit-csc-sahayak/actions/runs/36669661218/job/109741729316', { waitUntil: 'load', timeout: 60000 });
  
  // Wait for the log lines to appear
  try {
    await page.waitForSelector('.log-line', { timeout: 15000 });
  } catch (e) {
    console.log("Could not find .log-line");
  }
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log("---- PAGE TEXT ----");
  console.log(text.substring(0, 5000));
  
  await browser.close();
})();
