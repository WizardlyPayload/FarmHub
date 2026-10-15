"use strict";

/**
 * PF lime contract: the production FieldDataCollector runs in the native mod environment
 * (modEnv inherits _G) with a synthetic Precision Farming instance and FieldState probe, its output
 * is serialized by the production FarmDashboardDataCollector:toJSON, and fallow results are fed to
 * the real V5 rule builder. All soil values are synthetic.
 *
 * Lime policy under test: with a known positive soil-map target the only tolerance is the 0.2 pH
 * band below target. The N 10% closeness rule stays on N only.
 */
const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { productionTs, productionFunctions } = require("./helpers/production-source.cjs");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");
const FILES = ["FillTypeUtils.lua", "collectors/FieldDataCollector.lua", "FarmDashboardDataCollector.lua"];

function longString(text) {
    let level = 0;
    while (text.includes("]" + "=".repeat(level) + "]")) level += 1;
    const eq = "=".repeat(level);
    return "[" + eq + "[\n" + text + "]" + eq + "]";
}

function luaValue(v) {
    if (v === null || v === undefined) return "nil";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v === "string") return JSON.stringify(v);
    throw new Error("unsupported fixture value " + typeof v);
}

function luaTable(obj) {
    return "{ " + Object.entries(obj).map(([k, v]) => `${k} = ${luaValue(v)}`).join(", ") + " }";
}

const prelude = `
unpack = unpack or table.unpack
Logging = { info = function() end, warning = function() end }
FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end, warn = function() end, info = function() end, isVerbose = function() return false end }
g_time = 1000
FARMLAND = { id = 5, farmId = 1 }
g_farmlandManager = {
    getFarmlandIdAtWorldPosition = function(self, x, z) return 5 end,
    getFarmlandAtWorldPosition = function(self, x, z) return FARMLAND end,
    getFarmlandById = function(self, id) if id == 5 then return FARMLAND end end,
}
g_fieldManager = { fields = { { farmland = FARMLAND, areaHa = 1, posX = 10, posZ = 10, fieldId = 1 } } }
g_fillTypeManager = {
    getFillTypes = function(self) return {} end,
    getFillTypeByIndex = function(self, i) return nil end,
    getFillTypeNameByIndex = function(self, i) return nil end,
    getFillTypeIndexByName = function(self, n) return nil end,
}
g_currentMission = {
    getFarmId = function() return 1 end,
    missionInfo = { savegameDirectory = "savegame1", mapId = "MapUS" },
}
FRUITS = {
    [2] = { index = 2, name = "WHEAT", numGrowthStates = 8, minHarvestingGrowthState = 8, maxHarvestingGrowthState = 8, growthStateToName = { [10] = "harvested" } },
    [4] = { index = 4, name = "GRASS", numGrowthStates = 4, minHarvestingGrowthState = 3, maxHarvestingGrowthState = 4, growthStateToName = {} },
}
g_fruitTypeManager = { getFruitTypeByIndex = function(self, i) return FRUITS[i] end }
CROP = { fruitTypeIndex = 0, growthState = 0, plowLevel = 1, weedState = 0, rollerLevel = 0, stubbleShredLevel = 0, sprayLevel = 0, limeLevel = 0, groundType = 0 }
FieldState = { new = function()
    local s = {}
    function s:update(x, z) for k, v in pairs(CROP) do self[k] = v end end
    return s
end }
CAREER = {}
XML_LOAD_CALLS = 0
function fileExists(filename) return CAREER.limeRequired ~= nil end
function loadXMLFile(name, filename)
    if name == "FarmDashCareerGameplay" then XML_LOAD_CALLS = XML_LOAD_CALLS + 1 end
    if CAREER.limeRequired ~= nil then return 7 end
    return 0
end
function getXMLString(fh, key)
    if key == "careerSavegame.settings.limeRequired" and CAREER.limeRequired ~= nil then return tostring(CAREER.limeRequired) end
    return nil
end
function delete() end
`;

