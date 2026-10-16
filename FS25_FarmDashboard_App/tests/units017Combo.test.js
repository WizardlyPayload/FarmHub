/**
 * @jest-environment jsdom
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { productionTs } = require("./helpers/production-source.cjs");

const lua = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua"),
    "utf8",
);
const catalog = productionTs("NEW APP/src/lib/companionMods/catalog.ts");
const demo = productionTs("NEW APP/src/platform/demo-source.ts");

const DETECTED_ONLY = [
    "realSilo",
    "dynamicMarket",
    "palletDegradation",
    "seasonalMilkProduction",
    "soilWorkYieldBonus",
    "outOfFuel",
    "factoryProfitCalculator",
    "fieldProfitabilityLedger",
    "farmReputation",
    "yieldTracker",
    "moistureSystem",
    "fieldLeasing",
    "rentYourField",
    "farmlandMarketplace",
    "distributionRedux",
    "silageCompactionMonitor",
    "farmOperationsDashboard",
];

// A committed export generation with one owned field reading, as the publisher requires.
function generation(extra, fieldRow) {
    return {
        id: "gen-base",
        demoId: "base",
        capturedAt: "2026-09-27T09:00:00.000Z",
        gameDate: "2030-06",
        mapTitle: "Recorded demo map",
        limitations: ["Recorded demo."],
        section: "fields",
        exportGeneration: 1,
        payload: {
            dataSource: "recorded-demo",
            activeFarmId: 1,
            mapTitle: "Recorded demo map",
            fields: [{ id: 1, fieldId: 1, name: "Field 1", ownerFarmId: 1, hectares: 4.2, ...fieldRow }],
            ...extra,
        },
    };
}

describe("source combination and demo bounds", () => {
    test("detection-only mods are not advertised as live readings", () => {
        for (const id of DETECTED_ONLY) {
            const entry = catalog.catalogEntry(id);
            expect(entry).toBeTruthy();
            expect(catalog.companionSupport(entry)).not.toBe("live");
        }
        expect(catalog.catalogEntry("realSilo").desc).toContain("does not change");
        expect(catalog.catalogEntry("farmlandMarketplace").desc).toContain("does not accept");
        const ledgerDesc = catalog.catalogEntry("fieldProfitabilityLedger").desc.toLowerCase();
        expect(ledgerDesc).toContain("single player only");
        expect(ledgerDesc).toContain("this farm's field cycles");
        expect(ledgerDesc).toContain("summary query");
        expect(ledgerDesc).toContain("sales are not shown");
        expect(lua).toMatch(/runtime\.queryCycle\(cycleId, \{\s*includeExcluded = false,\s*includeLive = false,\s*recordLimit = 0,/);
        expect(lua).toMatch(/tonumber\(cycle\.farmId\) == farmId/);
        expect(lua).not.toMatch(/runtime[.:](save|export|publish|closeCycle|openCycle|acceptRecord|appendCorrection)\b/);
        expect(lua).not.toMatch(/\.getProductionPoints\b|getProductionPoints\s*\(/);
        expect(lua).not.toContain("getActiveTasksForCurrentFarm");
        expect(lua).toContain("clipText");
    });

    test("a private path cannot replace a recorded demo, and publish stays bounded", () => {
        const library = demo.emptyDemoLibrary();
        const leaked = demo.publishDemoGeneration(library, generation({}, { name: "C:\\Users\\private\\save" }));
        expect(leaked.ok).toBe(false);
        expect(leaked.error).toBe("private-or-invalid-text");
        expect(leaked.library).toBe(library);
        expect(leaked.library.pointer).toBe(null);

        const note = { note: "C:\\Users\\private\\save" };
        const strict = demo.publishDemoGeneration(library, generation(note), { strict: true });
        expect(strict.ok).toBe(false);
        expect(strict.error).toBe("unknown-field");
        expect(strict.library.pointer).toBe(null);
        const projected = demo.publishDemoGeneration(library, generation(note));
        expect(projected.ok).toBe(true);
        expect(JSON.stringify(projected.library.generations["gen-base"])).not.toMatch(/private|Users/);

        const { exportGeneration: _omitted, ...uncommittedInput } = generation();
        const uncommitted = demo.publishDemoGeneration(library, uncommittedInput);
        expect(uncommitted.ok).toBe(false);
        expect(uncommitted.error).toBe("uncommitted");
        expect(uncommitted.library.pointer).toBe(null);

        const started = process.hrtime.bigint();
        let current = library;
        for (let i = 0; i < 100; i += 1) {
            const next = demo.publishDemoGeneration(current, { ...generation(), id: `gen-base-${i}` });
            expect(next.ok).toBe(true);
            current = next.library;
        }
        const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
        expect(durationMs).toBeLessThan(500);
        console.log(`demo-publish-100 duration_ms ${durationMs}`);
    });
});
