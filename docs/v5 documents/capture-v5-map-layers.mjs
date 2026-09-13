/**
 * Capture fleet map + expanded layers dropdown for the marketing site.
 * Uses the same Playwright install as capture-v5-shots.mjs (%TEMP%\fd-v5-capture).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(os.tmpdir(), "fd-v5-capture", "package.json"));
const { chromium } = require("playwright");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "doc-screenshots");
const BASE = process.env.FARMDASH_CAPTURE_URL || "http://127.0.0.1:8767/";
const SAVE_ID = process.env.FARMDASH_CAPTURE_SAVE_ID || "srv_1788536326834_2";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const url = new URL(BASE);
  url.hash = "/map";
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".fd-main__content", { timeout: 30000 });
  const selectSave = page.locator(".fd-topbar__save-select");
  if (await selectSave.count()) {
    await selectSave.selectOption(SAVE_ID);
    await sleep(1800);
  }
  await page.waitForSelector(".fd-fleet-map", { timeout: 20000 });
  await sleep(1200);

  const mapPng = path.join(OUT, "v5-section-fleet-map-010.png");
  await page.screenshot({ path: mapPng, type: "png" });
  console.log("wrote", path.basename(mapPng), fs.statSync(mapPng).size);

  await page.evaluate(() => {
    const sel = document.querySelector(".fd-fleet-map__overlay select");
    if (!sel) return;
    const n = Math.max(sel.options.length, 8);
    sel.setAttribute("size", String(Math.min(n, 18)));
    sel.style.height = "auto";
    sel.style.maxHeight = "72vh";
    sel.style.minWidth = "16rem";
    sel.style.position = "relative";
    sel.style.zIndex = "20";
  });
  await sleep(400);
  const layersPng = path.join(OUT, "v5-section-fleet-map-020-layers-dropdown.png");
  await page.screenshot({ path: layersPng, type: "png" });
  console.log("wrote", path.basename(layersPng), fs.statSync(layersPng).size);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
