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

function comboDisplay(flags) {
    const display = { mods: [] };
    if (flags.british) {
        display.british = true;
        display.mods.push({ id: "FS25_BritishFillUnits", style: "british" });
    } else {
        display.british = false;
    }
    if (flags.imperial === "gallons") {
        display.imperial = {
            present: true,
            settingsAvailable: true,
            ownsFillUnits: true,
            liquid: "gallons",
            crops: "liters",
            weight: "metric",
        };
        display.mods.push({ id: "FS25_ImperialSystem", style: "imperial" });
    } else if (flags.imperial === "metric") {
        display.imperial = {
            present: true,
            settingsAvailable: true,
            ownsFillUnits: true,
            liquid: "liters",
            crops: "liters",
            weight: "metric",
        };
        display.mods.push({ id: "FS25_ImperialSystem", style: "imperial" });
    } else if (flags.imperial === "unread") {
        display.imperial = { present: true, settingsAvailable: false, ownsFillUnits: false };
        display.mods.push({ id: "FS25_ImperialSystem", style: "imperial" });
    } else {
        display.imperial = null;
    }
    display.unitConverter = flags.converter
        ? { present: true, settingsAvailable: false, ownsFillUnits: false }
        : null;
    display.saveUnitProfiles = flags.profiles
        ? {
            present: true,
            settingsAvailable: true,
            ownsFillUnits: false,
            profileName: "UK",
            money: 3,
            miles: true,
            fahrenheit: false,
            acre: true,
            use24HourTime: true,
        }
        : null;
    return display;
}

/** An explicit Settings choice wins; Automatic (null) follows British, then readable Imperial, else litres. */
function expectedMode(flags, viewer) {
    if (viewer) return viewer;
    if (flags.british) return "british";
    if (flags.imperial === "gallons") return "imperial";
    return "litres";
}

