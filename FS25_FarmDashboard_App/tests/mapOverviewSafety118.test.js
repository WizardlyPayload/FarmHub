/**
 * Safety controls for the production map-overview export (FarmDashboardDataCollector.lua) in Fengari:
 * metadata failures stay bounded, map ids never leave mapOverview/<key>/ once Windows normalises the path,
 * an existing image is never reported as a fresh copy, and a backwards clock never reopens the budget.
 */
const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");
const collectorText = fs.readFileSync(path.join(modSrc, "FarmDashboardDataCollector.lua"), "utf8");

const ROOT = "PROFILE/modSettings/FS25_FarmDashboard/mapOverview/";
const SOURCE = "data/maps/mapUS/textures/ui/overview.dds";

const HARNESS = `
H = { files = {}, probes = {}, copies = {}, copyArgTypes = {}, mutations = {}, deleted = {}, warnings = {},
      infos = {}, devs = {}, writes = {}, opened = 0, closed = 0, throws = 0, continued = 0 }
local function mutate(op, p) H.mutations[#H.mutations + 1] = op .. " " .. tostring(p) end
fileExists = function(p) H.probes[#H.probes + 1] = p; return H.files[p] == true end
copyFile = function(src, dst, force)
    H.copies[#H.copies + 1] = src
    H.copyArgTypes[#H.copyArgTypes + 1] = type(force)
    mutate("copy", dst)
    if H.copyMode == "throw" then error("copy denied") end
    if H.copyMode == "false" then return false end
    if H.copyMode == "noop" then return end
    H.files[dst] = true
    return true
end
createFolder = function(p) mutate("mkdir", p) end
deleteFile = function(p) mutate("delete", p); H.deleted[#H.deleted + 1] = p; H.files[p] = nil end
getUserProfileAppPath = function() return "PROFILE/" end
getAppBasePath = function() return "C:/Games/FS25/" end
g_gameBasePath = ""
Utils = { getFilename = function(f, base)
    if f:sub(1, 1) == "$" then return g_gameBasePath .. f:sub(2) end
    return (base or "") .. f
end }
toJSON = function(t)
    if H.jsonMode == "throw" then error("serializer failed") end
    if H.jsonMode == "nil" then return nil end
    return '{"sourcePath":"' .. tostring(t.sourcePath) .. '","mapId":"' .. tostring(t.mapId) .. '"}'
end
io = { open = function(p, mode)
    mutate("open", p)
    if H.ioMode == "throwOpen" then error("open denied") end
    if H.ioMode == "nilOpen" then return nil, "Permission denied" end
    H.opened = H.opened + 1
    local h = { buf = {} }
    function h:write(s)
        if H.ioMode == "throwWrite" then error("write denied") end
        if H.ioMode == "nilWrite" then return nil, "disk full" end
        self.buf[#self.buf + 1] = s
        return self
    end
    function h:close()
        H.closed = H.closed + 1
        if H.ioMode == "throwClose" then error("close denied") end
        if #self.buf > 0 then H.writes[p] = table.concat(self.buf) end
        return true
    end
    return h
end }
Logging.warning = function(m) H.warnings[#H.warnings + 1] = m end
Logging.info = function(m) H.infos[#H.infos + 1] = m end
FarmDashLog.dev = function(fmt, ...) H.devs[#H.devs + 1] = string.format(fmt, ...) end
g_time = 0
C = FarmDashboardDataCollector
function newMission(fields, info)
    local m = { missionInfo = info or { mapId = "mapUS", mapTitle = "Riverbend Springs" } }
    for k, v in pairs(fields or {}) do m[k] = v end
    g_currentMission = m
    return m
end
function assemblyAt(t)
    g_time = t
    local ok = pcall(function() C:_exportMapOverviewForDashboard() end)
    if not ok then H.throws = H.throws + 1 end
    H.continued = H.continued + 1
end
function jsonStr(s)
    s = tostring(s)
    return '"' .. s:gsub('[%c"\\\\]', function(c) return string.format("\\\\u%04x", c:byte()) end) .. '"'
end
function jsonList(list)
    local out = {}
    for i, v in ipairs(list) do out[i] = jsonStr(v) end
    return "[" .. table.concat(out, ",") .. "]"
end
function report(metaPath)
    local fields = {
        '"attempts":' .. tostring(C._mapOverviewExportAttempts or 0),
        '"done":' .. tostring(C._mapOverviewExportDone == true),
        '"outcome":' .. jsonStr(C._mapOverviewExportOutcome),
        '"metaOutcome":' .. jsonStr(C._mapOverviewMetaOutcome),
        '"probes":' .. jsonList(H.probes),
        '"copies":' .. jsonList(H.copies),
        '"copyArgTypes":' .. jsonList(H.copyArgTypes),
        '"mutations":' .. jsonList(H.mutations),
        '"deleted":' .. jsonList(H.deleted),
        '"warnings":' .. jsonList(H.warnings),
        '"infos":' .. jsonList(H.infos),
        '"devs":' .. jsonList(H.devs),
        '"meta":' .. jsonStr(H.writes[metaPath or "${ROOT}mapUS/meta.json"]),
        '"destDds":' .. tostring(H.files["${ROOT}mapUS/overview.dds"] == true),
        '"destPng":' .. tostring(H.files["${ROOT}mapUS/overview.png"] == true),
        '"opened":' .. H.opened,
        '"closed":' .. H.closed,
        '"throws":' .. H.throws,
        '"continued":' .. H.continued,
    }
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

const luaStr = (s) => JSON.stringify(s);

/** Win32 path normalisation: "." and ".." segments collapse, other segments lose trailing dots and spaces. */
function windowsNormalize(p) {
    const out = [];
    for (const raw of p.split(/[\\/]/)) {
        if (raw === "..") { out.pop(); continue; }
        if (raw === ".") continue;
        const seg = raw.replace(/[. ]+$/, "");
        if (seg === "") continue;
        out.push(seg);
    }
    return out.join("/");
}

function mutationPaths(r) {
    return r.mutations.map((m) => m.slice(m.indexOf(" ") + 1));
}

describe("map overview export safety (118)", () => {
    test.each([
        ["throwOpen", null, "open-failed", 0, 0],
        ["nilOpen", null, "open-failed", 0, 0],
        ["throwWrite", null, "write-failed", 1, 1],
        ["nilWrite", null, "write-failed", 1, 1],
        ["throwClose", null, "close-failed", 1, 1],
        [null, "throw", "serialize-failed", 0, 0],
        [null, "nil", "serialize-failed", 0, 0],
        ["missingIo", null, "unavailable", 0, 0],
        [null, null, "written", 1, 1],
    ])("metadata io=%s json=%s is one bounded optional step (%s)", (ioMode, jsonMode, metaOutcome, opened, closed) => {
        const r = run(`
            H.ioMode = ${luaStr(ioMode || "ok")}
            H.jsonMode = ${luaStr(jsonMode || "ok")}
            if H.ioMode == "missingIo" then io = nil end
            H.writes["${ROOT}mapUS/meta.json"] = "PRIOR"
            newMission({ mapImageFilename = "${SOURCE}" })
            H.files["${SOURCE}"] = true
            for i = 0, 6 do assemblyAt(i * 60000) end
            return report()
        `);
        expect(r.throws).toBe(0);
        expect(r.continued).toBe(7);
        expect(r.attempts).toBe(1);
        expect(r.done).toBe(true);
        expect(r.copies).toEqual([SOURCE]);
        expectBoolean(r);
        expect(r.outcome).toBe("exported");
        expect(r.metaOutcome).toBe(metaOutcome);
        expect(r.opened).toBe(opened);
        expect(r.closed).toBe(closed);
        expect(r.destDds).toBe(true);
        expect(r.warnings).toEqual([]);
        expect(r.infos).toHaveLength(1);
        expect(r.infos[0]).toContain(`metadata: ${metaOutcome}`);
        if (metaOutcome === "written") {
            expect(r.meta).toContain(`"sourcePath":"${SOURCE}"`);
        } else if (opened === 0) {
            expect(r.meta).toBe("PRIOR");
        }
    });

    test("the attempt cap holds across 7 spaced calls even when a logger throws", () => {
        const r = run(`
            FarmDashLog.dev = function() error("logger down") end
            newMission({})
            for i = 0, 6 do assemblyAt(i * 60000) end
            return report()
        `);
        expect(r.continued).toBe(7);
        expect(r.attempts).toBe(5);
        expect(r.done).toBe(true);
        expect(r.throws).toBeLessThanOrEqual(4);
        expect(r.warnings).toHaveLength(1);
    });

    test("the candidate list saturates at 64 per attempt", () => {
        const r = run(`
            newMission({ mapImageFilename = "$data/maps/x/overview.png", baseDirectory = "data/d/" }, {
                mapId = "mapUS", mapXMLFilename = "data/a/map.xml", filename = "data/c/x.xml", baseDirectory = "data/f/",
                map = { mapXMLFilename = "data/b/map.xml", baseDirectory = "data/e/" },
            })
            assemblyAt(0)
            return report()
        `);
        expect(r.probes).toHaveLength(64);
        expect(new Set(r.probes).size).toBe(64);
        expect(r.warnings).toEqual([]);
    });

    test.each([".", "..", "...", " ", "   ", ". .", " .. ", "..  ", ". . .", "CON", "nul.txt", "Com1", "lpt9 .log"])(
        "map id %j has no safe folder: no folder, copy, delete or write, one warning",
        (mapId) => {
            const r = run(`
                newMission({ mapImageFilename = "${SOURCE}" }, { mapId = ${luaStr(mapId)} })
                H.files["${SOURCE}"] = true
                for i = 0, 6 do assemblyAt(i * 60000) end
                return report()
            `);
            expect(r.mutations).toEqual([]);
            expect(r.copies).toEqual([]);
            expect(r.probes).toEqual([]);
            expect(r.attempts).toBe(1);
            expect(r.done).toBe(true);
            expect(r.outcome).toBe("invalid-destination-key");
            expect(r.warnings).toHaveLength(1);
            expect(r.throws).toBe(0);
        },
    );

    test.each([
        ["mapUS", "mapUS"],
        ["FS25_RiverMap.mapRiver", "FS25_RiverMap.mapRiver"],
        ["pdlc_highlandsFishingPack.mapKinlaig", "pdlc_highlandsFishingPack.mapKinlaig"],
        ["..hidden", "..hidden"],
        ["map.", "map"],
        ["map. . ", "map"],
        ["a/b\\c", "a_b_c"],
        ["\tmap..", "_map"],
        ["CONSOLE", "CONSOLE"],
    ])("map id %j exports inside mapOverview/%s", (mapId, key) => {
        const dest = `${ROOT}${key}/`;
        const r = run(`
            newMission({ mapImageFilename = "${SOURCE}" }, { mapId = ${luaStr(mapId)} })
            H.files["${SOURCE}"] = true
            assemblyAt(0)
            return report("${dest}meta.json")
        `);
        expect(r.outcome).toBe("exported");
        expect(r.metaOutcome).toBe("written");
        const paths = mutationPaths(r);
        // createFolder is one level, so the shared mapOverview/ parent is made first on a fresh profile.
        expect(paths).toEqual([ROOT, dest, `${dest}overview.dds`, `${dest}meta.json`]);
        for (const p of paths.slice(1)) {
            expect(`${windowsNormalize(p)}/`.startsWith(`${windowsNormalize(dest)}/`)).toBe(true);
        }
        expect(windowsNormalize(`${dest}overview.dds`)).toBe(`${windowsNormalize(ROOT)}/${key}/overview.dds`);
        expect(r.meta).toContain(`"mapId":"${mapId}"`);
    });

    test.each([
        ["false", "explicit false"],
        ["noop", "silent no-op"],
    ])("copy %s over a prior image is kept as retained-unconfirmed (%s)", (copyMode) => {
        const r = run(`
            H.copyMode = ${luaStr(copyMode)}
            H.files["${ROOT}mapUS/overview.dds"] = true
            H.files["${ROOT}mapUS/overview.png"] = true
            H.writes["${ROOT}mapUS/meta.json"] = "PRIOR"
            newMission({ mapImageFilename = "${SOURCE}" })
            H.files["${SOURCE}"] = true
            for i = 0, 6 do assemblyAt(i * 60000) end
            return report()
        `);
        expect(r.outcome).toBe("retained-unconfirmed");
        expect(r.metaOutcome).toBe("kept");
        expect(r.done).toBe(true);
        expect(r.attempts).toBe(1);
        expect(r.meta).toBe("PRIOR");
        expect(r.opened).toBe(0);
        expect(r.deleted).toEqual([]);
        expect(r.destDds).toBe(true);
        expect(r.destPng).toBe(true);
        expect(r.infos).toEqual([]);
        expect(r.devs.some((d) => d.includes("exported"))).toBe(false);
        expect(r.warnings).toEqual([]);
        expectBoolean(r);
    });

    test("a throwing copy with a prior image keeps it and its metadata, bounded, no warning", () => {
        const r = run(`
            H.copyMode = "throw"
            H.files["${ROOT}mapUS/overview.dds"] = true
            H.writes["${ROOT}mapUS/meta.json"] = "PRIOR"
            newMission({ mapImageFilename = "${SOURCE}" })
            H.files["${SOURCE}"] = true
            for i = 0, 6 do assemblyAt(i * 60000) end
            return report()
        `);
        expect(r.attempts).toBe(5);
        expect(r.done).toBe(true);
        expect(r.outcome).toBe("copy-or-destination-failed");
        expect(r.copies).toHaveLength(10);
        expect(r.meta).toBe("PRIOR");
        expect(r.deleted).toEqual([]);
        expect(r.destDds).toBe(true);
        expect(r.infos).toEqual([]);
        expect(r.warnings).toEqual([]);
        expect(r.devs.some((d) => d.includes("keeping previous export"))).toBe(true);
        expectBoolean(r);
    });

    test("a brand-new copy writes image and metadata and finishes; the stale other format is replaced", () => {
        const r = run(`
            H.files["${ROOT}mapUS/overview.png"] = true
            newMission({ mapImageFilename = "${SOURCE}" })
            H.files["${SOURCE}"] = true
            for i = 0, 6 do assemblyAt(i * 60000) end
            return report()
        `);
        expect(r.outcome).toBe("exported");
        expect(r.metaOutcome).toBe("written");
        expect(r.attempts).toBe(1);
        expect(r.destDds).toBe(true);
        expect(r.destPng).toBe(false);
        expect(r.deleted).toEqual([`${ROOT}mapUS/overview.png`]);
        expect(r.meta).toContain(`"sourcePath":"${SOURCE}"`);
        expect(r.infos).toHaveLength(1);
    });

    test("an exhausted mission stays exhausted when the clock goes back", () => {
        const r = run(`
            newMission({})
            for i = 0, 4 do assemblyAt(500000 + i * 60000) end
            local devsAtExhaustion = #H.devs
            for i = 0, 6 do assemblyAt(i * 60000) end
            H.devs[#H.devs + 1] = "after-exhaustion " .. (#H.devs - devsAtExhaustion)
            return report()
        `);
        expect(r.devs[r.devs.length - 1]).toBe("after-exhaustion 0");
        expect(r.attempts).toBe(5);
        expect(r.done).toBe(true);
        expect(r.warnings).toHaveLength(1);
        expect(r.continued).toBe(12);
    });

    test("a backwards clock mid-budget reschedules within the same five attempts", () => {
        const r = run(`
            newMission({})
            assemblyAt(500000)
            assemblyAt(560000)
            assemblyAt(1000)
            assemblyAt(1500)
            for i = 1, 6 do assemblyAt(1000 + i * 60000) end
            return report()
        `);
        expect(r.attempts).toBe(5);
        expect(r.done).toBe(true);
        expect(r.warnings).toHaveLength(1);
    });

    test("only a new mission gets a fresh budget", () => {
        const r = run(`
            newMission({})
            for i = 0, 6 do assemblyAt(i * 60000) end
            newMission({ mapImageFilename = "${SOURCE}" })
            H.files["${SOURCE}"] = true
            assemblyAt(0)
            return report()
        `);
        expect(r.attempts).toBe(1);
        expect(r.outcome).toBe("exported");
        expect(r.done).toBe(true);
        expect(r.warnings).toHaveLength(1);
    });
});

function expectBoolean(r) {
    expect(r.copyArgTypes.every((t) => t === "boolean")).toBe(true);
}
