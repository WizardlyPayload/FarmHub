"use strict";

/**
 * Stock sell prices from the production StockDataCollector + InventoryScan, under the FS25 mod
 * environment (extract/decompiled/scripts/mods.lua:300-322), serialised with the production JSON
 * number formatter and read by the production NEW APP storage consumer.
 *
 * Engine prices are money per litre: SellingStation:getEffectiveFillTypePrice returns
 * fillTypePrices[fillType] on clients (objects/SellingStation.lua, 1.20), and buyer ownership is
 * Object.ownerFarmId (network/Object.lua:122-132). Fixture prices are realistic per-litre values.
 */
const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");
const { productionTs } = require("./helpers/production-source.cjs");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");
const STOCK_FILES = ["FillTypeUtils.lua", "InventoryScan.lua", "collectors/StockDataCollector.lua"];

function productionFormatNumber() {
    const text = fs.readFileSync(path.join(modSrc, "FarmDashboardDataCollector.lua"), "utf8");
    const start = text.indexOf("local function _formatNumber(n)");
    const end = text.indexOf("\nend\n", start);
    if (start < 0 || end < 0) throw new Error("production _formatNumber not found");
    return text.slice(start, end + 5);
}

function longString(text) {
    let level = 0;
    while (text.includes("]" + "=".repeat(level) + "]")) level += 1;
    const eq = "=".repeat(level);
    return "[" + eq + "[\n" + text + "]" + eq + "]";
}

const prelude = `
unpack = unpack or table.unpack
Logging = { info = function() end, warning = function() end }
FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end, warn = function() end, info = function() end, isVerbose = function() return false end }
g_time = 1000
g_modIsLoaded = {}
FT = {
    [8] = { index = 8, name = "CHAFF", title = "Chaff" },
    [11] = { index = 11, name = "SILAGE", title = "Silage" },
}
g_fillTypeManager = {
    fillTypes = { FT[8], FT[11] },
    getFillTypes = function(self) return self.fillTypes end,
    getFillTypeByIndex = function(self, i) return FT[i] end,
    getFillTypeNameByIndex = function(self, i) return FT[i] and FT[i].name or nil end,
    getFillTypeIndexByName = function(self, n) for i, ft in pairs(FT) do if ft.name == n then return i end end end,
}
g_farmManager = { farms = { { farmId = 1, name = "Farm A" }, { farmId = 2, name = "Farm B" } } }
VIEWER = 1
g_currentMission = {
    getFarmId = function() return VIEWER end,
    missionInfo = { savegameDirectory = "savegame1", mapId = "MapUS" },
}
BunkerSilo = { STATE_FILL = 0, STATE_CLOSED = 1, STATE_FERMENTED = 2, STATE_DRAIN = 3 }
SellingStation = {}
function clamp(fid, liters)
    return { ownerFarmId = fid, getName = function() return "Clamp " .. fid end,
        spec_bunkerSilo = { bunkerSilo = { state = 1, fillLevel = liters, inputFillType = 8, outputFillType = 11 } } }
end
g_currentMission.placeableSystem = { placeables = { clamp(1, 1000), clamp(2, 2500) } }
-- Client path of SellingStation:getEffectiveFillTypePrice: money per litre from fillTypePrices.
function buyer(name, owner, price)
    return { ownerFarmId = owner, fillTypePrices = { [8] = price, [11] = price }, acceptedFillTypes = { [8] = true, [11] = true },
        isa = function(self, cls) return cls == SellingStation end,
        getName = function() return name end,
        getEffectiveFillTypePrice = function(self, ft) return self.fillTypePrices[ft] end }
end
MARKET = 0.3
g_currentMission.economyManager = { sellingStations = {}, getPricePerLiter = function(self, i) return MARKET end }
function stations(list) g_currentMission.economyManager.sellingStations = list end
`;

