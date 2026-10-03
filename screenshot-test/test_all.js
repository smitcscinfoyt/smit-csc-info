
const { chromium, devices } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

const longMessageText = `Hello!
Here are some helpful links for your reference:
1. https://example.com/some/long/path?that=might&wrap=wrongly
2. https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh
Enjoy the resources!`;

const shortMessageText = "Hello! How can I help you today?";
const whatsappMessageText = "Please join our group: https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh";

async function runTest() {
  console.log("Starting dev server...");
  const devServer = spawn("npm.cmd", ["run", "dev"], {
    cwd: path.join(__dirname, "../artifacts/smit-csc-info"),
    shell: true,
  });

  // wait for server to start
  await new Promise(resolve => setTimeout(resolve, 8000));

  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });

  for (const size of ["mobile", "desktop"]) {
    console.log(`Testing size: ${size}`);
    const context = await browser.newContext(
      size === "mobile" ? devices["iPhone 13"] : { viewport: { width: 1280, height: 720 } }
    );
    const page = await context.newPage();

    let currentMockResponse = shortMessageText;

    await page.route("**/api/user/status", route => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ is_prime: true })
    }));

    await page.route("**/api/sahayak/chat", route => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reply: currentMockResponse })
    }));

    await page.goto(BASE_URL);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // open chat if needed
    const button = page.locator("button", { hasText: "Smit AI Sahayak" }).first();
    if (await button.isVisible()) {
      await button.click();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const input = page.locator("input[type=\"text\"]");
    const sendBtn = page.locator("button[aria-label=\"Send\"]");

    async function sendMsgAndScreenshot(userMsg, aiMsg, name) {
      currentMockResponse = aiMsg;
      await input.fill(userMsg);
      await sendBtn.click();
      // wait a bit
      await new Promise(resolve => setTimeout(resolve, 3000));
      await page.screenshot({ path: path.join(__dirname, `../screenshots-final/${name}-${size}.png`) });
    }

    await sendMsgAndScreenshot("short", shortMessageText, "short-message");
    await sendMsgAndScreenshot("whatsapp", whatsappMessageText, "whatsapp-url");
    await sendMsgAndScreenshot("long", longMessageText, "long-message");

    await context.close();
  }

  await browser.close();
  devServer.kill();
  process.exit(0);
}
runTest();

