"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { productionTs } = require("./helpers/production-source.cjs");
const {
    classifyModConfigText,
    commitModConfig,
    modConfigRevision,
} = require("../modConfigXml");
const {
    updateLiveSectionBackup,
    updateLastGoodMergedSnapshot,
    buildHeldPayloadFromState,
} = require("../mergedSnapshotHold");
const { mergeFields } = require("../dataMerger");

const fieldSource = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua"),
    "utf8",
);
const holdSlice = fieldSource.slice(
    fieldSource.indexOf("local soilSampleHold = {}"),
    fieldSource.indexOf("--- Serialized as JSON"),
);
const soilBlock = fieldSource.slice(
    fieldSource.indexOf('if not isScanned then\n            fData.soilReadState = "unscanned"'),
    fieldSource.indexOf("-- 4. STATUS FLAGS AND SUGGESTIONS"),
);
const unitFn = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/FillTypeUtils.lua"),
    "utf8",
).slice(
    fs.readFileSync(path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/FillTypeUtils.lua"), "utf8").indexOf("function FillTypeUtils.unitDisplayForJson"),
    fs.readFileSync(path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/FillTypeUtils.lua"), "utf8").indexOf("function FillTypeUtils.enrichCatalogFromData"),
);

function luaResult(chunk) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    return to_jsstring(lua.lua_tostring(L, -1));
}

function classify(xml) {
    return classifyModConfigText(true, xml).presence;
}

describe("continuation stage A-D source gates", () => {
    test("comments and escaped attributes stay editable, and nested settings are not the managed node", () => {
        const comment = '<farmDashboard><!-- keep my notes --><settings updateInterval="10000"/><modules fields="false"/></farmDashboard>';
        const escaped = '<farmDashboard><settings updateInterval="10000" note="A &amp; B"/><modules fields="false"/></farmDashboard>';
        const nested = '<farmDashboard><extension><settings updateInterval="7777"/></extension><settings updateInterval="10000"/><modules fields="false"/></farmDashboard>';
        expect(classify(comment)).toBe("ok");
        expect(classify(escaped)).toBe("ok");
        expect(classify(nested)).toBe("ok");
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-xml-"));
        const filePath = path.join(dir, "config.xml");
        fs.writeFileSync(filePath, nested);
        const saved = commitModConfig(filePath, {
            updateInterval: 12000,
            modules: { fields: false },
            expectedRevision: modConfigRevision(nested),
        });
        expect(saved.ok).toBe(true);
        const written = fs.readFileSync(filePath, "utf8");
        expect(written).toContain('updateInterval="7777"');
        expect(written).toContain('<settings updateInterval="12000"/>');
        expect(classifyModConfigText(true, written).updateInterval).toBe(12000);
        fs.writeFileSync(filePath, comment);
        const commented = commitModConfig(filePath, {
            updateInterval: 11000,
            modules: { fields: false },
            expectedRevision: modConfigRevision(comment),
        });
        expect(commented.ok).toBe(true);
        expect(fs.readFileSync(filePath, "utf8")).toContain("<!-- keep my notes -->");
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test("registered save changes the managed root value and saveMain still calls the domain writer", async () => {
        const main = fs.readFileSync(path.resolve(__dirname, "../main.js"), "utf8");
        const modal = fs.readFileSync(path.resolve(__dirname, "../../NEW APP/src/settings/SettingsModal.tsx"), "utf8");
        expect(modal).toMatch(/runSettingsSave\(/);
        const registration = main.slice(main.indexOf("function registerTrustedHandle"), main.indexOf("function registerTrustedEvent"));
        const handlers = main.slice(main.indexOf("registerTrustedHandle('get-mod-config'"), main.indexOf("function profileRootForDashboard"));
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-ipc6-"));
        const filePath = path.join(dir, "config.xml");
        const existing = '<farmDashboard><extension><settings updateInterval="7777"/></extension><settings updateInterval="10000" note="A &amp; B"/><modules fields="false"/></farmDashboard>';
        fs.writeFileSync(filePath, existing);
        const context = {
            ipcMain: { handle(channel, fn) { this[channel] = fn; } },
            isTrustedDashboardIpcSender: () => true,
            handleGetModConfig: require("../modConfigXml").handleGetModConfig,
            handleSaveModConfig: require("../modConfigXml").handleSaveModConfig,
            getModConfigPath: () => filePath,
            pathExists: async (target) => fs.existsSync(target),
            readFileUtf8WithRetryAsync: async (target) => fs.readFileSync(target, "utf8"),
            assertGameWritesAllowed: async () => ({ ok: true }),
        };
        vm.createContext(context);
        vm.runInContext(`${registration}\n${handlers}`, context);
        const loaded = await context.ipcMain["get-mod-config"]({});
        const saved = await context.ipcMain["save-mod-config"]({}, {
            updateInterval: 12000,
            collectionCycleMs: loaded.collectionCycleMs,
            modules: loaded.modules,
            expectedRevision: loaded.revision,
        });
        expect(saved.ok).toBe(true);
        const written = fs.readFileSync(filePath, "utf8");
        expect(written).toContain('updateInterval="7777"');
        expect(written).toContain('note="A &amp; B"');
        expect(classifyModConfigText(true, written).updateInterval).toBe(12000);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test("a successful pH read does not freshen held nitrogen", () => {
        const result = luaResult(`
            FieldDataCollector = {}
            ${holdSlice}
            _G.g_currentMission = { missionInfo = { savegameDirectory = 'save1' } }
            _G.g_time = 1000
            FieldDataCollector.holdSoilSample(7, 'n40|p6.5')
            _G.g_time = 9000
            local fData = { id = 7, nitrogenLevel = '__FD_JSON_NULL__', phValue = 6.5 }
            local isScanned = true
            local nitrogenRead = false
            local phRead = true
            ${soilBlock}
            return tostring(fData.soilReadState) .. '|' .. tostring(fData.soilSampledAt) .. '|' .. tostring(fData.nitrogenSampledAt) .. '|' .. tostring(fData.phSampledAt)
        `);
        expect(result).toBe("partial|nil|1000|9000");
        const inverse = luaResult(`
            FieldDataCollector = {}
            ${holdSlice}
            _G.g_currentMission = { missionInfo = { savegameDirectory = 'save1' } }
            _G.g_time = 1000
            FieldDataCollector.holdSoilSample(7, 'n40|p6.5')
            _G.g_time = 9000
            local fData = { id = 7, nitrogenLevel = 40, phValue = '__FD_JSON_NULL__' }
            local isScanned = true
            local nitrogenRead = true
            local phRead = false
            ${soilBlock}
            return tostring(fData.soilReadState) .. '|' .. tostring(fData.nitrogenSampledAt) .. '|' .. tostring(fData.phSampledAt)
        `);
        expect(inverse).toBe("partial|9000|1000");
    });

    test("complete empty and measured zero replace backups, and a held metric keeps its age", () => {
        const animals = [{ animalCount: 2 }];
        const state = {};
        updateLiveSectionBackup(state, {
            animals,
            fields: [{ id: 7, farmlandId: 7, hectares: 2, nitrogenSampledAt: 1000, phSampledAt: 1000 }],
        }, null);
        const emptyAnimals = [];
        emptyAnimals.readState = "ok";
        emptyAnimals.coverage = "complete";
        updateLiveSectionBackup(state, { animals: emptyAnimals, fields: [{ id: 7, farmlandId: 7, hectares: 2 }] }, null);
        expect(state.liveSectionBackup.animals).toBeNull();
        state.liveSectionBackup.fields = [{
            id: 7,
            farmlandId: 7,
            hectares: 2,
            nitrogenSampledAt: 1000,
            nitrogenLevel: 40,
            phSampledAt: 1000,
            phValue: 6.5,
        }];
        const rich = { vehicles: [{ id: "v" }], fields: [{ hectares: 2 }] };
        const zeroStock = {
            enabled: true,
            readState: "ok",
            coverage: "complete",
            byFarm: { "1": { items: [{ totalLiters: 0 }] } },
        };
        state.liveSectionBackup.stock = { byFarm: { "1": { items: [{ totalLiters: 50 }] } } };
        updateLastGoodMergedSnapshot(state, {
            animals: emptyAnimals,
            stock: zeroStock,
            fields: [{
                id: 7,
                farmlandId: 7,
                hectares: 2,
                nitrogenReadState: "held",
                phReadState: "ok",
                nitrogenLevel: null,
                nitrogenSampledAt: null,
                phSampledAt: 9000,
                phValue: 6.5,
            }],
            vehicles: [{ id: "v" }],
        }, rich);
        const saved = state.lastGoodMergedSnapshot;
        expect(saved.animals).toHaveLength(0);
        expect(saved.stock.byFarm["1"].items[0].totalLiters).toBe(0);
        const heldField = saved.fields.find((row) => row.farmlandId === 7);
        expect(heldField.nitrogenSampledAt).toBe(1000);
        expect(heldField.phSampledAt).toBe(9000);
        const offline = buildHeldPayloadFromState(state);
        expect(offline.animals).toHaveLength(0);
        const rows = mergeFields(
            [{ id: 7, farmlandId: 7, isScanned: true, nitrogenLevel: 1, phValue: 5 }],
            [{
                id: 7,
                farmlandId: 7,
                isScanned: true,
                soilReadState: "partial",
                nitrogenReadState: "held",
                phReadState: "ok",
                nitrogenSampledAt: 1000,
                phSampledAt: 9000,
                nitrogenLevel: 40,
                phValue: 6.5,
            }],
        );
        expect(rows[0].nitrogenSampledAt).toBe(1000);
        expect(rows[0].phSampledAt).toBe(9000);
    });

    test("inactive imperial leftover config stays on litres and an absent provider can use a manual mode", () => {
        const units = productionTs("NEW APP/src/lib/fill-units.ts");
        expect(units.effectiveFillUnitMode({
            british: false,
            imperial: { present: false, liquid: "gallons", crops: "imperial", weight: "imperial" },
        })).toBe("litres");
        expect(units.effectiveFillUnitMode({ british: true, imperial: { present: false, liquid: "liters" } })).toBe("british");
        expect(units.effectiveFillUnitMode({
            british: false,
            imperial: { present: true, liquid: "gallons", crops: "liters", weight: "metric" },
        })).toBe("imperial");
        expect(units.effectiveFillUnitMode(null, "imperial")).toBe("imperial");
        expect(units.formatLitres(0)).toContain("0");
        const inactive = luaResult(`
            FillTypeUtils = {}
            ${unitFn}
            _G.g_modManager = {
                mods = { { modName = 'FS25_ImperialSystem' } },
                getActiveMods = function() return {} end,
            }
            _G.UnitConversionMod = { settings = { liquidUnit = 1, cropsUnit = 1, weightUnit = 1 } }
            local display = FillTypeUtils.unitDisplayForJson()
            return tostring(display.imperial) .. '|' .. tostring(display.british)
        `);
        // Unloaded British is omitted. Exporting false was read as a present provider.
        expect(inactive).toBe("nil|nil");
    });
});
