#!/usr/bin/env node
/** Compare items/ on disk vs hardcoded list in vehicles.js */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const itemsDir = path.join(root, "web/assests/img/items");
const modDir = path.join(root, "web/assests/img/items_mod_extract");
const js = fs.readFileSync(
  path.join(root, "web/assests/js/modules/vehicles.js"),
  "utf8"
);
const m = js.match(/const imageFiles = \[([\s\S]*?)\];/);
const hard = new Set(
  [...(m?.[1]?.matchAll(/"([^"]+\.png)"/g) ?? [])].map((x) => x[1])
);
const items = fs.readdirSync(itemsDir).filter((f) => /\.png$/i.test(f));
const mods = fs.readdirSync(modDir).filter((f) => /\.png$/i.test(f));
const missingFromHard = items.filter((f) => !hard.has(f));
const hardNotOnDisk = [...hard].filter((f) => !items.includes(f));

console.log("items on disk:", items.length);
console.log("mod extract on disk:", mods.length);
console.log("hardcoded in vehicles.js:", hard.size);
console.log("on disk but NOT in hardcoded list:", missingFromHard.length);
console.log("sample missing from hardcoded:", missingFromHard.slice(0, 20));
console.log("hardcoded but missing on disk:", hardNotOnDisk.length);
console.log(
  "vehicles__ style in items/:",
  items.filter((f) => f.includes("__")).length
);