const helpers = `
function fmt(v) if type(v) == "number" then return _formatNumber(v) end return tostring(v) end
function item(res, fid) local b = res.byFarm[tostring(fid)] or res.byFarm[fid]; return b and b.items[1] end
function priceOf(fid) local it = item(StockDataCollector:collect(), fid); return fmt(it.bestSellPrice) .. "|" .. tostring(it.bestSellStation) end
function jsonItems(res, fid)
    local b = res.byFarm[tostring(fid)] or res.byFarm[fid]
    local parts = {}
    for _, it in ipairs(b.items) do
        local fields = { '"fillTypeIndex":' .. fmt(it.fillTypeIndex), '"fillType":"' .. tostring(it.fillType) .. '"', '"totalLiters":' .. fmt(it.totalLiters) }
        if it.bestSellPrice ~= nil then fields[#fields + 1] = '"bestSellPrice":' .. fmt(it.bestSellPrice) end
        if it.bestSellStation ~= nil then fields[#fields + 1] = '"bestSellStation":"' .. tostring(it.bestSellStation) .. '"' end
        parts[#parts + 1] = "{" .. table.concat(fields, ",") .. "}"
    end
    return "[" .. table.concat(parts, ",") .. "]"
end
`;

function run(engine, body) {
    const L = lauxlib.luaL_newstate();
    try {
        lualib.luaL_openlibs(L);
        const sources = STOCK_FILES.map((file) => `{ name = ${JSON.stringify(file)}, text = ${longString(fs.readFileSync(path.join(modSrc, file), "utf8"))} }`);
        const chunk = [
            prelude,
            engine,
            "local modEnv = {}",
            "FS25_FarmDashboard = modEnv",
            "setmetatable(modEnv, { __index = _G })",
            "modEnv._G = modEnv",
            "function modEnv.getfenv(obj) return modEnv end",
            `local SOURCES = { ${sources.join(",\n")} }`,
            "for i = 1, #SOURCES do local fn = assert(load(SOURCES[i].text, '=' .. SOURCES[i].name, 't', modEnv)); fn() end",
            `local body = assert(load(${longString(productionFormatNumber() + "\n" + helpers + "\n" + body)}, '=body', 't', modEnv))`,
            "return body()",
        ].join("\n");
        if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
            throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
        }
        return to_jsstring(lua.lua_tostring(L, -1));
    } finally {
        lua.lua_close(L);
    }
}

const i18n = { t: (key) => key, tOr: (_key, fallback) => fallback };
const fillUnits = productionTs("NEW APP/src/lib/fill-units.ts");
const storage = productionTs("NEW APP/src/lib/storage/index.ts", {
    "@/i18n/i18n": i18n,
    "@/lib/fillTypeResolve": productionTs("NEW APP/src/lib/fillTypeResolve.ts"),
    "@/lib/moisture": productionTs("NEW APP/src/lib/moisture.ts", { "@/i18n/i18n": i18n }),
    "@/lib/fill-units": fillUnits,
    "@/lib/profile-display": productionTs("NEW APP/src/lib/profile-display.ts", { "@/i18n/i18n": i18n }),
});

function consume(json) {
    const items = JSON.parse(json);
    const stock = { byFarm: { 1: { farmId: 1, items } } };
    // No economy payload: the stock export alone must carry the price.
    return storage.enrichStockItems(items, stock, null, null, null, 1).map((it) => ({
        station: it.bestSellStation,
        per1000: it._pricePer1000,
        value: storage.computeValue(it.totalLiters, it._pricePer1000),
    }));
}

