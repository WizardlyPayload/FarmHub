/**
 * Runs the production map-overview export (FarmDashboardDataCollector.lua) in Fengari against a stubbed
 * GIANTS file API. Covers the mapUS case: map#imageFilename names overview.png, only overview.dds ships,
 * the reference is a "$data/" token or an install-relative "data/" path, and the HUD may not exist yet.
 */
const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");
const collectorText = fs.readFileSync(path.join(modSrc, "FarmDashboardDataCollector.lua"), "utf8");

const APP = "C:/Games/FS25/";
const DEST = "PROFILE/modSettings/FS25_FarmDashboard/mapOverview/mapUS/";
const MAPUS_UI = "maps/mapUS/textures/ui/";

const HARNESS = `
H = { files = {}, probes = {}, copies = {}, copyArgTypes = {}, folders = {}, deleted = {}, warnings = {},
      infos = {}, devs = {}, writes = {}, getFilenameCalls = {} }
fileExists = function(p) H.probes[#H.probes + 1] = p; return H.files[p] == true end
copyFile = function(src, dst, force)
    H.copies[#H.copies + 1] = src
    H.copyArgTypes[#H.copyArgTypes + 1] = type(force)
    if H.copyFails then error("copy denied") end
    if not H.copySilent then H.files[dst] = true end
end
createFolder = function(p) H.folders[#H.folders + 1] = p end
deleteFile = function(p) H.deleted[#H.deleted + 1] = p; H.files[p] = nil end
getUserProfileAppPath = function() return "PROFILE/" end
getAppBasePath = function() return "${APP}" end
g_gameBasePath = ""
Utils = { getFilename = function(f, base)
    H.getFilenameCalls[#H.getFilenameCalls + 1] = f
    if f:sub(1, 1) == "$" then return g_gameBasePath .. f:sub(2) end
    return (base or "") .. f
end }
toJSON = function(t) return '{"sourcePath":"' .. tostring(t.sourcePath) .. '","mapId":"' .. tostring(t.mapId) .. '"}' end
io = { open = function(p)
    local h = { buf = {} }
    function h:write(s) self.buf[#self.buf + 1] = s end
    function h:close() H.writes[p] = table.concat(self.buf) end
    return h
end }
Logging.warning = function(m) H.warnings[#H.warnings + 1] = m end
Logging.info = function(m) H.infos[#H.infos + 1] = m end
FarmDashLog.dev = function(fmt, ...) H.devs[#H.devs + 1] = string.format(fmt, ...) end
g_time = 0
C = FarmDashboardDataCollector
function newMission(fields)
    local m = { missionInfo = { mapId = "mapUS", mapTitle = "Riverbend Springs" } }
    for k, v in pairs(fields or {}) do m[k] = v end
    g_currentMission = m
    return m
end
function exportAt(t)
    g_time = t
    local ok, err = pcall(function() C:_exportMapOverviewForDashboard() end)
    if not ok then error("export threw: " .. tostring(err)) end
end
function count(list, value)
    local n = 0
    for _, v in ipairs(list) do if v == value then n = n + 1 end end
    return n
end
function jsonList(list)
    local out = {}
    for i, v in ipairs(list) do out[i] = string.format("%q", tostring(v)) end
    return "[" .. table.concat(out, ",") .. "]"
end
function report(extra)
    local fields = {
        '"attempts":' .. tostring(C._mapOverviewExportAttempts or 0),
        '"done":' .. tostring(C._mapOverviewExportDone == true),
        '"outcome":' .. string.format("%q", tostring(C._mapOverviewExportOutcome)),
        '"probes":' .. jsonList(H.probes),
        '"copies":' .. jsonList(H.copies),
        '"copyArgTypes":' .. jsonList(H.copyArgTypes),
        '"deleted":' .. jsonList(H.deleted),
        '"warnings":' .. jsonList(H.warnings),
        '"infos":' .. jsonList(H.infos),
        '"devs":' .. jsonList(H.devs),
        '"getFilenameCalls":' .. jsonList(H.getFilenameCalls),
        '"meta":' .. string.format("%q", tostring(H.writes["${DEST}meta.json"])),
        '"destDds":' .. tostring(H.files["${DEST}overview.dds"] == true),
        '"destPng":' .. tostring(H.files["${DEST}overview.png"] == true),
    }
    for k, v in pairs(extra or {}) do fields[#fields + 1] = string.format("%q", k) .. ":" .. tostring(v) end
    return "{" .. table.concat(fields, ",") .. "}"
end
`;