function pfEngine(pf) {
    const p = { soilType: 3, ph: 6.31, phTarget: 6.81, n: 20.5, nTarget: 168, ...pf };
    return `
PF = ${luaTable(p)}
if PF.ph == "AT_BAND" then PF.ph = PF.phTarget - 0.2 end
PF_PH_NIL = ${p.ph === null}
PF_TARGET_NIL = ${p.phTarget === null}
PF_N_NIL = ${p.n === null}
g_precisionFarming = {
    soilMap = { getTypeIndexAtWorldPos = function(self, x, z) return PF.soilType end },
    nitrogenMap = {
        getLevelAtWorldPos = function(self, x, z) if PF_N_NIL then return nil end return PF.n end,
        getTargetLevelAtWorldPos = function(self, x, z) return PF.nTarget end,
    },
    pHMap = {
        getLevelAtWorldPos = function(self, x, z) if PF_PH_NIL then return nil end return PF.ph end,
        getOptimalPHValueForSoilTypeIndex = function(self, s) if PF_TARGET_NIL then return nil end return PF.phTarget end,
    },
}
`;
}

// Only the parcel centre (10, 10) is on the farmland, so soil averages are a single exact sample.
const SINGLE_SAMPLE = `
OTHER_FARMLAND = { id = 6, farmId = 0 }
g_farmlandManager.getFarmlandIdAtWorldPosition = function(self, x, z) if x == 10 and z == 10 then return 5 end return 6 end
g_farmlandManager.getFarmlandAtWorldPosition = function(self, x, z) if x == 10 and z == 10 then return FARMLAND end return OTHER_FARMLAND end
`;

function collect({ pf = {}, crop = {}, career = {}, vanilla = false, singleSample = false } = {}) {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        const sources = FILES.map((file) => `{ name = ${JSON.stringify(file)}, text = ${longString(fs.readFileSync(path.join(modSrc, file), "utf8"))} }`);
        const body = `
local res = FieldDataCollector:collect()
local f = res[1]
local atBand = false
if type(f.phValue) == "number" and type(f.targetPh) == "number" then atBand = (f.phValue == f.targetPh - 0.2) end
return FarmDashboardDataCollector:toJSON({ fields = res, atBand = atBand, careerXmlOpens = XML_LOAD_CALLS })
`;
        const chunk = [
            prelude,
            vanilla ? "" : pfEngine(pf),
            singleSample ? SINGLE_SAMPLE : "",
            Object.entries(crop).map(([k, v]) => `CROP.${k} = ${luaValue(v)}`).join("\n"),
            Object.entries(career).map(([k, v]) => `CAREER.${k} = ${luaValue(v)}`).join("\n"),
            "local modEnv = {}",
            "FS25_FarmDashboard = modEnv",
            "setmetatable(modEnv, { __index = _G })",
            "modEnv._G = modEnv",
            "function modEnv.getfenv(obj) return modEnv end",
            `local SOURCES = { ${sources.join(",\n")} }`,
            "for i = 1, #SOURCES do local fn = assert(load(SOURCES[i].text, '=' .. SOURCES[i].name, 't', modEnv)); fn() end",
            `local body = assert(load(${longString(body)}, '=body', 't', modEnv))`,
            "return body()",
        ].join("\n");
        const status = lauxlib.luaL_dostring(L, to_luastring(chunk));
        if (status !== lua.LUA_OK) {
            const err = lua.lua_tostring(L, -1);
            throw new Error(err ? to_jsstring(err) : `lua error ${status}`);
        }
        const out = JSON.parse(to_jsstring(lua.lua_tostring(L, -1)));
        return { field: out.fields[0], atBand: out.atBand, careerXmlOpens: out.careerXmlOpens };
    } finally {
        lua.lua_close(L);
    }
}

function serializeWithProductionToJson(luaLiteral) {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        const chunk = [
            prelude,
            fs.readFileSync(path.join(modSrc, "FarmDashboardDataCollector.lua"), "utf8"),
            `return FarmDashboardDataCollector:toJSON(${luaLiteral})`,
        ].join("\n");
        const status = lauxlib.luaL_dostring(L, to_luastring(chunk));
        if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
        return to_jsstring(lua.lua_tostring(L, -1));
    } finally {
        lua.lua_close(L);
    }
}

