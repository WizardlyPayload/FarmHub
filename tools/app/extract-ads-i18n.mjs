/**
 * Extracts the ADS (FS25_AdvancedDamageSystem) l10n strings the dashboard displays
 * (part names, breakdown severities, inspection hints, system + state names) from the
 * mod's translations/l10n_*.xml into the app locale files (web/locales/messages/*.json),
 * keyed by the original ads_* names so vehicleAds.js can t() them directly.
 *
 * ADS-native locales (en/de/es/fr/hu/it/pl/pt) are written verbatim — they match the
 * in-game text. Remaining app locales get filled by the normal i18n:sync + i18n:fill flow.
 *
 * Usage: node tools/app/extract-ads-i18n.mjs   (re-runnable; ADS files are source of truth)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ADS_L10N_DIR = path.join(REPO_ROOT, 'FS25_AdvancedDamageSystem', 'translations');
const MESSAGES_DIR = path.join(REPO_ROOT, 'FS25_FarmDashboard_App', 'web', 'locales', 'messages');

// ADS l10n suffix -> app locale file. br (pt-BR), kr, ru have no app locale; skipped.
const LOCALE_MAP = {
  en: 'en', de: 'de', es: 'es', fr: 'fr',
  hu: 'hu', it: 'it', pl: 'pl', pt: 'pt',
};

// Only the key families the dashboard renders (vehicleAds.js).
const KEY_PREFIXES = [
  'ads_breakdowns_part_',
  'ads_breakdowns_severity_',
  'ads_inspection_hint_',
  'ads_spec_system_',
  'ads_spec_state_',
];
const KEY_EXACT = new Set([
  'ads_breakdowns_quick_fix_stage',
  'ads_breakdowns_defected_parts_stage',
]);

// Dashboard label keys whose MT output was wrong sense ("Stage" → theatre, "Operating
// hours" → opening times). Native ADS l10n is the source of truth where available.
const DASHBOARD_FROM_ADS = {
  'vehicles.adsBreakdownColPart': 'ads_ws_table_header_part',
  'vehicles.adsBreakdownColStage': 'ads_ws_table_header_stage',
  'vehicles.adsBreakdownColPrice': 'ads_ws_table_header_price',
  'vehicles.adsWsOperatingHours': 'ads_ws_label_operating_hours',
};

// Curated fixes for app locales ADS does not ship (correct technical sense).
const DASHBOARD_CURATED = {
  'vehicles.adsBreakdownColStage': {
    da: 'Fase', nb: 'Fase', sv: 'Fas', et: 'Etapp', lv: 'Stadija', lt: 'Etapas',
    hr: 'Faza', sk: 'Fáza', sl: 'Faza', is: 'Stig', bg: 'Етап', uk: 'Етап', el: 'Στάδιο',
  },
  'vehicles.adsWsOperatingHours': {
    da: 'Driftstimer', nb: 'Driftstimer', sv: 'Drifttimmar', fi: 'Käyttötunnit',
    nl: 'Bedrijfsuren', cs: 'Motohodiny', et: 'Töötunnid', lv: 'Darba stundas',
    hr: 'Radni sati', sk: 'Prevádzkové hodiny', sl: 'Delovne ure', is: 'Vinnustundir',
    bg: 'Моточасове', uk: 'Мотогодини', ro: 'Ore de funcționare', el: 'Ώρες λειτουργίας',
  },
};

const UI_KEYS = new Set(Object.values(DASHBOARD_FROM_ADS));

function wantKey(name) {
  if (KEY_EXACT.has(name) || UI_KEYS.has(name)) return true;
  return KEY_PREFIXES.some((p) => name.startsWith(p));
}

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

function parseL10n(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const out = {};
  const re = /<text\s+name="([^"]+)"\s+text="([^"]*)"\s*\/>/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, name, text] = m;
    if (wantKey(name)) out[name] = decodeXmlEntities(text);
  }
  return out;
}

const enXml = path.join(ADS_L10N_DIR, 'l10n_en.xml');
if (!fs.existsSync(enXml)) {
  console.error(`extract-ads-i18n: missing ${enXml} — is the ADS mod folder present?`);
  process.exit(1);
}

const enStrings = parseL10n(enXml);
const adsKeys = Object.keys(enStrings).sort();
if (adsKeys.length === 0) {
  console.error('extract-ads-i18n: no matching keys found in l10n_en.xml');
  process.exit(1);
}

let totalWritten = 0;
for (const [adsLocale, appLocale] of Object.entries(LOCALE_MAP)) {
  const xmlPath = path.join(ADS_L10N_DIR, `l10n_${adsLocale}.xml`);
  if (!fs.existsSync(xmlPath)) {
    console.warn(`extract-ads-i18n: skip ${adsLocale} (no l10n file)`);
    continue;
  }
  const strings = adsLocale === 'en' ? enStrings : parseL10n(xmlPath);
  const msgPath = path.join(MESSAGES_DIR, `${appLocale}.json`);
  const messages = JSON.parse(fs.readFileSync(msgPath, 'utf8'));

  let written = 0;
  for (const key of adsKeys) {
    if (UI_KEYS.has(key)) continue; // applied via DASHBOARD_FROM_ADS below, not as raw keys
    // ADS file is source of truth; fall back to English when a locale misses a key.
    const value = strings[key] ?? enStrings[key];
    if (messages[key] !== value) {
      messages[key] = value;
      written++;
    }
  }
  for (const [dashKey, adsKey] of Object.entries(DASHBOARD_FROM_ADS)) {
    const value = strings[adsKey];
    if (value != null && messages[dashKey] !== value) {
      messages[dashKey] = value;
      written++;
    }
  }
  fs.writeFileSync(msgPath, JSON.stringify(messages, null, 2) + '\n', 'utf8');
  totalWritten += written;
  console.log(`[${appLocale}] ${written} ads_* keys updated (${adsKeys.length} total)`);
}

// Curated label fixes for locales ADS does not ship.
for (const [dashKey, perLocale] of Object.entries(DASHBOARD_CURATED)) {
  for (const [locale, value] of Object.entries(perLocale)) {
    const msgPath = path.join(MESSAGES_DIR, `${locale}.json`);
    if (!fs.existsSync(msgPath)) continue;
    const messages = JSON.parse(fs.readFileSync(msgPath, 'utf8'));
    if (messages[dashKey] !== value) {
      messages[dashKey] = value;
      fs.writeFileSync(msgPath, JSON.stringify(messages, null, 2) + '\n', 'utf8');
      totalWritten++;
    }
  }
}

console.log(`extract-ads-i18n: done — ${adsKeys.length} keys, ${totalWritten} writes. Now run i18n:sync, i18n:fill, i18n:build, i18n:verify.`);
