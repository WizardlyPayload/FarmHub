"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "ProductionWatcherCollector.lua";
const FILL_TYPES = `
    _G.g_fillTypeManager = {
        names = { [1] = "WHEAT", [2] = "FLOUR", [3] = "SUGAR" },
        getFillTypeNameByIndex = function(self, i) return self.names[i] end,
        getFillTypeByIndex = function(self, i) return self.names[i] and { name = self.names[i], title = self.names[i] .. " title" } or nil end,
    }
`;

function point({ owner = 1, type = "productionPoint", name = "Mill", status = 1, levels, caps, modes = "{}", amount = 10 }) {
    return `{
        ownerFarmId = ${owner},
        owningPlaceable = { typeName = "${type}", uniqueId = "${name}-id", getName = function() return "${name}" end },
        getName = function(self) return "${name}" end,
        getOutputDistributionMode = function(self, ft) return (${modes})[ft] or 0 end,
        setProductionState = function() error("write") end,
        storage = {
            levels = { [1] = ${levels[0]}, [2] = ${levels[1]} },
            caps = { [1] = ${caps[0]}, [2] = ${caps[1]} },
            getFillLevel = function(self, ft) return self.levels[ft] end,
            getCapacity = function(self, ft) return self.caps[ft] end,
            setFillLevel = function() error("write") end,
        },
        productions = {
            { status = ${status}, inputs = { { type = 1, amount = ${amount} } }, outputs = { { type = 2, amount = 5 } } },
        },
    }`;
}

function setup(points, extra = "") {
    return `
        _G.g_modIsLoaded = { FS25_ProductionWatcher = true }
        ${FILL_TYPES}
        _G.g_currentMission = {
            getFarmId = function() return 1 end,
            productionChainManager = { productionPoints = { ${points.join(",")} } },
        }
        ${extra}
    `;
}

describe("Production Watcher page collector", () => {
    test("not detected when the mod is not loaded", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("applies the mod's input/output thresholds to the farm's own points", () => {
        const page = runCompanionPage(FILE, setup([
            point({ name: "Mill", levels: [2, 960], caps: [1000, 1000] }),
            point({ name: "Bakery", levels: [3, 100], caps: [1000, 1000], amount: 10 }),
            point({ name: "Sugar", levels: [500, 1000], caps: [1000, 1000] }),
            point({ name: "Neighbour", owner: 2, levels: [0, 1000], caps: [1000, 1000] }),
        ]), { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.alertsReadable).toBe(false);
        const farm = page.byFarm["1"];
        expect(farm.pointCount).toBe(3);
        expect(farm.missingInputs).toBe(2);
        expect(farm.outputFull).toBe(1);
        expect(farm.outputNearlyFull).toBe(1);
        const byName = Object.fromEntries(page.points.map((p) => [p.name, p]));
        expect(byName.Mill.inputAlert).toBe("missing");
        expect(byName.Mill.outputAlert).toBe("nearlyFull");
        expect(byName.Sugar.outputAlert).toBe("full");
        expect(byName.Neighbour).toBeUndefined();
        const flour = byName.Mill.storage.find((row) => row.fillType === "FLOUR");
        expect(flour).toMatchObject({ role: "output", level: 960, capacity: 1000, percent: 96 });
        expect(page.points[0].inputAlert || page.points[0].outputAlert).toBeTruthy();
    });

    test("low input under 5% and skipped outputs on direct sell", () => {
        const page = runCompanionPage(FILE, setup([
            point({ name: "Low", levels: [40, 1000], caps: [1000, 1000], amount: 10, modes: "{ [2] = 1 }" }),
        ]), { farmId: 1 });
        const row = page.points[0];
        expect(row.inputAlert).toBe("low");
        expect(row.outputAlert).toBeUndefined();
    });

    test("inactive lines and unwatched placeable types raise no alerts", () => {
        const page = runCompanionPage(FILE, setup([
            point({ name: "Idle", status: 0, levels: [0, 1000], caps: [1000, 1000] }),
            point({ name: "Shed", type: "FS25_x.productionPoint", levels: [0, 1000], caps: [1000, 1000] }),
        ]), { farmId: 1 });
        const farm = page.byFarm["1"];
        expect(farm.missingInputs + farm.outputFull + farm.lowInputs + farm.outputNearlyFull).toBe(0);
        expect(farm.watchedCount).toBe(1);
        expect(page.points.find((p) => p.name === "Shed").watched).toBe(false);
    });

    test("no farm or no production manager is settings-only", () => {
        const noManager = runCompanionPage(FILE, `
            _G.g_modIsLoaded = { FS25_ProductionWatcher = true }
            _G.g_currentMission = { getFarmId = function() return 1 end }
        `, { farmId: 1 });
        expect(noManager.readState).toBe("settings-only");
        expect(noManager.reason).toBe("no-production-manager");
        const noFarm = runCompanionPage(FILE, `
            _G.g_modIsLoaded = { FS25_319635_Production_Watcher = true }
            _G.g_currentMission = { getFarmId = function() return 0 end, productionChainManager = { productionPoints = {} } }
        `);
        expect(noFarm.readState).toBe("settings-only");
        expect(noFarm.reason).toBe("no-farm");
    });

    test("caps the exported point list at 30 and flags truncation", () => {
        const many = Array.from({ length: 35 }, (_, i) => point({ name: `P${i}`, levels: [500, 10], caps: [1000, 1000] }));
        const page = runCompanionPage(FILE, setup(many), { farmId: 1 });
        expect(page.points).toHaveLength(30);
        expect(page.byFarm["1"].pointCount).toBe(35);
        expect(page.coverage).toBe("truncated");
    });
});
