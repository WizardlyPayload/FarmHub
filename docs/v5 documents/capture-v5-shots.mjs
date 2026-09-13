/**
 * Capture V5 dashboard PNGs from a running app (default http://127.0.0.1:8767/).
 *
 * Usage (from repo root, Playwright already on PATH via npx):
 *   node "docs/v5 documents/capture-v5-shots.mjs"
 *   node "docs/v5 documents/capture-v5-shots.mjs" --pack suite
 *   node "docs/v5 documents/capture-v5-shots.mjs" --pack base
 *
 * --pack suite  Riverbend / mods-on save. Writes v5-<area>-*-scroll.png (and optional tops).
 * --pack base   Vanilla FS25 + Farm Dashboard only. Writes v5-base-<area>-*.png
 *
 * Preconditions: FS25 loaded, data.json current, V5 UI up. Viewport 1920x1080.
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
/** Riverbend Springs savegame2 — matches the existing suite marketing tops. */
const SAVE_ID = process.env.FARMDASH_CAPTURE_SAVE_ID || "srv_1788536326834_2";
const packArg = process.argv.includes("--pack")
  ? process.argv[process.argv.indexOf("--pack") + 1]
  : "suite";
const PACK = packArg === "base" ? "base" : "suite";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shotName(id) {
  return PACK === "base" ? `v5-base-${id}.png` : `v5-${id}.png`;
}

/** Scrolled marketing pack (suite save). Tops already exist as *-010. */
const SUITE_SCROLL = [
  { hash: "#/", id: "shell-030-activity-scroll", ratio: 0.32 },
  { hash: "#/", id: "shell-040-field-tiles-scroll", ratio: 0.78 },
  { hash: "#/fields", id: "fields-030-cards-scroll", selector: ".fd-field-card", index: 2 },
  { hash: "#/fields", id: "fields-040-more-cards-scroll", selector: ".fd-field-card", index: 8 },
  { hash: "#/fields", id: "fields-050-lower-cards-scroll", selector: ".fd-field-card", index: 16 },
  { hash: "#/vehicles", id: "section-vehicles-020-filters-scroll", ratio: 0.18 },
  { hash: "#/vehicles", id: "section-vehicles-030-grid-scroll", ratio: 0.48 },
  { hash: "#/vehicles", id: "section-vehicles-040-more-grid-scroll", ratio: 0.88 },
  { hash: "#/pastures", id: "section-pastures-020-list-scroll", ratio: 0.35 },
  { hash: "#/pastures", id: "section-pastures-030-herd-scroll", ratio: 0.72 },
  { hash: "#/storage", id: "section-storage-020-silos-scroll", ratio: 0.38 },
  { hash: "#/storage", id: "section-storage-030-bales-scroll", ratio: 0.82 },
  { hash: "#/economy", id: "section-economy-030-lower-scroll", ratio: 0.55 },
  { hash: "#/productions", id: "section-productions-020-chains-scroll", ratio: 0.55 },
];

/** Vanilla / base-game pack: tops + one mid-scroll per core screen. */
const BASE_PACK = [
  { hash: "#/", id: "shell-020-overview", ratio: 0 },
  { hash: "#/", id: "shell-030-activity-scroll", ratio: 0.4 },
  { hash: "#/", id: "shell-040-field-tiles-scroll", ratio: 0.8 },
  { hash: "#/fields", id: "fields-010-page", ratio: 0 },
  { hash: "#/fields", id: "fields-030-cards-scroll", ratio: 0.45 },
  { hash: "#/fields", id: "fields-050-lower-cards-scroll", ratio: 0.9 },
  { hash: "#/vehicles", id: "section-vehicles-010", ratio: 0 },
  { hash: "#/vehicles", id: "section-vehicles-030-grid-scroll", ratio: 0.55 },
  { hash: "#/pastures", id: "section-pastures-010", ratio: 0 },
  { hash: "#/pastures", id: "section-pastures-030-herd-scroll", ratio: 0.7 },
  { hash: "#/storage", id: "section-storage-010", ratio: 0 },
  { hash: "#/storage", id: "section-storage-020-silos-scroll", ratio: 0.5 },
  { hash: "#/economy", id: "section-economy-010", ratio: 0 },
  { hash: "#/economy", id: "section-economy-030-lower-scroll", ratio: 0.55 },
  { hash: "#/productions", id: "section-productions-010", ratio: 0 },
  { hash: "#/map", id: "section-fleet-map-010", ratio: 0 },
];

const JOBS = PACK === "base" ? BASE_PACK : SUITE_SCROLL;

async function waitReady(page) {
  await page.waitForSelector(".fd-main__content", { timeout: 30000 });
  await sleep(800);
}

async function selectSave(page) {
  const select = page.locator(".fd-topbar__save-select");
  if (await select.count()) {
    await select.selectOption(SAVE_ID);
    await sleep(1500);
    return;
  }
  const tab = page.locator(`.fd-topbar__tab`, { hasText: "Riverbend" }).first();
  if (await tab.count()) {
    await tab.click();
    await sleep(1500);
  }
}

async function gotoHash(page, hash) {
  const url = new URL(BASE);
  url.hash = hash.replace(/^#/, "");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitReady(page);
}

async function scrollMain(page, job) {
  if (job.selector) {
    await page.evaluate(({ selector, index }) => {
      const main = document.querySelector(".fd-main__content");
      const cards = document.querySelectorAll(selector);
      const el = cards[index];
      if (!main || !el) return;
      const pad = 8;
      const top =
        el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - pad;
      main.scrollTop = Math.max(0, top);
    }, { selector: job.selector, index: job.index || 0 });
  } else {
    await page.evaluate((r) => {
      const el = document.querySelector(".fd-main__content");
      if (!el) return;
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = r <= 0 ? 0 : Math.round(max * Math.min(1, r));
    }, job.ratio || 0);
  }
  await sleep(450);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  await gotoHash(page, "#/");
  await selectSave(page);
  const title = await page.title();
  console.log(`pack=${PACK} save=${SAVE_ID} title=${title} url=${page.url()}`);

  let lastHash = "";
  for (const job of JOBS) {
    if (job.hash !== lastHash) {
      await gotoHash(page, job.hash);
      lastHash = job.hash;
    }
    await scrollMain(page, job);
    const file = path.join(OUT, shotName(job.id));
    await page.screenshot({ path: file, type: "png" });
    const st = fs.statSync(file);
    const how = job.selector ? `${job.selector}[${job.index}]` : `ratio=${job.ratio}`;
    console.log(`wrote ${path.basename(file)} (${st.size} bytes) ${how}`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
