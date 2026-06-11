#!/usr/bin/env node
/** Smoke-test vehicle image matching against on-disk PNG lists (no browser). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

globalThis.window = globalThis.window || {
  fetch: async () => ({ ok: false, json: async () => ({}) }),
  location: { pathname: "/" },
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const itemsDir = path.join(root, "web/assests/img/items");
const modDir = path.join(root, "web/assests/img/items_mod_extract");

const items = fs.readdirSync(itemsDir).filter((f) => /\.png$/i.test(f));
const modExtract = fs.readdirSync(modDir).filter((f) => /\.png$/i.test(f));

const vehicles = await import("../web/assests/js/modules/vehicles.js");
vehicles.primeShopImageFilenames({ items, modExtract });

const ctx = {
  vehicleImageCacheCurated: null,
  vehicleImageCacheCuratedBuilt: false,
  vehicleImageCacheMod: null,
  vehicleImageCacheModBuilt: false,
};

const samples = [
  ["T7.260", "New Holland", "tractor"],
  ["Puma 260 CVXDrive", "Case IH", "tractor"],
  ["8R 410", "John Deere", "tractor"],
  ["MF 8570", "Massey Ferguson", "harvester"],
  ["541-70 AGRI PRO", "JCB", "teleHandler"],
  ["Vario 1067 V", "Fendt", "tractor"],
  ["CS 2252", "Jonsered", "handTool"],
  ["MS 261", "STIHL", "handTool"],
];

console.log(`Indexed ${items.length} curated + ${modExtract.length} mod PNGs\n`);
let matched = 0;
for (const [name, brand, type] of samples) {
  const img = vehicles.findVehicleImageDynamic.call(ctx, name, brand, type);
  const ok = img ? "OK" : "MISS";
  if (img) matched++;
  console.log(`${ok}  ${brand} ${name} (${type})`);
  if (img) console.log(`     -> ${img}`);
}
console.log(`\n${matched}/${samples.length} sample matches`);
