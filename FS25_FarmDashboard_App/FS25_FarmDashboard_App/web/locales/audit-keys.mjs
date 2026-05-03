/**
 * FS25 FarmDashboard | i18n catalog audit (read-only).
 *
 * Walks HTML + JS sources for referenced i18n keys (data-i18n*, data-setup-i18n*,
 * t('...')) and compares against the compiled catalog (translations.json). Prints:
 *   - Missing keys: referenced in source but absent from the catalog.
 *   - Unused keys: in the catalog but never referenced.
 *   - Empty English values: defined but the English string is empty.
 *   - AI/LLM leftovers: any key whose name or English value still contains
 *     `ai`, `llm`, `gemini`, `openai`, `consultant`, ...
 *
 * Usage: node web/locales/audit-keys.mjs
 * Exit code 0 on success (report only); no files are written.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..", "..");
const WEB_ROOT = path.resolve(__dirname, "..");
const SETUP_HTML = path.resolve(APP_ROOT, "setup.html");
const TRANSLATIONS = path.resolve(__dirname, "translations.json");
/** Main-process strings (app-updater.js) use tr('…'); scan so keys stay in catalog audit */
const APP_UPDATER_JS = path.resolve(APP_ROOT, "app-updater.js");

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "release",
  "out",
  ".git",
  "locales",
  "items_mod_extract",
]);

const SOURCE_EXT = new Set([".js", ".mjs", ".cjs", ".html"]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (SOURCE_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

const KEY_PATTERN =
  /(?:data-i18n(?:-placeholder|-title|-aria|-html)?|data-setup-i18n(?:-title|-placeholder|-html)?)\s*=\s*['"]([A-Za-z][\w.-]*)['"]/g;
const T_CALL_PATTERN = /\b(?:t|tr|setupT)\(\s*['"`]([A-Za-z][\w.-]*)['"`]/g;
// Bare string literals that look like dotted catalog keys — these appear when a key
// is referenced dynamically (e.g. inside arrays, variables, or switch lookups) and
// would otherwise look "unused" to the static scanner.
const BARE_LITERAL_PATTERN = /['"`]([a-z][\w-]*\.[\w.-]+)['"`]/g;

function collectReferencedKeys(files, catalogKeys) {
  const keys = new Set();
  const bareCandidates = new Set();
  for (const file of files) {
    let src;
    try {
      src = fs.readFileSync(file, "utf8");
    } catch (_) {
      continue;
    }
    // Skip the build script and audit script themselves so definitions/comments
    // don't count as references.
    const base = path.basename(file);
    const isLocaleBuild =
      base === "build-translations.mjs" || base === "audit-keys.mjs";

    let m;
    KEY_PATTERN.lastIndex = 0;
    while ((m = KEY_PATTERN.exec(src)) !== null) keys.add(m[1]);
    T_CALL_PATTERN.lastIndex = 0;
    while ((m = T_CALL_PATTERN.exec(src)) !== null) keys.add(m[1]);

    if (isLocaleBuild) continue;
    BARE_LITERAL_PATTERN.lastIndex = 0;
    while ((m = BARE_LITERAL_PATTERN.exec(src)) !== null) {
      bareCandidates.add(m[1]);
    }
  }
  // Only count bare literals that actually match a catalog key — avoids false
  // positives from CSS class names, selectors, filenames, etc.
  for (const cand of bareCandidates) {
    if (catalogKeys.has(cand)) keys.add(cand);
  }
  return keys;
}

function loadCatalog() {
  if (!fs.existsSync(TRANSLATIONS)) {
    throw new Error(
      `translations.json not found at ${TRANSLATIONS} — run build-translations.mjs first.`
    );
  }
  const raw = JSON.parse(fs.readFileSync(TRANSLATIONS, "utf8"));
  if (!raw || typeof raw !== "object" || !raw.strings) {
    throw new Error("translations.json has unexpected shape (no .strings)");
  }
  return raw.strings;
}

const AI_LEFTOVER_RE = /\b(?:ai|llm|gemini|openai|consultant|byok|field\s*consultant)\b/i;

function main() {
  const files = walk(WEB_ROOT);
  if (fs.existsSync(SETUP_HTML)) files.push(SETUP_HTML);
  if (fs.existsSync(APP_UPDATER_JS)) files.push(APP_UPDATER_JS);

  const catalog = loadCatalog();
  const defined = new Set(Object.keys(catalog));
  const referenced = collectReferencedKeys(files, defined);

  const missing = [...referenced].filter((k) => !defined.has(k)).sort();
  const unused = [...defined].filter((k) => !referenced.has(k)).sort();
  const emptyEn = [...defined]
    .filter((k) => {
      const row = catalog[k];
      return !row || typeof row !== "object" || row.en == null || row.en === "";
    })
    .sort();

  const aiLeftovers = [];
  for (const k of defined) {
    const row = catalog[k];
    const enVal = row && typeof row === "object" ? String(row.en || "") : "";
    if (AI_LEFTOVER_RE.test(k) || AI_LEFTOVER_RE.test(enVal)) {
      aiLeftovers.push({ key: k, en: enVal });
    }
  }

  const summary = {
    sourceFilesScanned: files.length,
    referencedKeys: referenced.size,
    definedKeys: defined.size,
    missingCount: missing.length,
    unusedCount: unused.length,
    emptyEnCount: emptyEn.length,
    aiLeftoverCount: aiLeftovers.length,
  };

  console.log("== i18n catalog audit ==");
  console.log(JSON.stringify(summary, null, 2));
  console.log("");

  console.log(`-- Missing keys (referenced in source, absent from catalog): ${missing.length}`);
  for (const k of missing) console.log(`  ${k}`);
  console.log("");

  console.log(`-- Unused keys (in catalog, no source reference): ${unused.length}`);
  for (const k of unused) console.log(`  ${k}`);
  console.log("");

  console.log(`-- Empty English values: ${emptyEn.length}`);
  for (const k of emptyEn) console.log(`  ${k}`);
  console.log("");

  console.log(`-- AI/LLM leftovers (key or en value matches ${AI_LEFTOVER_RE}): ${aiLeftovers.length}`);
  for (const item of aiLeftovers) {
    console.log(`  ${item.key} => ${JSON.stringify(item.en)}`);
  }

  const hardFail = missing.length > 0 || emptyEn.length > 0;
  process.exit(hardFail ? 1 : 0);
}

main();