describe("106 fractional money-per-litre prices survive producer, JSON and consumer", () => {
    test("native 0.80/L beats the 0.30/L market and exports 0.8, read as 800 per 1000 L without economy data", () => {
        const engine = `stations({ buyer("Public", 0, 0.8) })`;
        expect(run(engine, `return priceOf(1)`)).toBe("0.8|Public");
        const json = run(engine, `return jsonItems(StockDataCollector:collect(), 1)`);
        expect(json).toBe('[{"fillTypeIndex":11,"fillType":"SILAGE","totalLiters":1000,"bestSellPrice":0.8,"bestSellStation":"Public"}]');
        const [row] = consume(json);
        expect(row.station).toBe("Public");
        expect(row.per1000).toBeCloseTo(800, 9);
        expect(row.value).toBeCloseTo(800, 9);
        expect(storage.resolvePricePer1000(JSON.parse(json)[0], null)).toBeCloseTo(800, 9);
    });

    test("a price above 1/L keeps its fraction (1.10 stays 1.1, read as 1100)", () => {
        const engine = `stations({ buyer("Mill", 0, 1.1) })`;
        const json = run(engine, `return jsonItems(StockDataCollector:collect(), 2)`);
        expect(JSON.parse(json)[0].bestSellPrice).toBe(1.1);
        expect(JSON.parse(json)[0].totalLiters).toBe(2500);
        const [row] = consume(json);
        expect(row.station).toBe("Mill");
        expect(row.per1000).toBeCloseTo(1100, 9);
        expect(row.value).toBeCloseTo(2750, 9);
    });

    test("a small positive fraction is not dropped (0.0035/L, read as 3.5 per 1000 L)", () => {
        const engine = `MARKET = 0.001; stations({ buyer("Digestate", 0, 0.0035) })`;
        const json = run(engine, `return jsonItems(StockDataCollector:collect(), 1)`);
        expect(JSON.parse(json)[0].bestSellPrice).toBe(0.0035);
        expect(JSON.parse(json)[0].bestSellStation).toBe("Digestate");
        expect(consume(json)[0].per1000).toBeCloseTo(3.5, 9);
    });

    test("with no selling stations the market fallback price is kept fractional", () => {
        expect(run(`stations({})`, `return priceOf(1)`)).toBe("0.3|Market");
        expect(run(`stations({}); g_currentMission.storageSystem = { getUnloadingStations = function() error("not ready") end }`, `return priceOf(2)`)).toBe("0.3|Market");
    });

    test("no valid price at all leaves the item unpriced instead of 0", () => {
        const engine = `MARKET = 0; stations({ buyer("Closed", 0, 0) })`;
        expect(run(engine, `local it = item(StockDataCollector:collect(), 1); return tostring(it.bestSellPrice) .. "|" .. tostring(it.bestSellStation) .. "|" .. it.totalLiters`)).toBe("nil|nil|1000");
    });

    test("throwing readers are isolated and the good buyer still wins", () => {
        const engine = `
local badIsa = buyer("Broken isa", 0, 9); badIsa.isa = function() error("not ready") end
local badPrice = buyer("Broken price", 0, 9); badPrice.getEffectiveFillTypePrice = function() error("price not ready") end
local badName = buyer("Unnamed", 0, 0.2); badName.getName = function() error("name not ready") end
stations({ badIsa, badPrice, badName, buyer("Public", 0, 0.8) })
g_currentMission.economyManager.getPricePerLiter = function() error("market not ready") end
`;
        expect(run(engine, `return priceOf(1) .. "/" .. priceOf(2)`)).toBe("0.8|Public/0.8|Public");
    });

    test("invalid numeric prices are ignored, including a NaN or infinite market price", () => {
        const engine = `
local list = {}
for i, p in ipairs({ 0/0, math.huge, -math.huge, -1, 0, "9", true, {} }) do list[#list + 1] = buyer("Bad" .. i, 0, p) end
local nilPrice = buyer("Nil", 0, 1); nilPrice.getEffectiveFillTypePrice = function() return nil end
list[#list + 1] = nilPrice
list[#list + 1] = buyer("Good", 0, 0.5)
stations(list)
MARKET = 0/0
`;
        expect(run(engine, `return priceOf(1)`)).toBe("0.5|Good");
        expect(run(engine + `\nMARKET = math.huge`, `return priceOf(2)`)).toBe("0.5|Good");
        expect(run(`MARKET = "7"; stations({})`, `local it = item(StockDataCollector:collect(), 1); return tostring(it.bestSellPrice)`)).toBe("nil");
    });

    test("finalizeStock keeps the producer's fractional price unchanged", () => {
        const body = `
local state = InventoryScan.newStockState({ 1 })
InventoryScan.addStockLiters(state, 1, 11, 1000.4, "Clamp", "bunkerSilo")
local it = state.byFarm["1"].items[1]
it.bestSellPrice, it.bestSellStation = 0.8123456789, "Public"
local out = InventoryScan.finalizeStock(state).byFarm["1"].items[1]
return fmt(out.bestSellPrice) .. "|" .. fmt(out.totalLiters)
`;
        expect(run("", body)).toBe("0.8123456789|1000");
    });
});

