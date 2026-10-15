/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

function payload(key, page) {
    return {
        companionMods: { mods: [{ id: key, detected: true, version: "1.0.0.0" }] },
        companionPages: { pages: { [key]: { key, detected: true, ...page } } },
    };
}

const text = (host, sel) => (host.querySelector(sel) || { textContent: "" }).textContent;

afterEach(() => {
    document.body.innerHTML = "";
});

describe("realisticDieselPrice page", () => {
    test("shows game vs target price, the selected region's presets and all regions", () => {
        const ui = loadCompanionPage("realisticDieselPrice");
        const host = ui.renderPage(payload("realisticDieselPrice", {
            readState: "ok", customMode: false, customPrice: 1.5, region: "Europe", country: "United Kingdom",
            presetPrice: 1.96, targetPrice: 1.96, gamePrice: 1.31, inSync: false, settingsMenuInstalled: true,
            otherDieselMod: "fluctuatingDieselPrice",
            regions: [
                { name: "Europe", selected: true, countries: [{ label: "Germany", price: 1.9 }, { label: "United Kingdom", price: 1.96, selected: true }] },
                { name: "Asia", selected: false, countries: [{ label: "Japan", price: 0.86 }] },
            ],
        }));
        expect(host.querySelector('[data-stat="game"]').className).toContain("is-warn");
        expect(text(host, '[data-stat="game"]')).toContain("1.31");
        expect(text(host, '[data-stat="mode"]')).toContain("United Kingdom, Europe");
        expect(text(host, '[data-stat="countries"]')).toContain("3");
        expect(host.querySelector('[data-row="United Kingdom"]').className).toContain("is-ok");
        expect(text(host, '[data-row="Asia"]')).toContain("0.86");
        expect(host.textContent).toContain("Fluctuating Diesel Price is also loaded");
        expect(host.querySelectorAll(".fd-mod-page__chart-col")).toHaveLength(2);
    });
});

describe("fluctuatingDieselPrice page", () => {
    test("shows the band, next change and the observed history chart", () => {
        const ui = loadCompanionPage("fluctuatingDieselPrice");
        const host = ui.renderPage(payload("fluctuatingDieselPrice", {
            readState: "ok", modActive: true, price: 1.62, difficulty: 2, bandMin: 1.25, bandMax: 1.75, bandPosition: 0.74,
            outsideBand: false, currentHour: 13, nextChangeHour: 18, hoursUntilChange: 5,
            observed: { count: 3, low: 1.4, high: 1.62, average: 1.5, samples: [
                { day: 40, hour: 0, price: 1.4 }, { day: 40, hour: 6, price: 1.48 }, { day: 40, hour: 12, price: 1.62 },
            ] },
        }));
        expect(text(host, '[data-stat="band"]')).toContain("Normal economy");
        expect(text(host, '[data-stat="next"]')).toContain("18:00");
        expect(text(host, '[data-stat="next"]')).toContain("in 5 h");
        expect(text(host, '[data-stat="average"]')).toContain("over 3 price changes");
        expect(host.textContent).toContain("Expensive end of the range");
        const cols = host.querySelectorAll(".fd-mod-page__chart-col");
        expect(cols).toHaveLength(3);
        expect(cols[2].className).toContain("is-current");
    });
});

describe("dynamicMarket page", () => {
    test("shows group moves with outlook, curves, sell pressure and favourites", () => {
        const ui = loadCompanionPage("dynamicMarket");
        const host = ui.renderPage(payload("dynamicMarket", {
            readState: "ok", period: 4, year: 2, strongestUp: "cropFarming", strongestDown: "animalProduct",
            settings: { priceBase: "yearAverage", dailyRecalc: false, vanillaMode: false, stationPressure: true,
                pressureThresholdLiters: 25000, pressurePercentPerStep: 2, pressureMaxPercent: 15, pressureDecayPerHour: 15, marketNotices: true },
            lastApply: { success: true, reason: "applied", stations: 14, adjusted: 220, fillTypes: 60, skipped: 3, minFactor: 0.99, maxFactor: 1.06 },
            groups: [
                { key: "cropFarming", title: "crop farming", factor: 1.0634, changePercent: 6.34, trend: "up", nextChangePercent: -3,
                    weather: 0.2, supply: -0.1, demand: 0.5, volatility: 0.18, curve: [1.14, 1.1, 1.05, 1, 0.95, 0.91, 0.88, 0.91, 0.97, 1.04, 1.1, 1.13] },
                { key: "animalProduct", title: "animal products", factor: 0.9912, changePercent: -0.88, trend: "down", nextChangePercent: 2, curve: [] },
            ],
            pressureActive: 1,
            pressure: [{ station: "Grain Mill", fillType: "WHEAT", title: "Wheat", percent: 6, peakPercent: 8, recovering: true }],
            favorites: [{ fillType: "WHEAT", title: "Wheat", group: "cropFarming", changePercent: 6.34, bestPeriod: 1 }],
        }));
        expect(text(host, '[data-stat="up"]')).toContain("crop farming");
        expect(text(host, '[data-stat="up"]')).toContain("+6.3%");
        expect(text(host, '[data-stat="applied"]')).toContain("at 14 selling points");
        const crop = host.querySelector('[data-row="cropFarming"]');
        expect(crop.className).toContain("is-ok");
        expect(crop.textContent).toContain("+6.34%");
        expect(crop.textContent).toContain("−3.0%");
        expect(crop.textContent).toContain("Rising");
        expect(host.querySelector('[data-row="animalProduct"]').className).toContain("is-danger");
        expect(host.querySelectorAll('[data-curve="cropFarming"] .fd-mod-page__chart-col')).toHaveLength(12);
        expect(host.querySelector('[data-curve="cropFarming"] .fd-mod-page__chart-col.is-current small').textContent).toBe("4");
        expect(host.querySelector('[data-curve="animalProduct"]')).toBeNull();
        expect(text(host, '[data-row="Grain Mill-WHEAT"]')).toContain("Recovering (peak −8.0%)");
        expect(text(host, '[data-row="WHEAT"]')).toContain("Period 1");
        expect(text(host, '[data-kv="pressureRule"]')).toContain("−2.0% per 25,000 L sold");
    });
});

