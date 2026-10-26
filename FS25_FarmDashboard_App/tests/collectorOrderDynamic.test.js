const fs = require('fs');
const path = require('path');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

const source = fs.readFileSync(path.resolve(__dirname,
    '../../FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua'), 'utf8');

test('collector order still responds to late mod activation and user flag changes', () => {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const script = [
        'Logging = { info = function() end }',
        'FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end }',
        source,
        `local C = FarmDashboardDataCollector
        local soilLoaded, companionLoaded, saves = false, false, 0
        C.config = { enableWeather = true }
        C.saveConfig = function() saves = saves + 1 end
        C.isAdvancedDamageSystemLoaded = function() return false end
        C.isVehicleYearsLoaded = function() return false end
        C.isVehicleMileageLoaded = function() return false end
        C.isPrecisionFarmingLoaded = function() return false end
        C.isMoistureSystemLoaded = function() return false end
        C.isRealisticLivestockLoaded = function() return false end
        RfSoilFertilizerDataCollector = { isModLoaded = function() return soilLoaded end }
        CompanionPagesDataCollector = { isModLoaded = function() return companionLoaded end }
        local function order() return table.concat(C:getEnabledCollectorOrder(), ',') end
        local first = order()
        soilLoaded = true
        local second = order()
        companionLoaded = true
        C.config.enableWeather = false
        local third = order()
        return first .. '|' .. second .. '|' .. third .. '|' .. tostring(saves)`,
    ].join('\n');
    const status = lauxlib.luaL_dostring(L, to_luastring(script));
    if (status !== lua.LUA_OK) {
        const error = lua.lua_tostring(L, -1);
        throw new Error(error ? to_jsstring(error) : `Lua status ${status}`);
    }
    expect(to_jsstring(lua.lua_tostring(L, -1))).toBe(
        'weather|fields,weather,rfSoilFertilizer|fields,companionMods,companionPages,rfSoilFertilizer|0',
    );
});

test('mod discovery is paced by game time while direct flag changes are immediate', () => {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const script = [
        'Logging = { info = function() end }',
        'FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end }',
        source,
        `local C = FarmDashboardDataCollector
        local probes, soilLoaded = 0, false
        C.config = { enableWeather = true }
        C.isAdvancedDamageSystemLoaded = function() return false end
        C.isVehicleYearsLoaded = function() return false end
        C.isVehicleMileageLoaded = function() return false end
        C.isPrecisionFarmingLoaded = function() return false end
        C.isMoistureSystemLoaded = function() return false end
        C.isRealisticLivestockLoaded = function() return false end
        RfSoilFertilizerDataCollector = { isModLoaded = function()
            probes = probes + 1
            return soilLoaded
        end }
        g_time = 0
        C:getEnabledCollectorOrder()
        soilLoaded = true
        g_time = 250
        local early = table.concat(C:getEnabledCollectorOrder(), ',')
        C.config.enableWeather = false
        local direct = table.concat(C:getEnabledCollectorOrder(), ',')
        g_time = 1000
        local late = table.concat(C:getEnabledCollectorOrder(), ',')
        g_time = 100
        C._lastModLinkedCheckGTime = 1000
        local restarted = table.concat(C:getEnabledCollectorOrder(), ',')
        return tostring(probes) .. '|' .. early .. '|' .. direct .. '|' .. late .. '|' .. restarted`,
    ].join('\n');
    const status = lauxlib.luaL_dostring(L, to_luastring(script));
    if (status !== lua.LUA_OK) {
        const error = lua.lua_tostring(L, -1);
        throw new Error(error ? to_jsstring(error) : `Lua status ${status}`);
    }
    expect(to_jsstring(lua.lua_tostring(L, -1))).toBe(
        '3|weather||fields,rfSoilFertilizer|fields,rfSoilFertilizer',
    );
});
