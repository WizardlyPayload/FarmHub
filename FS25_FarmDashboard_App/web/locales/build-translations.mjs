/**
 * Regenerates translations.json (compact JSON) from per-locale JSON files.
 *
 * Source of truth: `messages/en.json` (every key the app can reference).
 * Per-locale overrides live in `messages/<code>.json` (only keys that differ
 * from English need to be listed; missing keys fall back to English).
 *
 * Output rows always carry `en`; a non-English locale is written only when its
 * value differs from English. Every runtime lookup (NEW APP i18n.ts, classic
 * i18n.js, setup-i18n.js, app-updater.js) resolves a missing locale to `en`, so
 * the English copies `i18n:sync` writes into messages/<code>.json cost no catalog
 * bytes until a real translation replaces them.
 *
 * Validation:
 *   - Every key in a non-en locale must exist in en.json (otherwise the key
 *     was either renamed or is a typo).
 *   - Empty string values are rejected.
 *   - `{{placeholder}}` tokens must match between en and each override.
 *
 * Usage: `node web/locales/build-translations.mjs` (runs via `npm run i18n:build`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.join(__dirname, 'messages');
const OUT_PATH = path.join(__dirname, 'translations.json');

const ALL_LANGS = [
  'en', 'de', 'fr', 'es', 'it', 'pl', 'nl', 'pt', 'sv', 'da', 'fi', 'cs',
  'el', 'hu', 'ro', 'bg', 'hr', 'sk', 'sl', 'et', 'lv', 'lt', 'ga', 'mt',
  'is', 'nb', 'uk',
];

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z_][\w]*)\s*\}\}/g;

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// The runtime catalog is compact JSON: pretty-printing it costs ~600 KB against the 4 MiB
// catalog limits in NEW APP (i18n.ts cache, recorded publication). messages/*.json stay readable.
function writeJsonRetry(filePath, obj) {
  const payload = JSON.stringify(obj);
  let lastErr;
  for (let i = 0; i < 10; i++) {
    const tmp = `${filePath}.${process.pid}.${i}.tmp`;
    try {
      fs.writeFileSync(tmp, payload, 'utf8');
      try {
        fs.renameSync(tmp, filePath);
        try { fs.unlinkSync(tmp); } catch { /* renamed already */ }
        return;
      } catch {
        fs.copyFileSync(tmp, filePath);
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        return;
      }
    } catch (e) {
      lastErr = e;
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      sleepMs(120 * (i + 1));
    }
  }
  throw lastErr;
}

function readLocale(code) {
  const full = path.join(MESSAGES_DIR, `${code}.json`);
  if (!fs.existsSync(full)) return {};
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    throw new Error(`[build-translations] failed to parse ${full}: ${e.message}`);
  }
}

function placeholderSet(str) {
  const out = new Set();
  if (typeof str !== 'string') return out;
  let m;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(str))) out.add(m[1]);
  return out;
}

function equalSets(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function main() {
  const enObj = readLocale('en');
  const enKeys = Object.keys(enObj);
  if (!enKeys.length) {
    throw new Error('[build-translations] messages/en.json is empty or missing');
  }

  const allLocales = {};
  allLocales.en = enObj;

  const issues = [];

  for (const lang of ALL_LANGS) {
    if (lang === 'en') continue;
    const obj = readLocale(lang);
    for (const k of Object.keys(obj)) {
      if (!(k in enObj)) {
        issues.push(`[${lang}] unknown key not in en.json: ${k}`);
        continue;
      }
      const v = obj[k];
      if (typeof v !== 'string') {
        issues.push(`[${lang}] non-string value for key: ${k}`);
        continue;
      }
      if (v.trim() === '') {
        issues.push(`[${lang}] empty translation for key: ${k}`);
        continue;
      }
      const enPh = placeholderSet(enObj[k]);
      const locPh = placeholderSet(v);
      if (!equalSets(enPh, locPh)) {
        issues.push(
          `[${lang}] placeholder drift for key "${k}": en={${[...enPh].join(',')}} ${lang}={${[...locPh].join(',')}}`
        );
      }
    }
    allLocales[lang] = obj;
  }

  if (issues.length) {
    console.error('[build-translations] validation failed:');
    for (const m of issues) console.error('  - ' + m);
    process.exit(1);
  }

  const strings = {};
  let stored = 0;
  let fallback = 0;
  for (const key of enKeys) {
    const row = { en: enObj[key] };
    for (const lang of ALL_LANGS) {
      if (lang === 'en') continue;
      const override = allLocales[lang][key];
      if (override != null && String(override).trim() !== '' && override !== enObj[key]) {
        row[lang] = override;
        stored++;
      } else {
        fallback++;
      }
    }
    strings[key] = row;
  }

  const out = { version: 1, strings };
  writeJsonRetry(OUT_PATH, out);
  const bytes = fs.statSync(OUT_PATH).size;
  console.log(
    `Wrote translations.json with ${enKeys.length} keys across ${ALL_LANGS.length} locales ` +
      `(${stored} translated entries stored, ${fallback} resolve to English; ${bytes} bytes)`
  );
}

main();
