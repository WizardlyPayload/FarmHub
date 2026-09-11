import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(
  root,
  "..",
  "FS25_FarmDashboard_App",
  "web",
  "locales",
  "translations.json"
);
const destDir = path.join(root, "public", "locales");
const dest = path.join(destDir, "translations.json");

if (!fs.existsSync(src)) {
  console.warn("[copy-locales] Source missing — run i18n:build in FS25_FarmDashboard_App first");
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("[copy-locales] copied translations.json");