describe("UNITS-013 provider ownership", () => {
    test("no loaded provider leaves the viewer choice in force", () => {
        expect(units.effectiveFillUnitMode({ british: false, imperial: null, mods: [] }, "british")).toBe("british");
        expect(units.effectiveFillUnitMode({ british: false, imperial: null, unitConverter: { present: true, settingsAvailable: false } }, "imperial")).toBe("imperial");
        expect(runLua(`
            local out = FillTypeUtils.unitDisplayForJson()
            if out.british ~= nil then return "british" end
            if out.imperial ~= nil then return "imperial" end
            if out.saveUnitProfiles ~= nil then return "profiles" end
            return "none"
        `)).toBe("none");
    });

    test("sixteen presence combinations keep fill ownership on British, then readable Imperial", () => {
        const switches = [false, true];
        for (const british of switches) {
            for (const imperial of [null, "gallons", "metric", "unread"]) {
                for (const converter of switches) {
                    for (const profiles of switches) {
                        if (imperial !== "gallons" && imperial !== null) continue;
                        const flags = { british, imperial, converter, profiles };
                        for (const viewer of [null, "imperial", "litres"]) {
                            const mode = units.effectiveFillUnitMode(comboDisplay(flags), viewer);
                            expect(mode).toBe(expectedMode(flags, viewer));
                        }
                    }
                }
            }
        }
        expect(units.effectiveFillUnitMode(comboDisplay({
            british: false,
            imperial: "metric",
            converter: true,
            profiles: true,
        }), null)).toBe("litres");
        expect(units.effectiveFillUnitMode(comboDisplay({
            british: false,
            imperial: "metric",
            converter: true,
            profiles: true,
        }), "imperial")).toBe("imperial");
        expect(units.effectiveFillUnitMode(comboDisplay({
            british: false,
            imperial: "unread",
            converter: false,
            profiles: true,
        }), "british")).toBe("british");
    });

    test("British, Imperial, Save Unit Profiles and Unit Converter are read from their own environments", () => {
        expect(runLua(`
            _G.g_modIsLoaded = { FS25_BritishFillUnits = true }
            _G.FS25_BritishFillUnits = { BFU = { Core = { VERSION = "1.3.0.0" } } }
            local out = FillTypeUtils.unitDisplayForJson()
            return tostring(out.british) .. "|" .. tostring(out.britishFillUnits and out.britishFillUnits.version) .. "|" .. tostring(out.britishFillUnits.ownsFillUnits)
        `)).toBe("true|1.3.0.0|true");
        expect(runLua(`
            _G.g_modIsLoaded = { FS25_ImperialSystem = true }
            _G.FS25_ImperialSystem = { UnitConversionMod = { settings = { liquidUnit = 1, cropsUnit = 0, weightUnit = 0, weightScale = 0 } } }
            local out = FillTypeUtils.unitDisplayForJson()
            return out.imperial.liquid .. "|" .. tostring(out.imperial.settingsAvailable)
        `)).toBe("gallons|true");
        expect(runLua(`
            _G.g_modIsLoaded = { FS25_ImperialSystem = true }
            local out = FillTypeUtils.unitDisplayForJson()
            return tostring(out.imperial.settingsAvailable) .. "|" .. tostring(out.imperial.liquid) .. "|" .. tostring(out.imperial.ownsFillUnits)
        `)).toBe("false|nil|false");
        expect(runLua(`
            _G.g_modIsLoaded = { FS25_SaveUnitProfiles = true }
            _G.FS25_SaveUnitProfiles = {
                SaveUnitProfiles = {
                    activeProfileName = "UK",
                    config = { profiles = { UK = { money = 3, miles = true, fahrenheit = false, acre = true, use24HourTime = true } } },
                },
            }
            local out = FillTypeUtils.unitDisplayForJson()
            local p = out.saveUnitProfiles
            return p.profileName .. "|" .. tostring(p.money) .. "|" .. tostring(p.miles) .. "|" .. tostring(p.ownsFillUnits) .. "|" .. tostring(out.british)
        `)).toBe("UK|3|true|false|nil");
        expect(runLua(`
            _G.g_modIsLoaded = { FS25_UnitConverter = true }
            _G.UnitConverter = { liquidUnit = 1, settings = { fluidUnit = "gallons" } }
            local out = FillTypeUtils.unitDisplayForJson()
            return tostring(out.unitConverter.settingsAvailable) .. "|" .. tostring(out.unitConverter.ownsFillUnits) .. "|" .. tostring(out.unitConverter.settings)
        `)).toBe("false|false|nil");
        expect(runLua(`
            _G.g_modManager = { mods = { { modName = "FS25_SaveUnitProfiles" } }, getActiveMods = function() return {} end }
            _G.FS25_SaveUnitProfiles = { SaveUnitProfiles = { activeProfileName = "US", config = { profiles = { US = { money = 2, miles = true, fahrenheit = true, acre = true, use24HourTime = false } } } } }
            local out = FillTypeUtils.unitDisplayForJson()
            return tostring(out.saveUnitProfiles)
        `)).toBe("nil");
    });

    test("manual imperial quantities name US units and keep unknown commodities in litres", () => {
        expect(units.formatFillQuantity(3785.41, "DIESEL", "imperial", null, null)).toMatch(/US gal$/);
        expect(units.formatFillQuantity(35239.1, "WHEAT", "imperial", null, null)).toMatch(/US bu$/);
        expect(units.formatFillQuantity(1000, "UNKNOWN_MOD_FILL", "imperial", null, null)).toMatch(/L$/);
        const priced = units.fillPriceAmount(1000, "DIESEL", "imperial", null, null);
        expect(priced.unit).toBe("/ US gal");
        expect(units.formatFillQuantity(3785.41, "DIESEL", "imperial", null, {
            imperial: { present: true, settingsAvailable: true, ownsFillUnits: true, liquid: "liters", crops: "liters", weight: "metric" },
        })).toMatch(/L$/);
    });
});
