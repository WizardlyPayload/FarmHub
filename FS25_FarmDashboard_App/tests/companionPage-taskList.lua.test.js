"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const source = fs.readFileSync(
    path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua"),
    "utf8",
);
const start = source.indexOf("local function collectTaskList()");
const end = source.indexOf("\nlocal function ", start + 1);
if (start < 0 || end < 0) throw new Error("Task List collector missing");
const collector = source.slice(start, end);

function run(body) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const script = `
        local function activeExportFarmId() return 1 end
        local function clipText(value, limit) return tostring(value or ""):sub(1, limit) end
        ${collector}
        ${body}
    `;
    if (lauxlib.luaL_dostring(L, to_luastring(script)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    return to_jsstring(lua.lua_tostring(L, -1));
}

test("owned template tasks resolve from their template while foreign and orphaned rows stay out", () => {
    expect(run(`
        g_currentMission = { taskList = {
            taskGroups = {
                normal = { farmId = 1, type = 1, tasks = { n = { detail = "Feed cows", priority = 2 } } },
                template = { farmId = 1, type = 2, tasks = { t = { detail = "Check grain dryer", priority = 1 } } },
                instance = { farmId = 1, type = 3, templateGroupId = "template", tasks = {} },
                foreign = { farmId = 2, type = 1, tasks = { f = { detail = "PRIVATE" } } },
            },
            activeTasks = {
                a = { groupId = "normal", id = "n" },
                b = { groupId = "instance", id = "t" },
                c = { groupId = "foreign", id = "f" },
                d = { groupId = "normal", id = "missing" },
            },
        } }
        local result = collectTaskList()
        local details = {}
        for _, task in ipairs(result.tasks) do details[#details + 1] = task.detail end
        table.sort(details)
        return table.concat({result.readState, result.coverage, result.withheldCount, #result.tasks,
            table.concat(details, ",")}, "|")
    `)).toBe("ok|partial|1|2|Check grain dryer,Feed cows");
});

test("unresolved owned template does not become a confirmed empty task list", () => {
    expect(run(`
        g_currentMission = { taskList = {
            taskGroups = {
                instance = { farmId = 1, type = 3, templateGroupId = "foreign", tasks = {} },
                foreign = { farmId = 2, type = 2, tasks = { t = { detail = "PRIVATE" } } },
            },
            activeTasks = { a = { groupId = "instance", id = "t" } },
        } }
        local result = collectTaskList()
        return table.concat({result.readState, result.coverage, result.withheldCount, #result.tasks}, "|")
    `)).toBe("partial|partial|1|0");
});
