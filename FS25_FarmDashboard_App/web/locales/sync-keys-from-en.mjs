/**
 * Copies any key present in messages/en.json but missing from other locale files,
 * using the English string as a fallback (run mt-fill later for real translations).
 * Usage: node web/locales/sync-keys-from-en.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.join(__dirname, 'messages');

const LANGS = [
  'de', 'fr', 'es', 'it', 'pl', 'nl', 'pt', 'sv', 'da', 'fi', 'cs',
  'el', 'hu', 'ro', 'bg', 'hr', 'sk', 'sl', 'et', 'lv', 'lt', 'ga', 'mt',
  'is', 'nb', 'uk',
];

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z_][\w]*)\s*\}\}/g;

function placeholderMultiset(str) {
  const map = new Map();
  if (typeof str !== 'string') return map;
  PLACEHOLDER_RE.lastIndex = 0;
  let m;
  while ((m = PLACEHOLDER_RE.exec(str))) map.set(m[1], (map.get(m[1]) || 0) + 1);
  return map;
}

function placeholderEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

const enPath = path.join(MESSAGES_DIR, 'en.json');
const en = readJson(enPath);
let added = 0;

for (const lang of LANGS) {
  const p = path.join(MESSAGES_DIR, `${lang}.json`);
  const loc = readJson(p);
  let changed = false;
  for (const k of Object.keys(en)) {
    if (loc[k] === undefined) {
      loc[k] = en[k];
      added++;
      changed = true;
    } else if (typeof en[k] === 'string' && typeof loc[k] === 'string') {
      const enPh = placeholderMultiset(en[k]);
      const locPh = placeholderMultiset(loc[k]);
      if (enPh.size > 0 && !placeholderEqual(enPh, locPh)) {
        loc[k] = en[k];
        added++;
        changed = true;
      }
    }
  }
  if (changed) {
    const ordered = {};
    for (const k of Object.keys(en)) {
      if (k in loc) ordered[k] = loc[k];
    }
    for (const k of Object.keys(loc)) {
      if (!(k in ordered)) ordered[k] = loc[k];
    }
    writeJson(p, ordered);
  }
}

console.log(`sync-keys-from-en: filled missing entries (${added} total key additions across locales)`);
