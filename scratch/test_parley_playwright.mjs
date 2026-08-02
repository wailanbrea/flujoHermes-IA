import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

async function main() {
  console.log("Launching chromium...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log("Navigating to http://127.0.0.1:8080/ ...");
  const response = await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
  console.log("Page status:", response ? response.status() : "No response");
  
  const title = await page.title();
  console.log("Page title:", title);
  
  const screenshotPath = "C:/AI-Workspace/local-ai-orchestrator/output/playwright/parley-web-test.png";
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log("Screenshot saved to:", screenshotPath);
  
  const pageContent = await page.content();
  console.log("Content length:", pageContent.length);

  // Inspect key UI elements
  const buttons = await page.$$eval("button, input[type='button'], input[type='submit']", els => els.map(e => e.innerText || e.value));
  console.log("Interactive buttons found:", buttons);

  await browser.close();
}

main().catch(err => {
  console.error("Playwright test error:", err);
  process.exit(1);
});
