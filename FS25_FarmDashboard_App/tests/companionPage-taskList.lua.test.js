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
                normal = { farmId = 1, type = 1, tasks = {
                    n = { type = 1, detail = "Feed cows", priority = 2, period = 6 },
                    dynamic = { type = 2, detail = "", priority = 1 },
                } },
                template = { farmId = 1, type = 2, tasks = { t = { type = 1, detail = "Check grain dryer", priority = 1, period = 6 } } },
                instance = { farmId = 1, type = 3, templateGroupId = "template", tasks = {} },
                foreign = { farmId = 2, type = 1, tasks = { f = { detail = "PRIVATE" } } },
            },
            activeTasks = {
                a = { groupId = "normal", id = "n" },
                b = { groupId = "instance", id = "t" },
                c = { groupId = "foreign", id = "f" },
                d = { groupId = "normal", id = "missing" },
                e = { groupId = "normal", id = "dynamic" },
            },
        } }
        local result = collectTaskList()
        local details = {}
        for _, task in ipairs(result.tasks) do details[#details + 1] = task.detail end
        table.sort(details)
        return table.concat({result.readState, result.coverage, result.withheldCount, #result.tasks,
            table.concat(details, ",")}, "|")
    `)).toBe("ok|partial|2|2|Check grain dryer,Feed cows");
});

test("the exported preview order follows the mod's period and priority order", () => {
    expect(run(`
        g_currentMission = { taskList = {
            taskGroups = { group = { farmId = 1, type = 1, tasks = {
                late = { type = 1, detail = "Late", period = 8, priority = 1 },
                low = { type = 1, detail = "Low", period = 6, priority = 3 },
                high = { type = 1, detail = "High", period = 6, priority = 1 },
                early = { type = 1, detail = "Early", period = 5, priority = 2 },
            } } },
            activeTasks = {
                a = { groupId = "group", id = "late" },
                b = { groupId = "group", id = "low" },
                c = { groupId = "group", id = "high" },
                d = { groupId = "group", id = "early" },
            },
        } }
        local result = collectTaskList()
        local details = {}
        for _, task in ipairs(result.tasks) do details[#details + 1] = task.detail end
        return table.concat(details, ",")
    `)).toBe("Early,High,Low,Late");
});

test("the 40-row cap is applied after sorting the bounded scan", () => {
    expect(run(`
        local tasks, active = {}, {}
        for i = 1, 41 do
            local id = "task" .. i
            tasks[id] = { type = 1, detail = id, period = i == 41 and 5 or 8, priority = 1 }
            active[i] = { groupId = "group", id = id }
        end
        g_currentMission = { taskList = {
            taskGroups = { group = { farmId = 1, type = 1, tasks = tasks } },
            activeTasks = active,
        } }
        local result = collectTaskList()
        return table.concat({result.coverage, #result.tasks, result.tasks[1].detail}, "|")
    `)).toBe("truncated|40|task41");
});

test("a scan cap with no owned rows does not assert a confirmed empty list", () => {
    expect(run(`
        local active = {}
        for i = 1, 401 do active[i] = { groupId = "foreign", id = "task" .. i } end
        g_currentMission = { taskList = {
            taskGroups = { foreign = { farmId = 2, type = 1, tasks = {} } },
            activeTasks = active,
        } }
        local result = collectTaskList()
        return table.concat({result.readState, result.coverage, #result.tasks}, "|")
    `)).toBe("partial|truncated|0");
});

test("unresolved owned template does not become a confirmed empty task list", () => {
    expect(run(`
        g_currentMission = { taskList = {
            taskGroups = {
                instance = { farmId = 1, type = 3, templateGroupId = "foreign", tasks = {} },
                foreign = { farmId = 2, type = 2, tasks = { t = { type = 1, detail = "PRIVATE" } } },
            },
            activeTasks = { a = { groupId = "instance", id = "t" } },
        } }
        local result = collectTaskList()
        return table.concat({result.readState, result.coverage, result.withheldCount, #result.tasks}, "|")
    `)).toBe("partial|partial|1|0");
});
