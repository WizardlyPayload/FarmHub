/** NEW APP i18n — matches legacy catalog shape: { strings: { key: { en, de, ... } } } */

const STORAGE_KEY = "farmdash_locale";
const FALLBACK = "en";

const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  bg: "Български",
  hr: "Hrvatski",
  cs: "Čeština",
  da: "Dansk",
  nl: "Nederlands",
  et: "Eesti",
  fi: "Suomi",
  fr: "Français",
  de: "Deutsch",
  el: "Ελληνικά",
  hu: "Magyar",
  ga: "Gaeilge",
  it: "Italiano",
  lv: "Latviešu",
  lt: "Lietuvių",
  mt: "Malti",
  pl: "Polski",
  pt: "Português",
  ro: "Română",
  sk: "Slovenčina",
  sl: "Slovenščina",
  es: "Español",
  sv: "Svenska",
  is: "Íslenska",
  nb: "Norsk bokmål",
  uk: "Українська",
};

type LocaleRow = Record<string, string>;
type Catalog = {
  version?: number;
  strings?: Record<string, LocaleRow>;
};

let catalog: Catalog | null = null;
let flatEn: Record<string, string> = {};
let locale = FALLBACK;
let ready: Promise<void> | null = null;
const listeners = new Set<() => void>();

export type LocalePreferences = {
  read(): string | null; write(code: string): void;
  catalogStore?: Pick<Storage, "getItem" | "setItem"> | null;
};
let preferences: LocalePreferences | null = null;

/** Bound before initialization by recorded boot; desktop keeps its existing storage. */
export function configureLocalePreferences(value: LocalePreferences): void {
  preferences = value;
}

function preferredLocale(): string | null {
  try { return preferences ? preferences.read() : localStorage.getItem(STORAGE_KEY); }
  catch { return null; }
}

const CATALOG_CACHE_KEY = "farmdash_recorded_catalog";
const CATALOG_CACHE_LIMIT = 4 * 1024 * 1024;
function cachedCatalog(): Catalog | null {
  try {
    const raw = preferences?.catalogStore?.getItem(CATALOG_CACHE_KEY);
    if (!raw || raw.length > CATALOG_CACHE_LIMIT || new TextEncoder().encode(raw).byteLength > CATALOG_CACHE_LIMIT) return null;
    const doc = JSON.parse(raw) as Catalog;
    if (!doc || !doc.strings || typeof doc.strings !== "object" || Array.isArray(doc.strings)) return null;
    for (const row of Object.values(doc.strings)) {
      if (!row || typeof row !== "object" || Array.isArray(row) || Object.values(row).some(value => typeof value !== "string")) return null;
    }
    return doc;
  } catch { return null; }
}

function normalizeLocale(code: string | null | undefined): string {
  if (!code || typeof code !== "string") return FALLBACK;
  const primary = code.trim().toLowerCase().replace("_", "-").split("-")[0];
  return LOCALE_NAMES[primary] ? primary : FALLBACK;
}

function rebuildFlatEn(doc: Catalog) {
  flatEn = {};
  if (!doc.strings) return;
  for (const [key, row] of Object.entries(doc.strings)) {
    if (row && typeof row === "object" && row[FALLBACK] != null) {
      flatEn[key] = row[FALLBACK];
    }
  }
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeI18n(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function initI18n(preferred?: string): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    locale = normalizeLocale(
      preferred || preferredLocale() || navigator.language || FALLBACK
    );
    try {
      const res = await fetch("/locales/translations.json", { cache: "default" });
      if (!res.ok) throw new Error(`i18n HTTP ${res.status}`);
      const doc = (await res.json()) as Catalog;
      catalog = doc;
      rebuildFlatEn(doc);
      if (preferences?.catalogStore) {
        try {
          const raw = JSON.stringify(doc);
          if (raw.length <= CATALOG_CACHE_LIMIT && new TextEncoder().encode(raw).byteLength <= CATALOG_CACHE_LIMIT) {
            preferences.catalogStore.setItem(CATALOG_CACHE_KEY, raw);
          }
        } catch { /* language preference still works when the catalog exceeds quota */ }
      }
    } catch (e) {
      console.warn("[i18n] failed to load translations.json", e);
      catalog = cachedCatalog() ?? { strings: {} };
      rebuildFlatEn(catalog);
    }
    notify();
  })();
  return ready;
}

export function getLocale(): string {
  return locale;
}

export function setLocale(code: string): void {
  locale = normalizeLocale(code);
  try {
    if (preferences) preferences.write(locale);
    else localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  notify();
}

export function t(key: string, params?: Record<string, string | number>): string {
  if (!catalog?.strings) return flatEn[key] ?? key;
  const row = catalog.strings[key];
  if (!row || typeof row !== "object") return flatEn[key] ?? key;
  let text = row[locale] ?? row[FALLBACK] ?? flatEn[key] ?? key;
  if (text == null || text === "") text = flatEn[key] ?? key;
  if (params && typeof text === "string") {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{{${k}}}`).join(String(v));
    }
  }
  return text;
}

export function tOr(
  key: string,
  fallback: string,
  params?: Record<string, string | number>
): string {
  const out = t(key, params);
  if (out === key || out == null || out === "") return fallback;
  return out;
}

export { LOCALE_NAMES };
