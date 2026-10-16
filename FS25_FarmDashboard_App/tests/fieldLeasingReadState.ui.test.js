/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

const ENTRY = { catalogId: "fieldLeasing", title: "Field Leasing", group: "fields" };

function page(readState, leases = [], count = 0) {
    return {
        key: "fieldLeasing", detected: true, readState, coverage: "complete",
        settings: { minDurationPeriods: 6 }, otherFarmLeases: 4,
        byFarm: { "1": { leaseCount: count, finance: { today: 0, recentDays: [0] } } },
        leases,
    };
}

function payload(leasePage, live) {
    return {
        companionMods: {
            mods: [{ id: "fieldLeasing", detected: true, version: "1.0.0.1" }],
            ...(live === undefined ? {} : { fieldLeases: live }),
        },
        companionPages: { pages: leasePage ? { fieldLeasing: leasePage } : {} },
    };
}

function live(readState, leases = []) {
    return { enabled: true, readState, coverage: "complete", farmId: 1, leases };
}

describe("field leasing read state", () => {
    afterEach(() => { document.body.innerHTML = ""; });

    test("no selected farm hides every farm's rows and totals", () => {
        const ui = loadCompanionPage("fieldLeasing", ENTRY);
        const host = ui.renderPage(payload(page("ok", [
            { farmId: 1, farmlandId: 12, name: "Selected land" },
            { farmId: 2, farmlandId: 40, name: "Neighbour land" },
        ], 1), live("ok", [{ farmlandId: 12 }])), { farmId: 0 });
        expect(host.textContent).toContain("Needs a selected farm");
        expect(host.textContent).not.toContain("This farm has no leased farmland.");
        expect(host.textContent).not.toContain("Selected land");
        expect(host.textContent).not.toContain("Neighbour land");
        expect(host.querySelector('[data-stat="leases"]')).toBeNull();
        expect(host.querySelector('[data-kv="others"]')).toBeNull();
    });

    test("unavailable no-farm and failed live reads never become empty", () => {
        const ui = loadCompanionPage("fieldLeasing", ENTRY);
        const ready = page("ok", [], 0);
        const noFarm = ui.renderPage(payload(ready, { enabled: true, readState: "unavailable", reason: "no-farm" }));
        expect(noFarm.textContent).toContain("Needs a selected farm");
        expect(noFarm.textContent).not.toContain("This farm has no leased farmland.");
        const failed = ui.renderPage(payload(ready, { enabled: true, readState: "failed" }));
        expect(failed.textContent).toContain("This reading failed");
        expect(failed.textContent).not.toContain("This farm has no leased farmland.");
        const settingsOnly = ui.renderPage(payload({ ...ready, readState: "settings-only", reason: "no-agreements" }));
        expect(settingsOnly.textContent).toContain("not available in this save");
        expect(settingsOnly.textContent).not.toContain("This farm has no leased farmland.");
    });

    test("absent provider waits; complete zero read alone confirms empty", () => {
        const ui = loadCompanionPage("fieldLeasing", ENTRY);
        const waiting = ui.renderPage(payload(null));
        expect(waiting.textContent).toContain("Leases appear after the next export.");
        expect(waiting.textContent).not.toContain("This farm has no leased farmland.");
        const empty = ui.renderPage(payload(page("ok"), live("ok")));
        expect(empty.textContent).toContain("This farm has no leased farmland.");
        expect(empty.querySelector('[data-stat="leases"]').textContent).toContain("0");
        const pageOnly = ui.renderPage(payload(page("ok")));
        expect(pageOnly.textContent).toContain("This farm has no leased farmland.");
    });

    test("complete selected-farm leases render without other-farm rows", () => {
        const ui = loadCompanionPage("fieldLeasing", ENTRY);
        const host = ui.renderPage(payload(page("ok", [
            { farmId: 1, farmlandId: 12, name: "Selected land", signedPrice: 120000 },
            { farmId: 2, farmlandId: 40, name: "Neighbour land" },
        ], 1), live("ok", [{ farmlandId: 12 }])));
        expect(host.querySelector('[data-row="12"]')).not.toBeNull();
        expect(host.textContent).not.toContain("Neighbour land");
        expect(host.textContent).not.toContain("This farm has no leased farmland.");
    });

    test("a mismatched live farm or incomplete coverage cannot assert empty", () => {
        const ui = loadCompanionPage("fieldLeasing", ENTRY);
        const ready = page("ok");
        const otherFarm = ui.renderPage(payload(ready, { ...live("empty"), farmId: 2 }));
        expect(otherFarm.textContent).not.toContain("This farm has no leased farmland.");
        expect(otherFarm.querySelector('[data-kv="others"]')).toBeNull();
        const partial = ui.renderPage(payload({ ...ready, coverage: "truncated" }));
        expect(partial.textContent).not.toContain("This farm has no leased farmland.");
        const livePartial = ui.renderPage(payload(ready, { ...live("partial"), coverage: "partial" }));
        expect(livePartial.textContent).not.toContain("This farm has no leased farmland.");
    });
});
