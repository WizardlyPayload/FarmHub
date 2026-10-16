"use strict";

const path = require("path");
const fs = require("fs");
const { lauxlib, lualib, lua, to_luastring } = require("fengari");
const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "SmartCropControlCollector.lua";

// Mirrors SmartFruitControl from Smart Crop Control 1.2.0.0 and plain FS25 Field members.
const MOD_ENV = `
    _G.g_modIsLoaded = { FS25_SmartCropControl = true }
    _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_SmartCropControl", version = "1.2.0.0" } } end }
    local fruitNames = { [1] = "WHEAT", [2] = "POTATO", [3] = "SUGAR_BEET", [4] = "CARROT", [5] = "COTTON" }
    _G.g_fruitTypeManager = { getFruitTypeNameByIndex = function(self, i) return fruitNames[i] end }
    local function field(id, area, owned, fruit, planned, extra)
        local f = {
            areaHa = area, isMissionAllowed = true, plannedFruitTypeIndex = planned or 0,
            fieldState = { isValid = true, fruitTypeIndex = fruit or 0 },
            getAreaHa = function(self) return self.areaHa end,
            getHasOwner = function() return owned end,
            getId = function() return id end,
            getName = function() return tostring(id) end,
        }
        for k, v in pairs(extra or {}) do f[k] = v end
        return f
    end
    _G.g_fieldManager = {
        availableFruitTypeIndices = { 1, 2, 3, 4 },
        fields = {
            field(1, 2.5, false, 2),
            field(2, 5, false, 1, 4),
            field(3, 12, true, 2),
            field(4, 25, false, 3),
            field(5, 40, false, 1),
            field(6, 4, false, 2, nil, { grassMissionOnly = true }),
        },
    }
    _G.FS25_SmartCropControl = {
        SmartFruitControl = {
            settings = {
                root_chance_0_3 = 0, root_chance_3_8 = 40, root_chance_8_20 = 80, root_chance_20_30 = 30, root_chance_30_plus = 0,
                vegetable_chance_0_3 = 15, vegetable_chance_3_8 = 65, vegetable_chance_8_20 = 30, vegetable_chance_20_30 = 0, vegetable_chance_30_plus = 0,
                special_chance_0_3 = 0, special_chance_3_8 = 0, special_chance_8_20 = 20, special_chance_20_30 = 30, special_chance_30_plus = 0,
                debug = false,
            },
            rootFruitNames = { POTATO = true, SUGARBEET = true, BEETROOT = true, ONION = true, REDBEET = true },
            vegetableFruitNames = { CARROT = true, PARSNIP = true, GREENBEAN = true, PEA = true, SPINACH = true },
            specialFruitNames = { COTTON = true, SUGARCANE = true },
            setSetting = function() error("write") end,
        },
    }
`;

describe("Smart Crop Control page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("exports the keep-chance grid, controlled crops on the map and NPC fields by size", () => {
        const page = runCompanionPage(FILE, MOD_ENV, { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.version).toBe("1.2.0.0");
        expect(page.chances).toEqual({
            root: [0, 40, 80, 30, 0],
            vegetable: [15, 65, 30, 0, 0],
            special: [0, 0, 20, 30, 0],
        });
        expect(page.debug).toBe(false);
        expect(page.crops.root.find((c) => c.crop === "POTATO")).toEqual({ crop: "POTATO", onMap: true });
        expect(page.crops.root.find((c) => c.crop === "SUGARBEET").onMap).toBe(true);
        expect(page.crops.special.find((c) => c.crop === "COTTON").onMap).toBe(false);
        expect(page.crops.vegetable.map((c) => c.crop)).toEqual(["CARROT", "GREENBEAN", "PARSNIP", "PEA", "SPINACH"]);

        expect(page.npcFieldCount).toBe(4);
        expect(page.bands.map((b) => b.fields)).toEqual([1, 1, 0, 1, 1]);
        expect(page.bands[0].growing).toEqual({ root: 1, vegetable: 0, special: 0 });
        expect(page.bands[1].planned).toEqual({ root: 0, vegetable: 1, special: 0 });
        expect(page.bands[3]).toMatchObject({ band: "20_30", areaHa: 25, growing: { root: 1, vegetable: 0, special: 0 } });
        expect(page.fields).toEqual([
            { fieldId: 1, name: "1", areaHa: 2.5, band: "0_3", crop: "POTATO", category: "root", stage: "growing", keepChance: 0 },
            { fieldId: 2, name: "2", areaHa: 5, band: "3_8", crop: "CARROT", category: "vegetable", stage: "planned", keepChance: 65 },
            { fieldId: 4, name: "4", areaHa: 25, band: "20_30", crop: "SUGAR_BEET", category: "root", stage: "growing", keepChance: 30 },
        ]);
        expect(page.coverage).toBe("complete");
    });

    test("settings-only without a field manager; detection-only without the mod table", () => {
        const noFields = runCompanionPage(FILE, `${MOD_ENV}
            _G.g_fieldManager = nil
        `, { farmId: 1 });
        expect(noFields.readState).toBe("settings-only");
        expect(noFields.chances.special[3]).toBe(30);
        expect(noFields.fields).toBeUndefined();
        const none = runCompanionPage(FILE, `${MOD_ENV}
            _G.FS25_SmartCropControl = {}
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
