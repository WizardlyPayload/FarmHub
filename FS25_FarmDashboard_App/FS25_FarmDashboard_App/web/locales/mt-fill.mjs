/**
 * Machine-translates missing strings into messages/<code>.json using Google
 * Cloud Translation v3.
 *
 * Authentication (one of):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json   (preferred)
 *   GOOGLE_TRANSLATE_API_KEY=AIza...                               (v3 with API key)
 *   GOOGLE_PROJECT_ID=<gcp-project-id>                             (required when using API key)
 *
 * CLI:
 *   node web/locales/mt-fill.mjs                  fill missing strings for every locale
 *   node web/locales/mt-fill.mjs --langs de,fr    only those locales
 *   node web/locales/mt-fill.mjs --force          re-translate every key (uses cache when possible)
 *   node web/locales/mt-fill.mjs --limit 50       cap the number of strings per locale (debug)
 *   node web/locales/mt-fill.mjs --dry-run        print the work plan, do not call the API
 *
 * The script:
 *   - Wraps every `{{token}}` in `<span translate="no">{{token}}</span>` before
 *     calling the API and strips the wrapper after, so dynamic placeholders
 *     survive translation untouched.
 *   - Sends with `format: HTML` so existing inline `<strong>`, `<code>`, `<br>`
 *     tags are preserved.
 *   - Batches ~100 strings per request and retries with exponential backoff on
 *     429/5xx.
 *   - Caches every result in `messages/.mt-cache.json`, keyed by
 *     `sha1(srcString)|targetLang`, so re-runs are free.
 *   - Validates placeholder round-trip and refuses to write entries that lost
 *     a `{{token}}`.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.join(__dirname, 'messages');
const CACHE_PATH = path.join(MESSAGES_DIR, '.mt-cache.json');

const ALL_LANGS = [
  'de', 'fr', 'es', 'it', 'pl', 'nl', 'pt', 'sv', 'da', 'fi', 'cs',
  'el', 'hu', 'ro', 'bg', 'hr', 'sk', 'sl', 'et', 'lv', 'lt', 'ga', 'mt',
  'is', 'nb', 'uk',
];

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z_][\w]*)\s*\}\}/g;
const BATCH_SIZE = 96;
const MAX_RETRIES = 5;

function parseArgs(argv) {
  const args = { langs: null, force: false, limit: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') args.force = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--langs' || a === '-l') {
      args.langs = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--limit') {
      args.limit = Number(argv[++i]) || null;
    } else if (a.startsWith('--langs=')) {
      args.langs = a.slice('--langs='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--limit=')) {
      args.limit = Number(a.slice('--limit='.length)) || null;
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: node web/locales/mt-fill.mjs [--langs de,fr] [--force] [--limit N] [--dry-run]');
      process.exit(0);
    }
  }
  return args;
}

function readJson(p, fallback = null) {
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`[mt-fill] failed to parse ${p}: ${e.message}`);
  }
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function placeholderList(str) {
  const out = [];
  if (typeof str !== 'string') return out;
  PLACEHOLDER_RE.lastIndex = 0;
  let m;
  while ((m = PLACEHOLDER_RE.exec(str))) out.push(m[1]);
  return out;
}

function placeholderMultiset(str) {
  const list = placeholderList(str);
  const map = new Map();
  for (const k of list) map.set(k, (map.get(k) || 0) + 1);
  return map;
}

function placeholderEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

function nonPlaceholderText(s) {
  if (typeof s !== 'string') return '';
  return s.replace(PLACEHOLDER_RE, '').replace(/\s+/g, ' ').trim();
}

function lostContent(en, translated) {
  const enText = nonPlaceholderText(en);
  const trText = nonPlaceholderText(translated);
  if (enText.length < 4) return false;
  if (trText.length === 0) return true;
  return trText.length < enText.length * 0.25;
}

function buildPlaceholderTokens(src) {
  const map = [];
  let idx = 0;
  const replaced = src.replace(PLACEHOLDER_RE, (m) => {
    const sentinel = `XPH${idx}X`;
    map.push({ sentinel, original: m });
    idx++;
    return sentinel;
  });
  return { replaced, map };
}

function restorePlaceholders(translated, map) {
  let out = translated;
  for (const { sentinel, original } of map) {
    const re = new RegExp(sentinel.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
    out = out.replace(re, original);
  }
  return out;
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function sha1(s) {
  return crypto.createHash('sha1').update(s, 'utf8').digest('hex');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getAccessTokenFromServiceAccount(credentialsPath) {
  const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  if (!creds.private_key || !creds.client_email) {
    throw new Error(`[mt-fill] ${credentialsPath} is missing private_key/client_email`);
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-translation',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(payload)}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(creds.private_key).toString('base64url');
  const jwt = `${unsigned}.${sig}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`[mt-fill] OAuth token exchange failed (${resp.status}): ${text}`);
  }
  const data = await resp.json();
  if (!data.access_token) throw new Error(`[mt-fill] token endpoint returned no access_token: ${JSON.stringify(data)}`);
  return { accessToken: data.access_token, projectId: creds.project_id };
}

function resolveAuth() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (credPath) {
    if (!fs.existsSync(credPath)) {
      throw new Error(`[mt-fill] GOOGLE_APPLICATION_CREDENTIALS path not found: ${credPath}`);
    }
    return { mode: 'service_account', credPath };
  }
  if (apiKey) {
    return { mode: 'api_key_v2', apiKey };
  }
  throw new Error(
    '[mt-fill] No Google credentials found. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON, ' +
    'or GOOGLE_TRANSLATE_API_KEY (optionally with GOOGLE_PROJECT_ID) for an API key.'
  );
}

async function callTranslateBatch(auth, sourceLang, targetLang, htmlInputs) {
  let url, headers, body, parseTranslations;
  if (auth.mode === 'service_account') {
    if (!auth._token || auth._tokenExpiresAt < Date.now() + 60_000) {
      const t = await getAccessTokenFromServiceAccount(auth.credPath);
      auth._token = t.accessToken;
      auth._projectId = t.projectId;
      auth._tokenExpiresAt = Date.now() + 50 * 60 * 1000;
    }
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth._token}` };
    url = `https://translation.googleapis.com/v3/projects/${auth._projectId}/locations/global:translateText`;
    body = JSON.stringify({
      contents: htmlInputs,
      mimeType: 'text/html',
      sourceLanguageCode: sourceLang,
      targetLanguageCode: targetLang,
    });
    parseTranslations = (d) => (d.translations || []).map((t) => t.translatedText || '');
  } else {
    url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(auth.apiKey)}`;
    headers = { 'Content-Type': 'application/json' };
    body = JSON.stringify({
      q: htmlInputs,
      source: sourceLang,
      target: targetLang,
      format: 'html',
    });
    parseTranslations = (d) => ((d.data && d.data.translations) || []).map((t) => t.translatedText || '');
  }
  let attempt = 0;
  while (true) {
    attempt++;
    const resp = await fetch(url, { method: 'POST', headers, body });
    if (resp.ok) {
      return parseTranslations(await resp.json());
    }
    const text = await resp.text();
    if ((resp.status === 429 || resp.status >= 500) && attempt <= MAX_RETRIES) {
      const wait = Math.min(60_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500);
      console.warn(`[mt-fill] ${resp.status} on ${targetLang}, retry ${attempt}/${MAX_RETRIES} in ${wait}ms`);
      await sleep(wait);
      continue;
    }
    throw new Error(`[mt-fill] Translate API error ${resp.status} for ${targetLang}: ${text}`);
  }
}

function gapKeys(enObj, locObj, force) {
  const out = [];
  for (const [k, en] of Object.entries(enObj)) {
    if (typeof en !== 'string' || en.trim() === '') continue;
    const v = locObj[k];
    if (force) { out.push(k); continue; }
    if (typeof v !== 'string' || v.trim() === '' || v === en) {
      out.push(k);
    }
  }
  return out;
}

async function fillLocale(args, auth, enObj, lang, cache) {
  const locPath = path.join(MESSAGES_DIR, `${lang}.json`);
  const locObj = readJson(locPath, {});
  const keys = gapKeys(enObj, locObj, args.force);
  if (keys.length === 0) {
    console.log(`[${lang}] up to date`);
    return { translated: 0, cached: 0, skipped: 0 };
  }
  const limited = args.limit ? keys.slice(0, args.limit) : keys;
  console.log(`[${lang}] ${limited.length} string${limited.length === 1 ? '' : 's'} to translate${args.limit && keys.length > args.limit ? ` (capped from ${keys.length})` : ''}`);

  if (args.dryRun) {
    return { translated: 0, cached: 0, skipped: limited.length };
  }

  const results = new Map();
  const toCall = [];
  for (const k of limited) {
    const en = enObj[k];
    const cacheKey = `${sha1(en)}|${lang}`;
    if (!args.force && cache[cacheKey]) {
      results.set(k, cache[cacheKey]);
    } else {
      toCall.push({ key: k, src: en, cacheKey });
    }
  }

  let translated = 0;
  for (let i = 0; i < toCall.length; i += BATCH_SIZE) {
    const batch = toCall.slice(i, i + BATCH_SIZE);
    const prepared = batch.map((b) => buildPlaceholderTokens(b.src));
    const inputs = prepared.map((p) => p.replaced);
    const out = await callTranslateBatch(auth, 'en', lang, inputs);
    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const map = prepared[j].map;
      let cleaned = decodeHtmlEntities(out[j] || '');
      cleaned = restorePlaceholders(cleaned, map);
      results.set(item.key, cleaned);
      cache[item.cacheKey] = cleaned;
      translated++;
    }
    process.stdout.write(`  [${lang}] ${Math.min(i + batch.length, toCall.length)}/${toCall.length}\r`);
  }
  if (toCall.length) process.stdout.write('\n');

  let written = 0;
  let dropped = 0;
  for (const [k, v] of results) {
    if (typeof v !== 'string' || v.trim() === '') { dropped++; continue; }
    const enPh = placeholderMultiset(enObj[k]);
    const locPh = placeholderMultiset(v);
    if (!placeholderEqual(enPh, locPh)) {
      console.warn(`  [${lang}] dropped "${k}" — placeholder drift`);
      dropped++;
      continue;
    }
    if (lostContent(enObj[k], v)) {
      console.warn(`  [${lang}] dropped "${k}" — lost meaningful content next to placeholder ("${enObj[k]}" \u2192 "${v}")`);
      dropped++;
      continue;
    }
    locObj[k] = v;
    written++;
  }

  const ordered = {};
  for (const k of Object.keys(enObj)) {
    if (k in locObj) ordered[k] = locObj[k];
  }
  for (const k of Object.keys(locObj)) {
    if (!(k in ordered) && k in enObj) ordered[k] = locObj[k];
  }
  writeJson(locPath, ordered);

  console.log(`[${lang}] wrote ${written}, kept ${results.size - written - dropped} unchanged, dropped ${dropped}`);
  return { translated, cached: results.size - translated, skipped: 0 };
}

async function main() {
  const args = parseArgs(process.argv);
  const enObj = readJson(path.join(MESSAGES_DIR, 'en.json'));
  if (!enObj) throw new Error('[mt-fill] messages/en.json not found');

  const targets = args.langs && args.langs.length ? args.langs : ALL_LANGS;
  for (const t of targets) {
    if (!ALL_LANGS.includes(t)) {
      console.warn(`[mt-fill] ignoring unknown locale: ${t}`);
    }
  }
  const langs = targets.filter((t) => ALL_LANGS.includes(t));

  const auth = args.dryRun ? null : resolveAuth();
  if (auth) console.log(`[mt-fill] auth mode: ${auth.mode}`);
  if (args.dryRun) console.log('[mt-fill] DRY RUN — no API calls will be made');

  const cache = readJson(CACHE_PATH, {}) || {};

  let totalTranslated = 0;
  let totalCached = 0;
  for (const lang of langs) {
    try {
      const r = await fillLocale(args, auth, enObj, lang, cache);
      totalTranslated += r.translated;
      totalCached += r.cached;
      if (!args.dryRun) writeJson(CACHE_PATH, cache);
    } catch (e) {
      console.error(`[${lang}] FAILED: ${e.message}`);
    }
  }

  if (!args.dryRun) writeJson(CACHE_PATH, cache);
  console.log(`Done. translated=${totalTranslated} cached=${totalCached}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
