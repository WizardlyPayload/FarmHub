"use strict";

/**
 * Fengari harness for dedicated companion-page collectors.
 * Loads CompanionModsDataCollector.lua (shared detection helpers), CompanionPages.lua and the given
 * collector file(s), applies the fake mod globals from `setup`, then runs the registry.
 */

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const MOD_SRC = path.resolve(__dirname, "../../../FS25_FarmDashboard_Mod/src");
const PAGES_DIR = path.join(MOD_SRC, "companionPages");

const JSON_ENCODER = `
local function __fdEncode(value, depth)
    depth = depth or 0
    if depth > 20 then return "null" end
    local kind = type(value)
    if kind == "nil" then return "null" end
    if kind == "boolean" then return value and "true" or "false" end
    if kind == "number" then
        if value ~= value or value == math.huge or value == -math.huge then return "null" end
        if math.type and math.type(value) == "integer" then return tostring(value) end
        if value == math.floor(value) and math.abs(value) < 1e15 then return string.format("%d", value) end
        return string.format("%.10g", value)
    end
    if kind == "string" then
        return '"' .. value:gsub('[%c"\\\\]', function(c)
            return string.format("\\\\u%04x", string.byte(c))
        end) .. '"'
    end
    if kind ~= "table" then return "null" end
    local n = #value
    if n > 0 then
        local parts = {}
        for i = 1, n do parts[#parts + 1] = __fdEncode(value[i], depth + 1) end
        return "[" .. table.concat(parts, ",") .. "]"
    end
    local parts = {}
    for k, v in pairs(value) do
        parts[#parts + 1] = __fdEncode(tostring(k), depth + 1) .. ":" .. __fdEncode(v, depth + 1)
    end
    return "{" .. table.concat(parts, ",") .. "}"
end
`;

function readLua(file) {
    return fs.readFileSync(file, "utf8");
}

function resolveCollector(file) {
    if (path.isAbsolute(file)) return file;
    return path.join(PAGES_DIR, file);
}

function runChunk(chunk) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    const out = to_jsstring(lua.lua_tostring(L, -1));
    return out === "null" ? undefined : JSON.parse(out);
}

function prelude(files, setup, opts) {
    const farmId = Number.isFinite(opts.farmId) ? opts.farmId : null;
    const parts = [
        JSON_ENCODER,
        readLua(path.join(MOD_SRC, "collectors", "CompanionModsDataCollector.lua")),
        readLua(path.join(PAGES_DIR, "CompanionPages.lua")),
        ...files.map((f) => readLua(resolveCollector(f))),
        setup || "",
    ];
    if (farmId != null) {
        parts.push(`
            _G.g_currentMission = _G.g_currentMission or {}
            if _G.g_currentMission.getFarmId == nil then
                _G.g_currentMission.getFarmId = function() return ${farmId} end
            end
        `);
    }
    if (Number.isFinite(opts.time)) parts.push(`_G.g_time = ${opts.time}`);
    return parts.join("\n");
}

/**
 * Run one page collector.
 * @param {string} file  collector file name in src/companionPages (or an absolute path)
 * @param {string} setup  Lua that fakes the mod globals (g_modIsLoaded, mod env tables, g_currentMission …)
 * @param {{ key?: string, farmId?: number, time?: number, cycle?: number }} [opts]
 * @returns {object|undefined} sanitized page, or undefined when the mod is not detected
 */
function runCompanionPage(file, setup, opts = {}) {
    const keyExpr = opts.key ? JSON.stringify(opts.key) : "CompanionPages.order[#CompanionPages.order]";
    const chunk = [
        prelude([file], setup, opts),
        `local entry = CompanionPages.entries[${keyExpr}]`,
        "if entry == nil then error('collector did not register a page') end",
        `return __fdEncode(CompanionPages.collectEntry(entry, ${Number.isFinite(opts.cycle) ? opts.cycle : 1}))`,
    ].join("\n");
    return runChunk(chunk);
}

/** Run the full incremental collector (collectBegin + collectStep until done) over several files. */
function runCompanionPagesCycle(files, setup, opts = {}) {
    const chunk = [
        prelude(files, setup, opts),
        "CompanionPagesDataCollector:init()",
        "CompanionPagesDataCollector:collectBegin()",
        "local steps, done, payload = 0, false, nil",
        "while not done and steps < 500 do",
        "    steps = steps + 1",
        "    done, payload = CompanionPagesDataCollector:collectStep({})",
        "end",
        "payload.steps = steps",
        "return __fdEncode(payload)",
    ].join("\n");
    return runChunk(chunk);
}

/** Evaluate arbitrary Lua after the prelude; the chunk must `return __fdEncode(value)`. */
function runCompanionLua(files, setup, body, opts = {}) {
    return runChunk([prelude(files, setup, opts), body].join("\n"));
}

module.exports = { runCompanionPage, runCompanionPagesCycle, runCompanionLua, PAGES_DIR, MOD_SRC };