function run(chunk) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const source = [
        "Logging = { info = function() end }",
        "FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end }",
        collectorText,
        HARNESS,
        chunk,
    ].join("\n");
    const status = lauxlib.luaL_dostring(L, to_luastring(source));
    if (status !== lua.LUA_OK) {
        const err = lua.lua_tostring(L, -1);
        throw new Error(err ? to_jsstring(err) : `lua error status ${status}`);
    }
    return JSON.parse(to_jsstring(lua.lua_tostring(L, -1)));
}

function expectBooleanCopies(r) {
    expect(r.copyArgTypes.every((t) => t === "boolean")).toBe(true);
}

function expectPrivateLogs(r) {
    for (const line of [...r.warnings, ...r.infos]) {
        expect(line).not.toContain("PROFILE/");
        expect(line).not.toContain(APP);
    }
}

describe("map overview export (115)", () => {
    test("engine-resolved mission PNG exports its DDS sibling with no HUD", () => {
        const png = `${APP}data/${MAPUS_UI}overview.png`;
        const dds = `${APP}data/${MAPUS_UI}overview.dds`;
        const r = run(`
            newMission({ mapImageFilename = "${png}" })
            H.files["${dds}"] = true
            exportAt(1000)
            return report()
        `);
        expect(r.copies).toEqual([dds]);
        expectBooleanCopies(r);
        expect(r.destDds).toBe(true);
        expect(r.done).toBe(true);
        expect(r.outcome).toBe("exported");
        expect(r.meta).toContain(`"sourcePath":"${dds}"`);
        expect(r.probes.indexOf(png)).toBeLessThan(r.probes.indexOf(dds));
        expect(r.warnings).toEqual([]);
        expect(r.infos).toHaveLength(1);
    });

    test("a readable mission PNG is still copied as-is before its sibling", () => {
        const png = `${APP}data/${MAPUS_UI}overview.png`;
        const r = run(`
            newMission({ mapImageFilename = "${png}" })
            H.files["${png}"] = true
            H.files["${APP}data/${MAPUS_UI}overview.dds"] = true
            exportAt(1000)
            return report()
        `);
        expect(r.copies).toEqual([png]);
        expect(r.destPng).toBe(true);
    });

    test("$data/ with an empty game base resolves to data/ and then the install root", () => {
        const token = `$data/${MAPUS_UI}overview.png`;
        const rootDds = `${APP}data/${MAPUS_UI}overview.dds`;
        const r = run(`
            newMission({ mapImageFilename = "${token}" })
            H.files["${rootDds}"] = true
            exportAt(1000)
            return report()
        `);
        expect(r.probes.slice(0, 6)).toEqual([
            token,
            `data/${MAPUS_UI}overview.png`,
            `${APP}data/${MAPUS_UI}overview.png`,
            `$data/${MAPUS_UI}overview.dds`,
            `data/${MAPUS_UI}overview.dds`,
            rootDds,
        ]);
        expect(r.copies).toEqual([rootDds]);
        expect(r.destDds).toBe(true);
        expect(r.infos[0]).toContain(`data/${MAPUS_UI}overview.dds (app root)`);
        expectPrivateLogs(r);
    });

    test("$data/ with a non-empty game base uses the engine path without an install-root alias", () => {
        const resolvedDds = `D:/FS25/data/${MAPUS_UI}overview.dds`;
        const r = run(`
            g_gameBasePath = "D:/FS25/"
            newMission({ mapImageFilename = "$data/${MAPUS_UI}overview.png" })
            H.files["${resolvedDds}"] = true
            exportAt(1000)
            return report()
        `);
        expect(r.copies).toEqual([resolvedDds]);
        expect(r.probes.some((p) => p.startsWith(APP))).toBe(false);
        expect(r.getFilenameCalls).toEqual([`$data/${MAPUS_UI}overview.png`, `$data/${MAPUS_UI}overview.dds`]);
    });

    test("an install-relative data/ HUD overlay resolves against the app root", () => {
        const rel = `data/${MAPUS_UI}overview.dds`;
        const r = run(`
            newMission({ hud = { ingameMap = { mapOverlay = { filename = "${rel}" } } } })
            H.files["${APP}${rel}"] = true
            exportAt(1000)
            return report()
        `);
        expect(r.probes.slice(0, 2)).toEqual([rel, `${APP}${rel}`]);
        expect(r.copies).toEqual([`${APP}${rel}`]);
        expect(r.getFilenameCalls).toEqual([]);
    });

    test("raw candidates are kept and deduplicated across mission image and HUD", () => {
        const png = `${APP}data/${MAPUS_UI}overview.png`;
        const r = run(`
            newMission({ mapImageFilename = "${png}", hud = { ingameMap = { mapOverlay = { filename = "${png}" } } } })
            exportAt(1000)
            return report()
        `);
        expect(r.probes.filter((p) => p === png)).toHaveLength(1);
        expect(r.probes.filter((p) => p === `${APP}data/${MAPUS_UI}overview.dds`)).toHaveLength(1);
        expect(new Set(r.probes).size).toBe(r.probes.length);
    });

    test.each([
        ["drive", "E:/Maps/overview.png"],
        ["UNC", "\\\\\\\\server\\\\share\\\\overview.png"],
        ["rooted", "/maps/mapUS/overview.png"],
        ["mod", "C:/Users/p/Documents/My Games/FarmingSimulator2025/mods/FS25_Map/data/overview.png"],
        ["DLC", "C:/Games/FS25/pdlc/highlandsFishingPack/maps/overview.png"],
        ["VFS", "$pdlcdir$highlandsFishingPack/maps/overview.png"],
        ["moddir token", "$moddir$FS25_Map/overview.png"],
        ["backslash $data", "$data\\\\maps\\\\mapUS\\\\overview.png"],
    ])("%s references are probed exactly as given", (_label, ref) => {
        const r = run(`
            g_gameBasePath = "D:/FS25/"
            newMission({ mapImageFilename = "${ref}" })
            exportAt(1000)
            return report()
        `);
        const raw = ref.replace(/\\\\/g, "\\");
        const sibling = raw.replace(/\.png$/, ".dds");
        expect(r.probes).toEqual([raw, sibling]);
        expect(r.getFilenameCalls).toEqual([]);
        expect(r.copies).toEqual([]);
    });

    test("missing globals and a throwing file API fail quietly", () => {
        const r = run(`
            g_currentMission = nil
            exportAt(0)
            newMission({})
            g_currentMission.missionInfo = {}
            exportAt(1)
            local blank = { attempts = C._mapOverviewExportAttempts or 0 }
            newMission({ mapImageFilename = "$data/${MAPUS_UI}overview.png" })
            getUserProfileAppPath = nil
            getAppBasePath = nil
            Utils = nil
            exportAt(2)
            local destOutcome = C._mapOverviewExportOutcome
            getUserProfileAppPath = function() return "PROFILE/" end
            fileExists = function() error("boom") end
            copyFile = nil
            createFolder = nil
            exportAt(70000)
            return report({ blankAttempts = blank.attempts, destOutcome = string.format("%q", destOutcome) })
        `);
        expect(r.blankAttempts).toBe(0);
        expect(r.destOutcome).toBe("destination-unavailable");
        expect(r.outcome).toBe("no-readable-candidate");
        expect(r.attempts).toBe(2);
    });

    test("no image: five attempts about 60 s apart, then one bounded warning", () => {
        const r = run(`
            newMission({ mapImageFilename = "$data/${MAPUS_UI}overview.png" })
            for i = 0, 40 do exportAt(i * 13000) end
            return report()
        `);
        expect(r.attempts).toBe(5);
        expect(r.done).toBe(true);
        expect(r.warnings).toHaveLength(1);
        expect(r.warnings[0]).toContain("no-readable-candidate");
        expect(r.warnings[0]).toMatch(/candidates=\d+ readable=0 copyFailed=0/);
        const sources = r.warnings[0].split("sources: ")[1];
        expect(sources.split(", ").length).toBeLessThanOrEqual(3);
        expect(r.devs.filter((d) => d.includes("retrying later"))).toHaveLength(4);
        expectPrivateLogs(r);
    });

    test("rapid calls inside the retry window do not spend attempts", () => {
        const r = run(`
            newMission({})
            for i = 1, 25 do exportAt(5000 + i) end
            return report()
        `);
        expect(r.attempts).toBe(1);
        expect(r.warnings).toEqual([]);
    });

    test("a readable source whose copy fails is reported apart from a missing source", () => {
        const dds = `${APP}data/${MAPUS_UI}overview.dds`;
        const r = run(`
            H.copyFails = true
            newMission({ mapImageFilename = "${APP}data/${MAPUS_UI}overview.png" })
            H.files["${dds}"] = true
            for i = 0, 4 do exportAt(i * 60000) end
            return report()
        `);
        expect(r.attempts).toBe(5);
        expect(r.outcome).toBe("copy-or-destination-failed");
        expect(r.warnings).toHaveLength(1);
        expect(r.warnings[0]).toContain("copy-or-destination-failed; candidates=");
        expect(r.warnings[0]).toMatch(/readable=1 copyFailed=1/);
        expect(r.copies.length).toBe(10);
        expectBooleanCopies(r);
    });

    test("a prior exported image is kept without a warning", () => {
        const r = run(`
            H.files["${DEST}overview.dds"] = true
            newMission({})
            for i = 0, 4 do exportAt(i * 60000) end
            return report()
        `);
        expect(r.done).toBe(true);
        expect(r.warnings).toEqual([]);
        expect(r.deleted).toEqual([]);
        expect(r.destDds).toBe(true);
        expect(r.devs.some((d) => d.includes("keeping previous export"))).toBe(true);
    });

    test("a new mission or a clock reset starts a fresh budget", () => {
        const dds = `${APP}data/${MAPUS_UI}overview.dds`;
        const r = run(`
            newMission({})
            for i = 0, 4 do exportAt(500000 + i * 60000) end
            local exhausted = C._mapOverviewExportDone
            exportAt(900000)
            local afterDone = C._mapOverviewExportAttempts
            newMission({ mapImageFilename = "${APP}data/${MAPUS_UI}overview.png" })
            H.files["${dds}"] = true
            exportAt(1000)
            local fresh = C._mapOverviewExportDone
            newMission({})
            exportAt(700000)
            exportAt(2000)
            return report({ exhausted = tostring(exhausted), afterDone = afterDone, fresh = tostring(fresh) })
        `);
        expect(r.exhausted).toBe(true);
        expect(r.afterDone).toBe(5);
        expect(r.fresh).toBe(true);
        expect(r.attempts).toBe(2);
        expect(r.warnings).toHaveLength(1);
    });

    test("without a mission clock every call may attempt, still capped at five", () => {
        const r = run(`
            newMission({})
            for i = 1, 12 do
                g_time = nil
                C:_exportMapOverviewForDashboard()
            end
            return report()
        `);
        expect(r.attempts).toBe(5);
        expect(r.warnings).toHaveLength(1);
    });
});
