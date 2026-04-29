/**
 * Reports per-locale translation coverage and exits non-zero if any locale
 * still has gaps or placeholder drift. Run via `npm run i18n:verify`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.join(__dirname, 'messages');

const ALL_LANGS = [
  'de', 'fr', 'es', 'it', 'pl', 'nl', 'pt', 'sv', 'da', 'fi', 'cs',
  'el', 'hu', 'ro', 'bg', 'hr', 'sk', 'sl', 'et', 'lv', 'lt', 'ga', 'mt',
  'is', 'nb', 'uk',
];

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z_][\w]*)\s*\}\}/g;

function readJson(p, fallback = null) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

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

function main() {
  const en = readJson(path.join(MESSAGES_DIR, 'en.json'));
  if (!en) {
    console.error('[verify-i18n] messages/en.json missing');
    process.exit(1);
  }
  const enKeys = Object.keys(en).filter((k) => typeof en[k] === 'string' && en[k].trim() !== '');
  const total = enKeys.length;

  const rows = [];
  let failed = false;
  let driftCount = 0;

  for (const lang of ALL_LANGS) {
    const obj = readJson(path.join(MESSAGES_DIR, `${lang}.json`), {});
    let covered = 0;
    let missing = 0;
    let drift = 0;
    const driftKeys = [];
    for (const k of enKeys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim() !== '') {
        const enPh = placeholderMultiset(en[k]);
        const locPh = placeholderMultiset(v);
        if (placeholderEqual(enPh, locPh)) {
          covered++;
        } else {
          drift++;
          driftKeys.push(k);
        }
      } else {
        missing++;
      }
    }
    const pct = total === 0 ? 100 : ((covered / total) * 100).toFixed(1);
    rows.push({ lang, total, covered, missing, drift, pct });
    if (drift > 0) {
      driftCount += drift;
      console.warn(`[${lang}] placeholder drift on ${drift} key${drift === 1 ? '' : 's'}: ${driftKeys.slice(0, 5).join(', ')}${drift > 5 ? '…' : ''}`);
    }
    if (covered < total) failed = true;
  }

  console.log('Locale  Coverage  Covered/Total  Missing  Drift');
  for (const r of rows) {
    console.log(
      `${r.lang.padEnd(6)}  ${(r.pct + '%').padEnd(8)}  ${(r.covered + '/' + r.total).padEnd(13)}  ${String(r.missing).padEnd(7)}  ${r.drift}`
    );
  }

  if (failed || driftCount > 0) {
    console.error(`\n[verify-i18n] FAIL: not at 100% coverage or placeholder drift detected`);
    process.exit(1);
  }
  console.log('\n[verify-i18n] OK: 100% coverage on every locale, no placeholder drift');
}

main();