const t = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key);
const rules = productionTs("NEW APP/src/lib/rules-engine/rules-engine.ts", { "@/i18n/i18n": { t, tOr: (_k, fallback) => fallback } });
const { optionalOrganicSkipKeyForField } = productionFunctions("NEW APP/src/sections/fields/field-helpers.ts", ["optionalOrganicSkipKeyForField"]);
const GAME = { limeRequired: true, plowingRequired: true, weedsEnabled: true, stonesEnabled: true };

const actions = (f) => f.suggestions.map((s) => s.action);
const MOJIBAKE = /\u00e2\u20ac|\u00e2\u2020/;

describe("117 PF lime decision in the production collector", () => {
    test("native-shaped fallow parcel: 0.5 below target needs lime and the collector orders lime before organic and sowing", () => {
        const { field: f } = collect();
        expect(f.isPrecisionFarming).toBe(true);
        expect(f.isScanned).toBe(true);
        expect(f.phReadState).toBe("ok");
        expect(f.nitrogenReadState).toBe("ok");
        expect(f.soilReadState).toBe("ok");
        expect(f.phValue).toBeCloseTo(6.31, 10);
        expect(f.targetPh).toBeCloseTo(6.81, 10);
        expect(f.fruitType).toBe("empty");
        expect(f.growthState).toBe(0);
        expect(f.limeText).toBe("6.3 pH");
        expect(f.needsLime).toBe(true);
        expect(f.limeLevel).toBe(0);
        const a = actions(f);
        expect(a.indexOf("Apply lime")).toBeGreaterThanOrEqual(0);
        expect(a.indexOf("Apply lime")).toBeLessThan(a.indexOf("Spread manure or slurry"));
        expect(a.indexOf("Spread manure or slurry")).toBeLessThan(a.indexOf("Sow or plant crop"));
        const lime = f.suggestions.find((s) => s.action === "Apply lime");
        expect(lime.priority).toBe(105);
        expect(lime.reason).toMatch(/^Avg pH 6\.3 \/ target 6\.8 \(lime before seeding; below ~6\.6\)/);
    });

    test("the real V5 rule builder offers optional organic first, then lime before seed once organic is skipped", () => {
        const { field: f } = collect();
        const first = rules.getLocalFieldSuggestion(f, { gameSettings: GAME, skippedOptionalOrganic: {} });
        expect(first.actionKey).toBe("rules.action.optionalOrganicFirst");
        const key = optionalOrganicSkipKeyForField(f);
        expect(key).toBe("5::empty|empty|0|0");
        const next = rules.getLocalFieldSuggestion(f, { gameSettings: GAME, skippedOptionalOrganic: { [key]: true } });
        expect(next.actionKey).toBe("rules.action.spreadLimeBeforeSeed");
        expect(next.reason).toBe('rules.reason.limeBeforeSeedPF{"ph":"6.3","target":"6.8","gap":"0.5"}');
        expect(next.actionKey).not.toBe("rules.action.directDrill");
    });

    test("band boundaries: exactly at target-0.2 is satisfied, just below needs lime, above is satisfied", () => {
        const at = collect({ pf: { ph: "AT_BAND", phTarget: 6.45 }, singleSample: true });
        expect(at.atBand).toBe(true);
        expect(at.field.needsLime).toBe(false);
        expect(at.field.limeLevel).toBe(1);

        const below = collect({ pf: { ph: 6.2, phTarget: 6.45 } }).field;
        expect(below.needsLime).toBe(true);
        expect(below.limeLevel).toBe(0);
        expect(actions(below)).toContain("Apply lime");

        const above = collect({ pf: { ph: 6.4, phTarget: 6.45 } }).field;
        expect(above.needsLime).toBe(false);
        expect(above.limeLevel).toBe(1);
        expect(actions(above)).not.toContain("Apply lime");

        const far = collect({ pf: { ph: 5.1, phTarget: 6.5 } }).field;
        expect(far.needsLime).toBe(true);
    });

    test("measured zero: pH 0 is not a reading (held), N 0 is a legitimate measured zero", () => {
        const f = collect({ pf: { ph: 0, n: 0 } }).field;
        expect(f.isScanned).toBe(true);
        expect(f.phReadState).toBe("held");
        expect(f.phValue).toBeNull();
        expect(f.targetPh).toBeNull();
        expect(f.nitrogenReadState).toBe("ok");
        expect(f.nitrogenLevel).toBe(0);
        expect(f.soilReadState).toBe("partial");
        // Pre-existing missing-target fallback (6.5 reference) still decides; unchanged by 117.
        expect(f.needsLime).toBe(true);
        expect(f.limeText).toBe("0.0 pH");
    });

    test("unscanned PF parcel stays 'Needs Scan' and the rule builder asks for a scan", () => {
        const f = collect({ pf: { soilType: 0 } }).field;
        expect(f.isScanned).toBe(false);
        expect(f.soilReadState).toBe("unscanned");
        expect(f.phReadState).toBe("unscanned");
        expect(f.nitrogenReadState).toBe("unscanned");
        expect(f.phValue).toBeNull();
        expect(f.targetPh).toBeNull();
        expect(f.nitrogenLevel).toBeNull();
        expect(f.limeText).toBe("Needs Scan");
        expect(f.needsLime).toBe(true);
        expect(f.limeLevel).toBe(0);
        expect(actions(f)[0]).toBe("Soil scan");
        expect(rules.getLocalFieldSuggestion(f, { gameSettings: GAME }).actionKey).toBe("rules.action.runSoilScan");
    });

    test("held and unknown reads stay held; a pH read with a held N still decides lime from pH", () => {
        const heldPh = collect({ pf: { ph: null } }).field;
        expect(heldPh.phReadState).toBe("held");
        expect(heldPh.phValue).toBeNull();
        expect(heldPh.targetPh).toBeNull();
        expect(heldPh.soilReadState).toBe("partial");

        const unknownPh = collect({ pf: { ph: "unknown" } }).field;
        expect(unknownPh.phReadState).toBe("held");
        expect(unknownPh.phValue).toBeNull();

        const heldN = collect({ pf: { n: null } }).field;
        expect(heldN.nitrogenReadState).toBe("held");
        expect(heldN.nitrogenLevel).toBeNull();
        expect(heldN.phReadState).toBe("ok");
        expect(heldN.soilReadState).toBe("partial");
        expect(heldN.needsLime).toBe(true);

        const failed = collect({ pf: { ph: null, n: null } }).field;
        expect(failed.soilReadState).toBe("failed");
        expect(failed.phValue).toBeNull();
        expect(failed.nitrogenLevel).toBeNull();
    });

    test("missing soil-map target keeps the pre-existing 6.5 fallback and exports target 0 (not fabricated by 117)", () => {
        // Whole numbers 1..31 are raw PF states and decode to pH, so the synthetic reading is non-integer.
        const mild = collect({ pf: { ph: 6.05, phTarget: null } }).field;
        expect(mild.phReadState).toBe("ok");
        expect(mild.targetPh).toBe(0);
        expect(mild.needsLime).toBe(false);
        const low = collect({ pf: { ph: 5.5, phTarget: null } }).field;
        expect(low.targetPh).toBe(0);
        expect(low.needsLime).toBe(true);
        const sug = low.suggestions.find((s) => s.action === "Apply lime");
        expect(sug.reason).toMatch(/target 6\.5 \(lime before seeding; below ~6\.3\)/);
    });
});

