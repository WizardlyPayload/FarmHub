/**
 * Contract: unique #7 rescues that must stay on main.
 * Run: node --test tests/collectionSafetyV7.luaContract.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");

function readMod(rel) {
  return fs.readFileSync(path.join(modSrc, rel), "utf8");
}

test("loadMap pcall-guards DataCollector init instead of calling :init() bare", () => {
  const src = readMod("FarmDashboard.lua");
  const start = src.indexOf("function FarmDashboard:loadMap()");
  assert.ok(start >= 0, "missing FarmDashboard:loadMap");
  const body = src.slice(start, src.indexOf("\nfunction ", start + 1));
  assert.match(body, /rawget\(_G,\s*"FarmDashboardDataCollector"\)/);
  assert.match(body, /pcall\(/);
  assert.doesNotMatch(body.replace(/--[^\n]*/g, ""), /FarmDashboardDataCollector:init\(\)/);
});

test("collectionSafetyV7 restores fields, economy, and production", () => {
  const src = readMod("FarmDashboardDataCollector.lua");
  assert.match(src, /collectionSafetyV7Applied/);
  const start = src.indexOf('collectionSafetyV7Applied');
  const block = src.slice(start, start + 1200);
  assert.match(block, /enableFields/);
  assert.match(block, /enableEconomy/);
  assert.match(block, /enableProduction/);
});

test("ESC settings inject does not persist Off during setState sync", () => {
  const src = readMod("FarmDashboardSettingsMenu.lua");
  assert.match(src, /FarmDashboardSettingsMenu\._syncing/);
  const handler = src.slice(src.indexOf("function FarmDashboardSettingsControls.onMenuOptionChanged"));
  assert.match(handler, /if FarmDashboardSettingsMenu\._syncing then return end/);
});

test("Dairy Core export includes placeable barn name", () => {
  const src = readMod("collectors/rf/RfDairyDataCollector.lua");
  assert.match(src, /local function barnPlaceableName/);
  assert.match(src, /placeable:getName\(\)/);
  assert.match(src, /name = barnPlaceableName\(barn\)/);
});
