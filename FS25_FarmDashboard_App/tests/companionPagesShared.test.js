"use strict";

const { runCompanionLua } = require("./helpers/companion-page-lua.cjs");
const { pruneCompanionPagesToFarms } = require("../companionPagesMerge.cjs");

function sanitize(buildLua) {
    return runCompanionLua([], "", `
        local page = (function()
            ${buildLua}
        end)()
        return __fdEncode(CompanionPages.sanitize(page))
    `);
}

describe("CompanionPages.sanitize", () => {
    test("keeps tables up to depth 7 and drops depth 8 (page = 0)", () => {
        const page = sanitize(`
            return { a = { b = { c = { d = { e = { f = { n = 6, g = { n = 7, h = { n = 8 } } } } } } } } }
        `);
        const f = page.a.b.c.d.e.f;
        expect(f.n).toBe(6);
        expect(f.g.n).toBe(7);
        expect(f.g.h).toBeUndefined();
    });

    test("a pen row output list (depth 6 rows) survives", () => {
        const page = sanitize(`
            return { byFarm = { ["1"] = { pens = { { name = "Pen", outputs = { { title = "Milk", daily = 12 } } } } } } }
        `);
        expect(page.byFarm["1"].pens[0].outputs).toEqual([{ title: "Milk", daily: 12 }]);
    });

    test("drops tables that are already on the current path", () => {
        const page = sanitize(`
            local t = { name = "root" }
            t.self = t
            t.child = { parent = t, value = 3 }
            local loop = {}
            loop[1] = loop
            loop[2] = loop
            t.loop = loop
            return t
        `);
        expect(page.name).toBe("root");
        expect(page.self).toBeUndefined();
        expect(page.child).toEqual({ value: 3 });
        expect(Object.keys(page.loop)).toHaveLength(0);
        expect(page.sanitizerTruncated).toBeUndefined();
    });

    test("shared-reference fan-out is bounded by the node budget", () => {
        const page = sanitize(`
            local level = { 1 }
            for _ = 1, 7 do
                local nextLevel = {}
                for i = 1, 200 do nextLevel[i] = level end
                level = nextLevel
            end
            return { rows = level }
        `);
        expect(page.sanitizerTruncated).toBe(true);
        expect(Array.isArray(page.rows)).toBe(true);
    });

    test("a Factory Profit page at its own caps is not truncated", () => {
        const page = sanitize(`
            local function io()
                local rows = {}
                for j = 1, 8 do
                    rows[j] = { fillType = "FT" .. j, title = "Fill " .. j, litersPerMonth = j * 100,
                        pricePer1000 = 900, priceSource = "peak", value = j * 90 }
                end
                return rows
            end
            local lines = {}
            for i = 1, 40 do
                lines[i] = { farmId = 1, point = "Point", recipe = "Recipe " .. i, status = 1, running = true,
                    cyclesPerMonth = 24, upkeepPerMonth = 10, inputCost = 100, outputValue = 200, profit = 90,
                    inputs = io(), outputs = io() }
            end
            local overrides = {}
            for i = 1, 30 do
                overrides[i] = { factory = "F", line = "L" .. i, originalCyclesPerHour = 1, cyclesPerHour = 2,
                    inputs = 1, outputs = 1, capacities = 1 }
            end
            return { readState = "ok", byFarm = { ["1"] = { lineCount = 40 } }, lines = lines, overrides = overrides }
        `);
        expect(page.sanitizerTruncated).toBeUndefined();
        expect(page.lines).toHaveLength(40);
        const last = page.lines[39];
        expect(last.recipe).toBe("Recipe 40");
        expect(last.inputs).toHaveLength(8);
        expect(last.outputs[7]).toEqual({
            fillType: "FT8", title: "Fill 8", litersPerMonth: 800, pricePer1000: 900, priceSource: "peak", value: 720,
        });
        expect(page.overrides).toHaveLength(30);
    });
});

