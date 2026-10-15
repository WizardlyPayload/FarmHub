"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { mergeFields } = require("../dataMerger");
const { modConfigRevision } = require("../modConfigXml");

const registry = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/MissionActiveRegistry.lua"),
    "utf8",
);
const collector = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua"),
    "utf8",
);
const fieldSource = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua"),
    "utf8",
);
const holdSlice = fieldSource.slice(
    fieldSource.indexOf("local soilSampleHold = {}"),
    fieldSource.indexOf("function FieldDataCollector.clearSoilSampleHold()"),
);

function luaResult(chunk) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    return to_jsstring(lua.lua_tostring(L, -1));
}

function ordinaryMod(engineBody, expression) {
    return luaResult(`
        local base = _G
        local engine = {}
        setmetatable(engine, { __index = base })
        ${engineBody}
        local dashboard = {}
        setmetatable(dashboard, { __index = engine })
        dashboard._G = dashboard
        _ENV = dashboard
        ${registry}
        ${collector}
        ${expression}
    `);
}

// collectRestrictedPeriods reports "ok" only for a whole in-game period 1..12.
const activeReaders = `
    engine.g_currentMission = { missionInfo = { savegameDirectory = 'savegame1', mapId = 'map' }, environment = { currentPeriod = 4 } }
    engine.g_modManager = { getActiveMods = function()
        return {
            { modName = 'FS25_EnhancedLoanSystem' },
            { modName = 'FS25_RestrictedPeriods' },
        }
    end }
    engine.FS25_EnhancedLoanSystem = { g_els_loanManager = { loans = {
        ['1'] = { { restAmount = 10, paidOff = false } },
    } } }
    engine.FS25_RestrictedPeriods = { SlurryBan = { isBanActive = function() return false end } }
`;

const readPair = "tostring(select(2, CompanionModsDataCollector:collectStep({})).loans.readState) .. '|' .. tostring(select(2, CompanionModsDataCollector:collectStep({})).restrictedPeriods.readState)";

