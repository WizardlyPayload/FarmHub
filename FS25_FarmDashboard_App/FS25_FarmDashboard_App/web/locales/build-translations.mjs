/**
 * Regenerates translations.json from per-locale JSON files.
 *
 * Source of truth: `messages/en.json` (every key the app can reference).
 * Per-locale overrides live in `messages/<code>.json` (only keys that differ
 * from English need to be listed; missing keys fall back to English).
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
  for (const key of enKeys) {
    const row = { en: enObj[key] };
    for (const lang of ALL_LANGS) {
      if (lang === 'en') continue;
      const override = allLocales[lang][key];
      row[lang] = override != null && String(override).trim() !== '' ? override : enObj[key];
    }
    strings[key] = row;
  }

  const out = { version: 1, strings };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log(
    `Wrote translations.json with ${enKeys.length} keys across ${ALL_LANGS.length} locales`
  );
}

main();