describe("ctx.ownedVehicles", () => {
    const pages = `
        _G.g_modIsLoaded = { FS25_TestOwned = true }
        local seen = {}
        CompanionPages.register({ key = "ownedA", modNames = { "FS25_TestOwned" }, collect = function(ctx)
            seen.a = #ctx.ownedVehicles()
            return { coverage = "complete" }
        end })
        CompanionPages.register({ key = "ownedB", modNames = { "FS25_TestOwned" }, collect = function(ctx)
            seen.b = #ctx.ownedVehicles()
            return { coverage = "complete" }
        end })
    `;

    test("one walk per cycle, own farm only, deleted vehicles skipped", () => {
        const out = runCompanionLua([], `
            _G.ownerCalls = 0
            local lazy = { getOwnerFarmId = function() _G.ownerCalls = _G.ownerCalls + 1; return 1 end }
            _G.g_currentMission = { vehicleSystem = { vehicles = {
                { ownerFarmId = 1 }, lazy, { ownerFarmId = 2 }, { ownerFarmId = 1, isDeleted = true },
            } } }
        `, `
            ${pages}
            CompanionPages.collectEntry(CompanionPages.entries.ownedA, 5)
            CompanionPages.collectEntry(CompanionPages.entries.ownedB, 5)
            local sameCycle = _G.ownerCalls
            CompanionPages.collectEntry(CompanionPages.entries.ownedA, 6)
            return __fdEncode({ a = seen.a, b = seen.b, sameCycle = sameCycle, nextCycle = _G.ownerCalls })
        `, { farmId: 1 });
        expect(out).toEqual({ a: 2, b: 2, sameCycle: 1, nextCycle: 2 });
    });

    test("a capped shared walk marks the page truncated", () => {
        const page = runCompanionLua([], `
            local vehicles = {}
            for i = 1, 450 do vehicles[i] = { ownerFarmId = 1 } end
            _G.g_currentMission = { vehicleSystem = { vehicles = vehicles } }
        `, `
            ${pages}
            local page = CompanionPages.collectEntry(CompanionPages.entries.ownedA, 1)
            page.count = seen.a
            return __fdEncode(page)
        `, { farmId: 1 });
        expect(page.count).toBe(400);
        expect(page.coverage).toBe("truncated");
    });
});

describe("pruneCompanionPagesToFarms", () => {
    const players = new Set([1]);

    test("filters byFarm and top-level rows that belong to other farms", () => {
        const out = pruneCompanionPagesToFarms({
            enabled: true,
            pages: {
                realSilo: {
                    detected: true,
                    byFarm: { 1: { silos: 1 }, 2: { silos: 4 } },
                    silos: [{ farmId: 1, name: "Mine" }, { farmId: 2, name: "Theirs" }, { name: "Shared" }, { farmId: 0, name: "Neutral" }],
                    tags: ["a", "b"],
                },
            },
        }, players);
        const page = out.pages.realSilo;
        expect(Object.keys(page.byFarm)).toEqual(["1"]);
        expect(page.silos.map((r) => r.name)).toEqual(["Mine", "Shared", "Neutral"]);
        expect(page.tags).toEqual(["a", "b"]);
    });

    test("filters top-level rows on pages without byFarm", () => {
        const out = pruneCompanionPagesToFarms({
            pages: { productionWatcher: { detected: true, points: [{ farmId: 3 }, { farmId: 1 }] } },
        }, players);
        expect(out.pages.productionWatcher.points).toEqual([{ farmId: 1 }]);
        expect(out.pages.productionWatcher.byFarm).toBeUndefined();
    });

    test("leaves pages alone when every row is a player farm", () => {
        const page = { detected: true, lines: [{ farmId: 1 }] };
        const out = pruneCompanionPagesToFarms({ pages: { factoryProfitCalculator: page } }, players);
        expect(out.pages.factoryProfitCalculator.lines).toBe(page.lines);
    });
});