describe("ordinary mod sandbox and production settings boundary", () => {
    test("active companions are reached through the inherited engine environment", () => {
        expect(ordinaryMod(activeReaders, "return " + readPair)).toBe("ok|ok");
    });

    test("an inherited companion without a current period stays unavailable", () => {
        const result = ordinaryMod(`
            ${activeReaders}
            engine.g_currentMission = { missionInfo = { savegameDirectory = 'savegame1', mapId = 'map' } }
        `, "local row = select(2, CompanionModsDataCollector:collectStep({})).restrictedPeriods\n"
            + "return " + readPair + " .. '|' .. tostring(row.reason) .. '|' .. tostring(row.anyActive)");
        expect(result).toBe("ok|unavailable|period-unavailable|nil");
    });

    test("a flattened companion symbol on the dashboard is not the companion", () => {
        const result = ordinaryMod(`
            ${activeReaders}
            engine.FS25_RestrictedPeriods = { SlurryBan = { isBanActive = function() error('engine down') end } }
        `, `
            dashboard.FS25_RestrictedPeriods = { SlurryBan = { isBanActive = function() return false end } }
            return ${readPair}
        `);
        expect(result).toBe("ok|failed");
    });

    test("flat globals are only a labelled control", () => {
        const flat = luaResult(`
            ${registry}
            ${collector}
            _G.g_currentMission = { missionInfo = { savegameDirectory = 'savegame1', mapId = 'map' }, environment = { currentPeriod = 4 } }
            _G.g_modManager = { getActiveMods = function()
                return {
                    { modName = 'FS25_EnhancedLoanSystem' },
                    { modName = 'FS25_RestrictedPeriods' },
                }
            end }
            _G.FS25_EnhancedLoanSystem = { g_els_loanManager = { loans = {
                ['1'] = { { restAmount = 10, paidOff = false } },
            } } }
            _G.FS25_RestrictedPeriods = { SlurryBan = { isBanActive = function() return false end } }
            return ${readPair}
        `);
        expect(flat).toBe("ok|ok");
    });

    test("field and fleet stamps use inherited mission g_time, not the day clock", () => {
        const stamped = luaResult(`
            local base = _G
            local engine = {}
            setmetatable(engine, { __index = base })
            engine.g_time = 9000
            engine.g_currentMission = { environment = { currentDay = 2, dayTime = 36000000 }, missionInfo = { savegameDirectory = 'savegame1', mapId = 'map' } }
            local dashboard = {}
            setmetatable(dashboard, { __index = engine })
            dashboard._G = dashboard
            _ENV = dashboard
            FieldDataCollector = {}
            ${holdSlice}
            local soil = FieldDataCollector.holdSoilSample(7, '40|6.5|true')
            local vData = {}
            local measuredAt = _G.g_time
            if type(measuredAt) == 'number' then vData.measuredAt = measuredAt end
            return tostring(soil) .. '|' .. tostring(vData.measuredAt)
        `);
        expect(stamped).toBe("9000|9000");
    });

    test("the same field id in a new save gets the new sample time", () => {
        const switched = luaResult(`
            FieldDataCollector = {}
            ${holdSlice}
            _G.g_time = 1000
            _G.g_currentMission = { missionInfo = { savegameDirectory = 'save1' } }
            local first = FieldDataCollector.holdSoilSample(7, '40|6.5|true')
            _G.g_time = 9000
            _G.g_currentMission = { missionInfo = { savegameDirectory = 'save2' } }
            local second = FieldDataCollector.holdSoilSample(7, '40|6.5|true')
            return tostring(first) .. '|' .. tostring(second)
        `);
        expect(switched).toBe("1000|9000");
    });

    test("an explicit live unscanned result is not replaced by stale xml, and failed state survives", () => {
        const rows = mergeFields(
            [{ id: 1, farmlandId: 1, isScanned: true, nitrogenLevel: 0 }],
            [{
                id: 1,
                farmlandId: 1,
                isScanned: false,
                soilReadState: "failed",
                nitrogenLevel: 100,
                soilSampledAt: 1000,
            }],
        );
        expect(rows[0].isScanned).toBe(false);
        expect(rows[0].soilReadState).toBe("failed");
        expect(rows[0].nitrogenLevel).toBe(100);
    });

    test("the registered settings callbacks keep omitted mod-owned values and refuse a truncated file", async () => {
        const main = fs.readFileSync(path.resolve(__dirname, "../main.js"), "utf8");
        const registration = main.slice(main.indexOf("function registerTrustedHandle"), main.indexOf("function registerTrustedEvent"));
        const handlers = main.slice(main.indexOf("registerTrustedHandle('get-mod-config'"), main.indexOf("function profileRootForDashboard"));
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-ipc-"));
        const filePath = path.join(dir, "config.xml");
        const existing = "<farmDashboard><settings updateInterval=\"10000\" collectionCycleMs=\"60000\" minWriteIntervalMs=\"15000\" baleScanIntervalCycles=\"7\" diagnostics=\"true\"/><modules fields=\"false\" stock=\"false\"/></farmDashboard>";
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
        expect(loaded.modules.fields).toBe(false);
        expect(loaded.minWriteIntervalMs).toBe(15000);
        const saved = await context.ipcMain["save-mod-config"]({}, {
            updateInterval: 12000,
            collectionCycleMs: 60000,
            modules: loaded.modules,
            expectedRevision: loaded.revision,
        });
        expect(saved.ok).toBe(true);
        const written = fs.readFileSync(filePath, "utf8");
        expect(written).toContain('minWriteIntervalMs="15000"');
        expect(written).toContain('baleScanIntervalCycles="7"');
        expect(written).toContain('diagnostics="true"');
        expect(written).toContain('fields="false"');
        const truncated = "<farmDashboard><settings updateInterval=\"10000\"/><modules fields=\"false\"/>";
        fs.writeFileSync(filePath, truncated);
        const broken = await context.ipcMain["get-mod-config"]({});
        expect(broken.presence).toBe("malformed");
        const refused = await context.ipcMain["save-mod-config"]({}, {
            updateInterval: 12000,
            modules: { fields: true },
            expectedRevision: modConfigRevision(truncated),
        });
        expect(refused.ok).toBe(false);
        expect(fs.readFileSync(filePath, "utf8")).toBe(truncated);
        const quoted = "<farmDashboard><settings updateInterval='10000'/><modules fields='false'/></farmDashboard>";
        fs.writeFileSync(filePath, quoted);
        const quotedLoad = await context.ipcMain["get-mod-config"]({});
        expect(quotedLoad.modules.fields).toBe(false);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
