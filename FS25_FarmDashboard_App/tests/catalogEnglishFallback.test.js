/**
 * @jest-environment jsdom
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { productionTs } = require("./helpers/production-source.cjs");

const catalogPath = path.join(__dirname, "..", "web", "locales", "translations.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const untranslatedKey = Object.keys(catalog.strings).find(
    (k) => k.startsWith("companionPage.") && !("de" in catalog.strings[k]) && !catalog.strings[k].en.includes("{{"),
);

function serveCatalog() {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(catalog)) }));
}

describe("runtime lookups resolve omitted locale entries to English", () => {
    beforeEach(() => {
        serveCatalog();
        localStorage.clear();
    });
    afterEach(() => {
        delete global.fetch;
    });

    test("the catalog omits untranslated companion-page entries", () => {
        expect(untranslatedKey).toBeTruthy();
        expect(catalog.strings["nav.section.fields"].de).toBe("Felder");
    });

    test("NEW APP t() keeps German translations and falls back to English", async () => {
        const i18n = productionTs("NEW APP/src/i18n/i18n.ts");
        await i18n.initI18n("de");
        expect(i18n.getLocale()).toBe("de");
        expect(i18n.t("nav.section.fields")).toBe("Felder");
        expect(i18n.t(untranslatedKey)).toBe(catalog.strings[untranslatedKey].en);
        expect(i18n.tOr(untranslatedKey, "fallback")).toBe(catalog.strings[untranslatedKey].en);
        expect(i18n.tOr("no.such.key", "fallback")).toBe("fallback");
    });

    test("classic web t() keeps German translations and falls back to English", async () => {
        localStorage.setItem("farmdash_locale", "de");
        const i18n = productionTs("FS25_FarmDashboard_App/web/assests/js/i18n/i18n.js");
        await i18n.initI18n();
        expect(i18n.getLocale()).toBe("de");
        expect(i18n.t("nav.section.fields")).toBe("Felder");
        expect(i18n.t(untranslatedKey)).toBe(catalog.strings[untranslatedKey].en);
        expect(document.title).toBe(catalog.strings["page.title"].de ?? catalog.strings["page.title"].en);
    });
});
