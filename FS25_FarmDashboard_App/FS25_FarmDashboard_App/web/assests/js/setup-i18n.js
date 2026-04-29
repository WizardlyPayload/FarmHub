// FS25 FarmDashboard | setup.html i18n (first-run wizard).
// Desktop: translations via preload (farmDashAPI). Tablet/browser on LAN: fetch /locales/translations.json
(function () {
  function farmApi() {
    return typeof window !== 'undefined' && window.farmDashAPI ? window.farmDashAPI : null;
  }

  const LOCALE_NAMES = {
    en: 'English',
    bg: 'Български',
    hr: 'Hrvatski',
    cs: 'Čeština',
    da: 'Dansk',
    nl: 'Nederlands',
    et: 'Eesti',
    fi: 'Suomi',
    fr: 'Français',
    de: 'Deutsch',
    el: 'Ελληνικά',
    hu: 'Magyar',
    ga: 'Gaeilge',
    it: 'Italiano',
    lv: 'Latviešu',
    lt: 'Lietuvių',
    mt: 'Malti',
    pl: 'Polski',
    pt: 'Português',
    ro: 'Română',
    sk: 'Slovenčina',
    sl: 'Slovenščina',
    es: 'Español',
    sv: 'Svenska',
    is: 'Íslenska',
    nb: 'Norsk bokmål',
    uk: 'Українська'
  };

  let catalog = null;
  let lang = 'en';

  function t(key, params) {
    const row = catalog && catalog.strings && catalog.strings[key];
    if (!row || typeof row !== 'object') return key;
    let v = row[lang];
    if (v == null || v === '') v = row.en;
    if (v == null || v === '') return key;
    if (params && typeof params === 'object') {
      for (const pk of Object.keys(params)) {
        v = v.split('{{' + pk + '}}').join(String(params[pk]));
      }
    }
    return v;
  }

  function apply() {
    document.querySelectorAll('[data-setup-i18n]').forEach((el) => {
      const key = el.getAttribute('data-setup-i18n');
      if (!key) return;
      const v = t(key);
      if (el.tagName === 'TITLE') {
        document.title = v;
        return;
      }
      if (el.hasAttribute('data-setup-html')) el.innerHTML = v;
      else el.textContent = v;
    });
    document.querySelectorAll('[data-setup-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-setup-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });
    document.querySelectorAll('[data-setup-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-setup-i18n-title');
      if (key) el.setAttribute('title', t(key));
    });
  }

  async function loadCatalog() {
    const api = farmApi();
    if (api && typeof api.getTranslationsJson === 'function') {
      catalog = await api.getTranslationsJson();
      return;
    }
    const res = await fetch('/locales/translations.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('translations ' + res.status);
    catalog = await res.json();
  }

  async function init() {
    try {
      await loadCatalog();
    } catch (e) {
      console.warn('[setup-i18n]', e);
      return;
    }
    const q = new URLSearchParams(window.location.search).get('lang');
    let stored = 'en';
    try {
      const api = farmApi();
      if (api && typeof api.getStoredLocale === 'function') {
        stored = (await api.getStoredLocale()) || 'en';
      } else {
        try {
          stored = localStorage.getItem('farmdash_locale') || 'en';
        } catch (_) {}
      }
    } catch (_) {}
    lang = q && LOCALE_NAMES[q] ? q : stored;
    if (!LOCALE_NAMES[lang]) lang = 'en';

    const sel = document.getElementById('setup-lang-select');
    if (sel) {
      sel.innerHTML = '';
      Object.keys(LOCALE_NAMES)
        .sort((a, b) => LOCALE_NAMES[a].localeCompare(LOCALE_NAMES[b], 'en'))
        .forEach((code) => {
          const opt = document.createElement('option');
          opt.value = code;
          opt.textContent = LOCALE_NAMES[code];
          if (code === lang) opt.selected = true;
          sel.appendChild(opt);
        });
      sel.addEventListener('change', () => {
        const next = sel.value;
        try {
          const api = farmApi();
          if (api && typeof api.setStoredLocale === 'function') {
            api.setStoredLocale(next);
          } else {
            localStorage.setItem('farmdash_locale', next);
          }
        } catch (_) {}
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('lang', next);
          window.location.href = url.toString();
        } catch (_) {
          window.location = 'setup.html?lang=' + encodeURIComponent(next);
        }
      });
    }
    apply();
    document.documentElement.lang = lang;
    window.setupT = function (key, params) {
      return t(key, params);
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