describe("117 preserved policies", () => {
    test("missing staged career XML is not opened; present XML still controls lime", () => {
        expect(collect().careerXmlOpens).toBe(0);
        const present = collect({ career: { limeRequired: false } });
        expect(present.careerXmlOpens).toBe(1);
        expect(present.field.needsLime).toBe(false);
    });

    test("field-3-shaped harvested wheat keeps its pH display, target and measured-zero N; late-crop timing holds lime", () => {
        const f = collect({ pf: { ph: 5.97, phTarget: 6.6, n: 0, nTarget: 160 }, crop: { fruitTypeIndex: 2, growthState: 10 } }).field;
        expect(f.fruitType).toBe("WHEAT");
        expect(f.isHarvested).toBe(true);
        expect(f.limeText).toBe("6.0 pH");
        expect(f.phValue).toBeCloseTo(5.97, 10);
        expect(f.targetPh).toBeCloseTo(6.6, 10);
        expect(f.nitrogenLevel).toBe(0);
        expect(f.nitrogenReadState).toBe("ok");
        expect(f.targetNitrogen).toBe(160);
        expect(f.needsFertilizer).toBe(true);
        expect(f.needsLime).toBe(false);
        expect(actions(f)).not.toContain("Apply lime");
    });

    test("N 10% tolerance is unchanged", () => {
        expect(collect({ pf: { n: 154, nTarget: 170 } }).field.needsFertilizer).toBe(false);
        expect(collect({ pf: { n: 152, nTarget: 170 } }).field.needsFertilizer).toBe(true);
        const f = collect({ pf: { n: 152, nTarget: 170 } }).field;
        expect(rules.pfNitrogenWithinTolerance(f)).toBe(false);
    });

    test("lime disabled in the career turns lime off even when pH is below the band", () => {
        const f = collect({ career: { limeRequired: false } }).field;
        expect(f.phValue).toBeCloseTo(6.31, 10);
        expect(f.needsLime).toBe(false);
        expect(actions(f)).not.toContain("Apply lime");
    });

    test("arable crops past stage 3 do not get lime; early arable and grass still do", () => {
        const late = collect({ crop: { fruitTypeIndex: 2, growthState: 5 } }).field;
        expect(late.needsLime).toBe(false);
        expect(actions(late)).not.toContain("Apply lime");

        const early = collect({ crop: { fruitTypeIndex: 2, growthState: 2 } }).field;
        expect(early.needsLime).toBe(true);
        const lime = early.suggestions.find((s) => s.action === "Apply lime");
        expect(lime.priority).toBe(202);

        const grass = collect({ crop: { fruitTypeIndex: 4, growthState: 4 } }).field;
        expect(grass.fruitType).toBe("GRASS");
        expect(grass.needsLime).toBe(true);
    });

    test("vanilla (no PF) lime still follows the ground lime level", () => {
        const needs = collect({ vanilla: true, crop: { limeLevel: 0.5 } }).field;
        expect(needs.isPrecisionFarming).toBe(false);
        expect(needs.needsLime).toBe(true);
        expect(needs.limeText).toBe("Needed");
        const done = collect({ vanilla: true, crop: { limeLevel: 1 } }).field;
        expect(done.needsLime).toBe(false);
        expect(done.limeText).toBe("Done");
    });
});

