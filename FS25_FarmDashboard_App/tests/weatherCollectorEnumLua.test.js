"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(path.resolve(__dirname,
    "../../FS25_FarmDashboard_Mod/src/collectors/WeatherDataCollector.lua"), "utf8");

function run(body) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const setup = `WeatherType = { SUN=1, PARTIALLY_CLOUDY=2, CLOUDY=3, RAIN=4,
        SNOW=5, HAIL=6, TWISTER=7, THUNDER=8 }`;
    if (lauxlib.luaL_dostring(L, to_luastring([source, setup, body].join("\n"))) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    return to_jsstring(lua.lua_tostring(L, -1));
}

describe("FS25 weather collector enum", () => {
    test("uses the game's one-based WeatherType constants", () => {
        expect(run(`local names = {}
            for i = 1, 8 do names[i] = WeatherDataCollector:getWeatherTypeName(i) end
            return table.concat(names, ',')`))
            .toBe("sun,cloudy,cloudy,rain,snow,hail,unknown,rain");
    });

    test("prefers the engine current-weather getter over a stale property", () => {
        expect(run(`g_currentMission = { environment = { weather = {
            currentWeatherType = WeatherType.SNOW,
            getCurrentWeatherType = function() return WeatherType.CLOUDY end,
        } } }
        return WeatherDataCollector:collect().currentWeather`)).toBe("cloudy");
    });

    test("maps the dedicated-server numeric type without an exported enum table", () => {
        expect(run(`WeatherType = nil
            g_currentMission = { environment = { weather = {
                getCurrentWeatherType = function() return 3 end,
            } } }
            return WeatherDataCollector:collect().currentWeather`)).toBe("cloudy");
    });

    test("keeps an unavailable weather type unknown instead of guessing sun", () => {
        expect(run(`WeatherType = nil
            g_currentMission = { environment = { weather = {} } }
            return WeatherDataCollector:collect().currentWeather`)).toBe("unknown");
    });
});