describe("106 buyer eligibility is decided per stock farm, never by the viewer", () => {
    const owned = `stations({ buyer("Farm A buyer", 1, 0.9), buyer("Farm B buyer", 2, 1.1), buyer("Public", 0, 0.5) })`;
    const perFarm = `
local res = StockDataCollector:collect()
local out = {}
for _, fid in ipairs({ 1, 2 }) do local it = item(res, fid); out[#out + 1] = fid .. ":" .. tostring(it.bestSellStation) end
return table.concat(out, "|")
`;

    test.each([1, 2, 3, 0])("viewer farm %i: each farm sells to the other farm's buyer", (viewer) => {
        expect(run(owned + `\nVIEWER = ${viewer}`, perFarm)).toBe("1:Farm B buyer|2:Farm A buyer");
        expect(run(owned + `\nVIEWER = ${viewer}`, `return priceOf(1) .. "/" .. priceOf(2)`)).toBe("1.1|Farm B buyer/0.9|Farm A buyer");
    });

    test("farm totals stay independent of buyer choice", () => {
        expect(run(owned, `local r = StockDataCollector:collect(); return item(r, 1).totalLiters .. "|" .. item(r, 2).totalLiters`)).toBe("1000|2500");
    });

    test("a farm never sells to its own buyer, even when it pays the most", () => {
        const engine = `stations({ buyer("Farm A buyer", 1, 5.0), buyer("Farm B buyer", 2, 5.0) })`;
        expect(run(engine + "\nVIEWER = 2", perFarm)).toBe("1:Farm B buyer|2:Farm A buyer");
        const selfOnly = `stations({ buyer("Farm A buyer", 1, 5.0) })`;
        expect(run(selfOnly + "\nVIEWER = 2", `return priceOf(1) .. "/" .. priceOf(2)`)).toBe("0.3|Market/5|Farm A buyer");
    });

    test("unowned buyers (ownerFarmId 0 or nil) serve every farm", () => {
        const engine = `local n = buyer("No owner", nil, 0.7); stations({ n, buyer("Public", 0, 0.6) })`;
        expect(run(engine + "\nVIEWER = 2", `return priceOf(1) .. "/" .. priceOf(2)`)).toBe("0.7|No owner/0.7|No owner");
    });

    test("a numeric-string buyer owner is normalised", () => {
        const engine = `stations({ buyer("Farm A buyer", "1", 2.0), buyer("Public", 0, 0.5) })`;
        expect(run(engine + "\nVIEWER = 2", `return priceOf(1) .. "/" .. priceOf(2)`)).toBe("0.5|Public/2|Farm A buyer");
    });

    const oddEngine = `
stations({ buyer("Farm A buyer", 1, 2.0), buyer("Farm B buyer", 2, 2.0), buyer("Public", 0, 0.5) })
VIEWER = 2
`;
    const odd = (key, farmId) => `
local realNew = InventoryScan.newStockState
InventoryScan.newStockState = function(ids)
    local s = realNew(ids)
    s.byFarm = { [${key}] = { farmId = ${farmId}, items = {}, _idx = {} } }
    return s
end
InventoryScan.scanPlaceable = function(p, ids, state, bale)
    local b = state.byFarm[${key}]
    if #b.items == 0 then b.items[1] = { fillTypeIndex = 11, fillType = "SILAGE", totalLiters = 1000, locations = {} } end
end
local it = StockDataCollector:collect().byFarm[${key}].items[1]
return fmt(it.bestSellPrice) .. "|" .. tostring(it.bestSellStation)
`;

    test("a bucket with no farm identity is offered unowned buyers only, never the viewer's farm", () => {
        expect(run(oddEngine, odd('"unknown"', "nil"))).toBe("0.5|Public");
    });

    test("a bucket whose key and farmId disagree is treated as unknown", () => {
        expect(run(oddEngine, odd('"1"', "2"))).toBe("0.5|Public");
    });

    test("a bucket known only by its key uses that farm", () => {
        expect(run(oddEngine, odd('"1"', "nil"))).toBe("2|Farm B buyer");
    });
});