describe("117 suggestion text encoding", () => {
    test("serialized growing-crop suggestion reasons carry no double-encoded sequences", () => {
        const early = collect({ pf: { n: 60, nTarget: 170 }, crop: { fruitTypeIndex: 2, growthState: 1, rollerLevel: 1, weedState: 0.5 } }).field;
        const late = collect({ pf: { n: 60, nTarget: 170 }, crop: { fruitTypeIndex: 2, growthState: 4, weedState: 0.5 } }).field;
        const reasons = [...early.suggestions, ...late.suggestions];
        const picked = ["Roll field", "Weed with weeder or hoe", "Apply fertiliser (solid or liquid)", "Apply herbicide"]
            .map((action) => reasons.find((s) => s.action === action));
        for (const s of picked) {
            expect(s).toBeDefined();
            expect(s.reason).not.toMatch(MOJIBAKE);
            expect(s.reason).toMatch(/ - /);
        }
        for (const s of reasons) expect(s.reason).not.toMatch(MOJIBAKE);
    });

    test("legitimate UTF-8 still round-trips through the production serializer", () => {
        const text = "Champ \u2014 \u00e9t\u00e9 \u2192 \u2713";
        const json = serializeWithProductionToJson(longString(text));
        expect(JSON.parse(json)).toBe(text);
    });

    test("remaining double-encoded bytes in the collector are on comment lines only", () => {
        const lines = fs.readFileSync(path.join(modSrc, "collectors/FieldDataCollector.lua"), "utf8").split("\n");
        const codeHits = lines.filter((line) => !line.trim().startsWith("--") && MOJIBAKE.test(line));
        expect(codeHits).toEqual([]);
    });
});
