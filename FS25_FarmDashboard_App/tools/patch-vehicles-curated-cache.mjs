import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const file = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../web/assests/js/modules/vehicles.js"
);
let s = fs.readFileSync(file, "utf8");
const start =
  "  // Cache for image files (populate once): curated items/ first; items_mod_extract/ filled from API list";
const end = "  if (this.vehicleImageCacheModBuilt !== true) {";
const i = s.indexOf(start);
const j = s.indexOf(end);
if (i < 0 || j < 0 || j <= i) {
  console.error("Markers not found", { i, j });
  process.exit(1);
}
const replacement = `  // Cache for image files (populate once): full items/ + items_mod_extract/ lists from API
  if (!this.vehicleImageCacheCuratedBuilt) {
    this.vehicleImageCacheCurated = [];
    for (const filenameRaw of itemsImageFilenames) {
      const entry = buildShopImageCacheEntry(
        filenameRaw,
        "/assests/img/items/",
        normalizeText
      );
      if (entry) this.vehicleImageCacheCurated.push(entry);
    }
    this.vehicleImageCacheCuratedBuilt = true;
  }

  `;
s = s.slice(0, i) + replacement + s.slice(j);
fs.writeFileSync(file, s);
console.log("Replaced hardcoded curated list with API-driven cache");
