"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(path.resolve(
    __dirname,
    "../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua",
), "utf8");

test("livestock display and two vehicle-service readers keep only the active farm's data", () => {
    const setup = `
        getfenv=function() return _G end
        g_currentMission={getFarmId=function() return 1 end, vehicleSystem={vehicles={
            {id=10, ownerFarmId=1, getName=function() return 'Owned' end,
                spec_extendedVehicleMaintenance={_runtimeCreated=true, hoursPool=13,
                    isServiceActive=true, serviceRemainingGameMs=4000,
                    failureType='engine', failureSeverity=2},
                spec_realisticVehiclesBreakdown={state={rvCondition=75,
                    serviceSoon=true, warmupCountdownMs=500, hasKeyInserted=true,
                    immobilizerArmed=false, activeFaults={engine=true}}}},
            {id=20, ownerFarmId=2, getName=function() return 'Other farm' end,
                spec_extendedVehicleMaintenance={_runtimeCreated=true, hoursPool=99},
                spec_realisticVehiclesBreakdown={state={rvCondition=1}}}
        }}}
        g_modIsLoaded={FS25_LivestockMonitor=true,
            FS25_ExtendedVehicleMaintenance=true, FS25_RealisticVehicleService=true}
        _G.FS25_LivestockMonitor={
            LivestockMonitorSettings={displayMode='alerts', hudRefreshSec=10},
            LivestockMonitorAlerts={queue={'one','two'}, current='one'}}
        _G.FS25_ExtendedVehicleMaintenance={ExtendedVehicleMaintenance={}}
        _G.FS25_RealisticVehicleService={RealisticVehiclesFaultSystem={}}
    `;
    const expression = `
        local o=CompanionModsDataCollector:collect()
        return table.concat({
            o.livestockMonitor.readState, o.livestockMonitor.displayMode,
            tostring(o.livestockMonitor.queuedAlerts),
            o.extendedVehicleMaintenance.readState,
            tostring(#o.extendedVehicleMaintenance.machines),
            tostring(o.extendedVehicleMaintenance.machines[1].hoursPool),
            o.realisticVehicleService.readState,
            tostring(#o.realisticVehicleService.machines),
            tostring(o.realisticVehicleService.machines[1].condition),
        }, '|')
    `;
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring([source, setup, expression].join("\n"))) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    expect(to_jsstring(lua.lua_tostring(L, -1)))
        .toBe("ok|alerts|2|ok|1|13|ok|1|75");
});
