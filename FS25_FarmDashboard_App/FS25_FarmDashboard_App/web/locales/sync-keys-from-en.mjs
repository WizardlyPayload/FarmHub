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
