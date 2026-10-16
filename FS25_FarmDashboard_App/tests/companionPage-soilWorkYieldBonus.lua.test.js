"use strict";

const path = require("path");
const fs = require("fs");
const { lauxlib, lualib, lua, to_luastring } = require("fengari");
const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "SoilWorkYieldBonusCollector.lua";

// Mirrors g_soilWorkYieldBonus from Soil Work Yield Bonus 1.3.0.1 (cells keyed by cx * 100000 + cz).
function modEnv(cellsLua, cellSize = 2) {
    return `
    _G.g_modIsLoaded = { FS25_SoilWorkYieldBonus = true }
    _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_SoilWorkYieldBonus", version = "1.3.0.1" } } end }
    local cells = ${cellsLua}
    _G.FS25_SoilWorkYieldBonus = {
        g_soilWorkYieldBonus = {
            settings = {
                enabled = true, showOverlay = true, cellSizeMeters = ${cellSize},
                bonusDiscHarrow = 0.04, bonusCultivatorDeep = 0.06, bonusCultivatorShallow = 0.04,
                bonusPowerHarrow = 0.08, bonusSubsoiler = 0.10, bonusPlow = 0.12,
            },
            cellSize = ${cellSize},
            cells = cells,
            setBonus = function() error("write") end,
        },
    }
`;
}

describe("Soil Work Yield Bonus page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("aggregates worked cells per bonus tier without exporting cell keys", () => {
        const page = runCompanionPage(FILE, modEnv(`{
            [100001] = 0.12, [100002] = 0.12, [100003] = 0.04, [200004] = 0.04, [200005] = 0.04,
            [300006] = 0.06, [300007] = 0, [300008] = -1,
        }`), { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.version).toBe("1.3.0.1");
        expect(page.settings).toMatchObject({ enabled: true, showOverlay: true, cellSizeMeters: 2 });
        expect(page.settings.tools).toHaveLength(6);
        expect(page.settings.tools[5]).toEqual({ tool: "plow", bonus: 0.12 });
        expect(page.workedCells).toBe(6);
        // 6 cells of 2 m x 2 m = 24 m2
        expect(page.workedAreaHa).toBe(0);
        expect(page.bestBonus).toBe(0.12);
        expect(page.averageBonus).toBe(0.07);
        expect(page.coverage).toBe("complete");
        expect(page.tiers.map((t) => t.bonus)).toEqual([0.12, 0.06, 0.04]);
        expect(page.tiers[0]).toMatchObject({ cells: 2, tools: ["plow"] });
        expect(page.tiers[2]).toMatchObject({ cells: 3, tools: ["discHarrow", "cultivatorShallow"] });
        expect(JSON.stringify(page)).not.toContain("100001");
    });

    test("area uses the grid size and the scan cap marks the totals as sampled", () => {
        const page = runCompanionPage(FILE, modEnv(`(function()
            local t = {}
            for i = 1, 20050 do t[i * 7] = 0.1 end
            return t
        end)()`, 10), { farmId: 1 });
        expect(page.coverage).toBe("sampled");
        expect(page.scannedCells).toBe(20000);
        expect(page.workedCells).toBe(20000);
        // 20000 cells of 100 m2 = 200 ha
        expect(page.workedAreaHa).toBe(200);
        expect(page.tiers).toEqual([{ bonus: 0.1, cells: 20000, areaHa: 200, tools: ["subsoiler"] }]);
    });

    test("settings-only without the cell grid; detection-only without the manager", () => {
        const noCells = runCompanionPage(FILE, `${modEnv("{}")}
            _G.FS25_SoilWorkYieldBonus.g_soilWorkYieldBonus.cells = nil
        `, { farmId: 1 });
        expect(noCells.readState).toBe("settings-only");
        expect(noCells.settings.enabled).toBe(true);
        const none = runCompanionPage(FILE, `${modEnv("{}")}
            _G.FS25_SoilWorkYieldBonus = {}
        `, { farmId: 1 });
        expect(none.readState).toBe("detection-only");
    });

    test("collector parses as Lua", () => {
        const src = fs.readFileSync(path.join(__dirname, "../../FS25_FarmDashboard_Mod/src/companionPages", FILE), "utf8");
        const L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);
        expect(lauxlib.luaL_loadstring(L, to_luastring(src))).toBe(lua.LUA_OK);
    });
});
