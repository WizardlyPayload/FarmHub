/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const KEY = "animalFoodOverview";
const page = loadCompanionPage(KEY, { title: "Animal Food Overview", group: "livestock" });

function payload(pageData) {
    return {
        companionMods: { mods: [{ id: KEY, detected: true, version: "1.1.0.0" }] },
        companionPages: { pages: pageData ? { [KEY]: { key: KEY, detected: true, ...pageData } } : {} },
    };
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("Animal Food Overview page", () => {
    test("shows the not-detected state when the mod is absent", () => {
        const host = page.renderPage({ companionMods: { mods: [] }, companionPages: { pages: {} } });
        expect(host.textContent).toContain("Not detected in this save");
    });

    test("renders one card per animal with feed groups, mixtures and recipes", () => {
        const host = page.renderPage(payload({
            readState: "ok",
            source: "animalFoodSystem",
            animalTypeCount: 2,
            animals: [
                { animalType: "COW", title: "Cows", consumption: "parallel",
                    groups: [
                        { title: "Mixed ration", productionWeight: 1, eatWeight: 1, foods: ["TMR"] },
                        { title: "Base", productionWeight: 0.4, eatWeight: 0.5, foods: ["Grass", "Hay"] },
                    ],
                    mixtures: [{ title: "TMR", ingredients: [{ weightPercent: 50, foods: "Silage" }, { weightPercent: 25, foods: "Hay" }] }] },
                { animalType: "PIG", title: "Pigs", consumption: "sequential",
                    groups: [{ title: "Pig food", productionWeight: 1, eatWeight: 1, foods: ["Pig Food"] }], mixtures: [] },
            ],
            recipes: [{ title: "TMR", ingredients: [{ title: "Silage", minPercent: 50, maxPercent: 75 }] }],
        }));
        expect(host.querySelector('[data-stat="animals"]').textContent).toContain("2");
        expect(host.querySelector('[data-stat="groups"]').textContent).toContain("3");
        expect(host.querySelector('[data-stat="mixtures"]').textContent).toContain("1");
        expect(host.querySelector('[data-stat="recipes"]').textContent).toContain("1");
        const titles = [...host.querySelectorAll(".fd-mod-page__grid .fd-card__title")].map((n) => n.textContent);
        expect(titles).toEqual(["Cows", "Pigs"]);
        expect(host.textContent).toContain("Eats from all groups together");
        expect(host.textContent).toContain("Eats one group at a time, in order");
        expect(host.textContent).toContain("Grass, Hay");
        expect(host.textContent).toContain("40%");
        expect(host.textContent).toContain("50% Silage + 25% Hay");
        expect(host.textContent).toContain("Silage 50% – 75%");
    });

    test("limited reading explains the in-game window instead of an empty table", () => {
        const host = page.renderPage(payload({ readState: "settings-only", modStateReadable: true, keybindAction: "ShowAnimalFoodDlg" }));
        expect(host.textContent).toContain("Limited reading");
        expect(host.textContent).toContain("feed table was not readable");
        expect(host.querySelector("[data-stat]")).toBeNull();
    });
});