describe("betterContracts page", () => {
    test("shows running contracts, best offers, NPC standing and hard-mode allowance", () => {
        const ui = loadCompanionPage("betterContracts");
        const host = ui.renderPage(payload("betterContracts", {
            readState: "ok",
            settings: { maxActive: 3, rewardMultiplier: 1.5, rewardMultiplierMow: 1, leaseMultiplier: 0.8, toDeliver: 0.94, toDeliverBale: 0.9,
                fieldCompletion: 0.95, lazyNPC: true, discountMode: true, discPerJob: 0.05, discMaxJobs: 5, hardMode: true, hardPenalty: 0.1,
                hardLease: 2, hardLimit: 4, addonsOn: true },
            offers: { count: 3, totalReward: 46000, byType: [{ type: "harvestMission", count: 2 }, { type: "plowMission", count: 1 }],
                best: [{ type: "harvestMission", title: "Harvest", location: "Field 9", npc: "Bob", reward: 30000 }] },
            byFarm: { "1": {
                activeCount: 1, activeReward: 8000, finishedCount: 2, finishedReward: 4700, succeeded: 1, failed: 1, jobsLeft: 2, slotsFree: 2,
                active: [{ type: "sowMission", title: "Sow", location: "Field 7", npc: "Bob", reward: 8000, vehicleCosts: 1200, leased: true, completion: 0.42 }],
                npcJobs: [{ npc: "Anna", jobs: 7, discountPercent: 25, maxedOut: true, canLease: true }, { npc: "Bob", jobs: 1, discountPercent: 5 }],
            } },
        }), { farmId: 1 });
        expect(text(host, '[data-stat="active"]')).toContain("2 more allowed");
        expect(text(host, '[data-stat="finished"]')).toContain("1 succeeded, 1 failed");
        expect(text(host, '[data-stat="jobsLeft"]')).toContain("2");
        expect(text(host, '[data-stat="offers"]')).toContain("46,000 in rewards");
        const active = text(host, '[data-row="active-0"]');
        expect(active).toContain("Field 7");
        expect(active).toContain("42%");
        expect(active).toContain("1,200");
        expect(text(host, '[data-row="offer-0"]')).toContain("30,000");
        expect(text(host, '[data-row="harvestMission"]')).toContain("Harvest");
        expect(text(host, '[data-row="Anna"]')).toContain("25% (max)");
        expect(host.querySelector('[data-row="Anna"]').className).toContain("is-ok");
        expect(text(host, '[data-kv="hard"]')).toContain("lease after 2 jobs, 4 per month");
    });

    test("without the mod config the NPC card is hidden and settings explain why", () => {
        const ui = loadCompanionPage("betterContracts");
        const host = ui.renderPage(payload("betterContracts", {
            readState: "partial", offers: { count: 0, totalReward: 0, byType: [], best: [] },
            byFarm: { "1": { activeCount: 0, activeReward: 0, finishedCount: 0, finishedReward: 0, succeeded: 0, failed: 0, active: [] } },
        }), { farmId: 1 });
        expect(host.querySelector(".fd-mod-page__notice.is-partial")).not.toBeNull();
        expect(host.textContent).not.toContain("Standing with NPCs");
        expect(host.textContent).toContain("contracts above come from the game's contract list");
        expect(host.querySelector('[data-stat="jobsLeft"]')).toBeNull();
    });
});
