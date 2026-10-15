"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { productionTs } = require("./helpers/production-source.cjs");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");

function runLua(chunk) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const source = [
        "Logging = { info = function() end }",
        "FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end }",
        fs.readFileSync(path.join(modSrc, "FillTypeUtils.lua"), "utf8"),
        chunk,
    ].join("\n");
    const status = lauxlib.luaL_dostring(L, to_luastring(source));
    if (status !== lua.LUA_OK) {
        const err = lua.lua_tostring(L, -1);
        throw new Error(err ? to_jsstring(err) : `lua error status ${status}`);
    }
    if (lua.lua_isnil(L, -1)) return null;
    const asString = lua.lua_tostring(L, -1);
    return asString ? to_jsstring(asString) : null;
}

const units = productionTs("NEW APP/src/lib/fill-units.ts");
const profile = productionTs("NEW APP/src/lib/profile-display.ts", {
    "@/i18n/i18n": { t: (key) => key },
});

const ukProfile = `
    _G.g_modIsLoaded = { FS25_SaveUnitProfiles = true, FS25_BritishFillUnits = true }
    _G.FS25_BritishFillUnits = { BFU = { Core = { VERSION = "1.3.0.0" } } }
    _G.FS25_SaveUnitProfiles = {
        SaveUnitProfiles = {
            activeProfileName = "UK",
            lastApplyOk = false,
            hasApplied = true,
            config = { profiles = { UK = { money = 3, miles = true, fahrenheit = false, acre = true, use24HourTime = true } } },
        },
    }
`;

describe("UNITS-014 provider isolation and profile display", () => {
    test("a throwing Imperial XML read keeps British and still closes the file", () => {
        expect(runLua(`
            local closed = false
            XMLFile = { loadIfExists = function()
                return {
                    getInt = function() error("getInt failed") end,
                    delete = function() closed = true end,
                }
            end }
            _G.g_modIsLoaded = { FS25_BritishFillUnits = true, FS25_ImperialSystem = true }
            _G.FS25_BritishFillUnits = { BFU = { Core = { VERSION = "1.3.0.0" } } }
            local ok, result = pcall(FillTypeUtils.unitDisplayForJson)
            if not ok then return "throw" end
            return tostring(result.british) .. "|" .. tostring(closed) .. "|" .. tostring(result.imperial.settingsAvailable) .. "|" .. tostring(result.britishFillUnits.version)
        `)).toBe("true|true|false|1.3.0.0");
    });

    test("a throwing XML close and a throwing open do not discard British", () => {
        expect(runLua(`
            XMLFile = { loadIfExists = function()
                return { getInt = function() return 1 end, delete = function() error("delete failed") end }
            end }
            _G.g_modIsLoaded = { FS25_BritishFillUnits = true, FS25_ImperialSystem = true }
            _G.FS25_BritishFillUnits = { BFU = { Core = { VERSION = "1.3.0.0" } } }
            local ok, result = pcall(FillTypeUtils.unitDisplayForJson)
            if not ok then return "throw" end
            return tostring(result.british) .. "|" .. tostring(result.imperial and result.imperial.liquid)
        `)).toBe("true|gallons");
        expect(runLua(`
            XMLFile = { loadIfExists = function() error("open failed") end }
            _G.g_modIsLoaded = { FS25_BritishFillUnits = true, FS25_ImperialSystem = true }
            _G.FS25_BritishFillUnits = { BFU = { Core = { VERSION = "1.3.0.0" } } }
            local ok, result = pcall(FillTypeUtils.unitDisplayForJson)
            if not ok then return "throw" end
            return tostring(result.british) .. "|" .. tostring(result.imperial.settingsAvailable)
        `)).toBe("true|false");
    });

    test("invalid imperial enums do not own the viewer choice and a bad density stays in litres", () => {
        expect(units.effectiveFillUnitMode({
            imperial: { present: true, settingsAvailable: true, ownsFillUnits: true, liquid: "bogus" },
        }, "british")).toBe("british");
        expect(units.formatFillQuantity(1000, "MOD_FILL", "british", {
            MOD_FILL: { kg: Number.POSITIVE_INFINITY, liquid: false },
        }, null)).toMatch(/L$/);
        expect(units.fillPriceAmount(1000, "MOD_FILL", "british", {
            MOD_FILL: { kg: Number.POSITIVE_INFINITY, liquid: false },
        }, null).unit).toBe("/ 1,000 L");
    });

    test("a configured profile is not shown until the live settings match", () => {
        expect(runLua(`
            ${ukProfile}
            local out = FillTypeUtils.unitDisplayForJson()
            return out.saveUnitProfiles.applyState .. "|" .. tostring(out.saveUnitProfiles.money) .. "|" .. tostring(out.british)
        `)).toBe("pending|3|true");
        const pending = {
            money: 3,
            applyState: "pending",
            effective: undefined,
        };
        expect(profile.formatProfileMoney(1500, pending)).toBe("1,500");
        expect(runLua(`
            ${ukProfile}
            _G.g_gameSettings = {
                getValue = function(_, key)
                    if key == "moneyUnit" then return 3 end
                    if key == "useMiles" then return true end
                    if key == "useFahrenheit" then return false end
                    if key == "useAcre" then return true end
                    return nil
                end,
                use24HourTime = true,
            }
            local out = FillTypeUtils.unitDisplayForJson()
            return out.saveUnitProfiles.applyState .. "|" .. tostring(out.saveUnitProfiles.effective.money) .. "|" .. tostring(out.saveUnitProfiles.effective.fahrenheit)
        `)).toBe("effective|3|false");
    });

    test("live profile dimensions format money, area, temperature, speed and clock without converting the amount", () => {
        const live = { applyState: "effective", effective: { money: 3, miles: true, fahrenheit: false, acre: true, use24HourTime: false } };
        expect(profile.formatProfileMoney(1500, live)).toMatch(/^£/);
        expect(profile.formatProfileMoney(1500, { effective: { money: 16 } })).toMatch(/грн$/);
        expect(profile.formatProfileMoney(1500, { effective: { money: 99 } })).toMatch(/profile\.unitUnavailable$/);
        expect(profile.formatProfileArea(1, live)).toMatch(/ ac$/);
        expect(profile.formatProfileArea(1, { effective: { acre: false } })).toMatch(/ ha$/);
        expect(profile.formatProfileTemperature(0, { effective: { fahrenheit: true } })).toBe("32°F");
        expect(profile.formatProfileTemperature(0, { effective: { fahrenheit: false } })).toBe("0°C");
        expect(profile.formatProfileSpeed(100, live)).toMatch(/ mph$/);
        expect(profile.formatProfileClock(13 * 60, live)).toBe("1:00 PM");
        expect(profile.formatProfileClock(13 * 60, { effective: { use24HourTime: true } })).toBe("13:00");
    });
});
