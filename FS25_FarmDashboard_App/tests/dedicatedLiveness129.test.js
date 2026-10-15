"use strict";

/**
 * FARMHUB-20261006-DEDICATED-LIVENESS-129: dedicated server (diagnostics=false, observed config) armed, wrote the
 * generation-0 bootstrap and never committed generation 1. Real modDesc sources, frozen server config.
 */
const fs = require("fs");
const path = require("path");
const { runDedicated, DEDICATED_PRELUDE } = require("./helpers/dedicatedHarness");

const repoRoot = path.resolve(__dirname, "../..");
const observedConfig = path.join(repoRoot, "Pipeline/runs/FARMHUB-20261006-DEDICATED-CODEX/server-config.xml");
const FALLBACK_CONFIG = `<farmDashboard>
    <settings enabled="true" updateInterval="10000" collectionCycleMs="60000" diagnostics="false" useStateMachine_economy="false" useStateMachine_fields="false" useStateMachine_production="false" postLoadCollectionGraceSec="45" sliceBudgetMs="4" jsonTopLevelKeysPerFrame="1"/>
    <modules vehicles="true" fields="true" weather="true" economy="true" animals="true" production="true" finance="true"/>
</farmDashboard>`;
const configXml = fs.existsSync(observedConfig) ? fs.readFileSync(observedConfig, "utf8") : FALLBACK_CONFIG;

function run(body, opts = {}) {
    const out = runDedicated({ configXml, vehicles: opts.vehicles == null ? 71 : opts.vehicles, script: DEDICATED_PRELUDE + body });
    return JSON.parse(out);
}

const JSON_HELPER = `
local function enc(v)
    local t = type(v)
    if t == "table" then
        if next(v) == nil then return "[]" end
        local isArr = #v > 0
        local parts = {}
        if isArr then
            for i = 1, #v do parts[#parts + 1] = enc(v[i]) end
            return "[" .. table.concat(parts, ",") .. "]"
        end
        for k, x in pairs(v) do parts[#parts + 1] = string.format("%q", tostring(k)) .. ":" .. enc(x) end
        return "{" .. table.concat(parts, ",") .. "}"
    elseif t == "number" or t == "boolean" then return tostring(v)
    elseif v == nil then return "null" end
    return string.format("%q", tostring(v))
end
`;

const REPLICA_HELPER = `
local function gen(f) return tonumber(f and f["farmDashboardExport#exportGeneration"]) or 0 end
`;

jest.setTimeout(240000);

describe("dedicated liveness 129", () => {
    test("bootstrap then coalesced gameplay record: generations 1 and 2 commit with observed settings", () => {
        const r = run(JSON_HELPER + `
local loadErrors = #ENGINE.LOAD_ERRORS
bootLikeServerLog()
local sawHeld = false
local frames = runUntil(function()
    if state().routeHeld then sawHeld = true end
    return commitsLogged() >= 2
end, 200, 100)
local slots = {}
for p, f in pairs(FILES) do
    if string.find(p, "/slot%-[ab]%.xml$") and string.find(p, "^/server/") then
        slots[#slots + 1] = tonumber(f["farmDashboardExport#exportGeneration"]) or -1
    end
end
table.sort(slots)
return enc({
    loadErrors = loadErrors,
    frames = frames or -1,
    sawHeld = sawHeld,
    commits = grep(ENGINE.LOG, "export committed generation="),
    orphanWarnings = #grep(ENGINE.LOG, "export route idle without a commit"),
    completed = tonumber(DC._completedGeneration) or 0,
    slots = slots,
    identity = FarmDashboardCareerIdentity.status().careerId,
})
`);
        expect(r.loadErrors).toBe(0);
        expect(r.sawHeld).toBe(true);
        expect(r.frames).toBeGreaterThan(0);
        expect(r.commits[0]).toMatch(/export committed generation=1 /);
        expect(r.commits[1]).toMatch(/export committed generation=2 /);
        expect(r.orphanWarnings).toBe(0);
        expect(r.completed).toBeGreaterThanOrEqual(2);
        expect(Math.max(...r.slots)).toBeGreaterThanOrEqual(2);
        expect(r.identity).toMatch(/^fd-[0-9a-f]{16}-1$/);
    });

    test("stalled export step: a gameplay record lost by the route is released with a warning and export recovers", () => {
        const r = run(JSON_HELPER + `
bootLikeServerLog()
runUntil(function() return state().routeHeld end, 50, 100)
local heldBefore = state().routeHeld
routeJob().held = nil
local stuckFrames = 0
for i = 1, 30 do
    frame(100)
    if DC._xmlInFlight == true then stuckFrames = stuckFrames + 1 end
end
local recovered = runUntil(function() return commitsLogged() >= 1 end, 200, 100)
return enc({
    heldBefore = heldBefore,
    stuckFrames = stuckFrames,
    warnings = grep(ENGINE.LOG, "export route idle without a commit"),
    recovered = recovered or -1,
    inFlightAfter = DC._xmlInFlight == true and commitsLogged() == 0,
})
`);
        expect(r.heldBefore).toBe(true);
        expect(r.stuckFrames).toBeGreaterThan(0);
        expect(r.warnings.length).toBe(1);
        expect(r.warnings[0]).toMatch(/releasing the collector/);
        expect(r.recovered).toBeGreaterThan(0);
    });

    test("bootstrap write failure: the coalesced gameplay record is resubmitted, not dropped", () => {
        const r = run(JSON_HELPER + `
local fails = 0
REAL.SAVE_FAIL = function(p)
    if fails < 1 and string.find(p, "/slot%-a%.xml$") and string.find(p, "^/server/") then
        fails = fails + 1
        return true
    end
    return false
end
bootLikeServerLog()
local frames = runUntil(function() return commitsLogged() >= 1 end, 250, 100)
return enc({
    fails = fails,
    frames = frames or -1,
    commits = grep(ENGINE.LOG, "export committed generation="),
    orphanWarnings = #grep(ENGINE.LOG, "export route idle without a commit"),
})
`);
        expect(r.fails).toBe(1);
        expect(r.frames).toBeGreaterThan(0);
        expect(r.commits[0]).toMatch(/export committed generation=1 /);
        expect(r.orphanWarnings).toBe(0);
    });

    test("explicit pairing: a client joining after commit stores the replica under its configured source and advances", () => {
        const r = run(JSON_HELPER + REPLICA_HELPER + `
bootLikeServerLog()
runUntil(function() return commitsLogged() >= 1 end, 200, 100)
local careerId = FarmDashboardCareerIdentity.status().careerId
local c = joinClient("clientP", { sourceId = "pc-a", remoteSlot = "savegame1", serverKey = "join-key-a" })
local joined = runUntil(function() return replicaOf(c, "pc-a") ~= nil end, 200, 100)
local firstGen = gen(replicaOf(c, "pc-a"))
local advanced = runUntil(function() return gen(replicaOf(c, "pc-a")) > firstGen end, 300, 100)
local _, selected = replicaOf(c, "pc-a")
return enc({
    careerId = careerId,
    joined = joined or -1,
    career = replicaOf(c, "pc-a")["farmDashboardExport#careerId"],
    firstGen = firstGen,
    advanced = advanced or -1,
    selected = selected ~= nil,
    clientErrors = c.E.LOAD_ERRORS,
    engineErrors = ENGINE_ERRORS,
})
`);
        expect(r.clientErrors).toEqual([]);
        expect(r.joined).toBeGreaterThan(0);
        expect(r.career).toBe(r.careerId);
        expect(r.firstGen).toBeGreaterThanOrEqual(1);
        expect(r.advanced).toBeGreaterThan(0);
        expect(r.selected).toBe(true);
        expect(r.engineErrors).toEqual([]);
    });

    test("map overview: parent folder before map folder, Bool copy flag, bounded retries", () => {
        const r = run(JSON_HELPER + `
local FOLDERS = {}
REAL.createFolder = function(p) FOLDERS[#FOLDERS + 1] = p; return true end
local src = "/server/mods/FS25_Witcombe/map/textures/ui/overview.dds"
FILES[src] = {}
local function parentMade(dst)
    local parent = string.match(dst, "^(.*/)[^/]+$")
    local root = string.match(parent, "^(.*/)[^/]+/$")
    local hasParent, hasRoot = false, false
    for _, f in ipairs(FOLDERS) do
        if f == parent then hasParent = true end
        if f == root then hasRoot = true end
    end
    return hasParent and hasRoot
end
REAL.COPY_RESULT = function(s, d, overwrite)
    if FILES[s] ~= nil and parentMade(d) then FILES[d] = {} end
    return nil
end
bootLikeServerLog()
DC._mapOverviewExportState = nil
FOLDERS = {}
REAL.COPY_CALLS = {}
DC:_exportMapOverviewForDashboard()
local okOutcome = DC._mapOverviewExportOutcome
local okFolders = { FOLDERS[1], FOLDERS[2] }
local okTypes = {}
for _, c in ipairs(REAL.COPY_CALLS) do okTypes[#okTypes + 1] = c.overwriteType end

REAL.COPY_RESULT = function() return nil end
DC._mapOverviewExportState = nil
for p in pairs(FILES) do if string.find(p, "/mapOverview/") then FILES[p] = nil end end
REAL.COPY_CALLS = {}
local before = #grep(ENGINE.LOG, "map overview export failed")
for i = 1, 20 do
    DC:_exportMapOverviewForDashboard()
    ENGINE.g_time = ENGINE.g_time + 61000
end
local failTypes = {}
for _, c in ipairs(REAL.COPY_CALLS) do failTypes[c.overwriteType] = true end
return enc({
    okOutcome = okOutcome,
    okFolders = okFolders,
    okTypes = okTypes,
    failCopies = #REAL.COPY_CALLS,
    failTypes = failTypes,
    failWarnings = #grep(ENGINE.LOG, "map overview export failed") - before,
    attempts = DC._mapOverviewExportAttempts,
})
`, { vehicles: 0 });
        expect(r.okOutcome).toBe("exported");
        expect(r.okFolders[0]).toBe("/server/modSettings/FS25_FarmDashboard/mapOverview/");
        expect(r.okFolders[1]).toBe("/server/modSettings/FS25_FarmDashboard/mapOverview/FS25_Witcombe.SampleModMap/");
        expect(r.okTypes.length).toBeGreaterThan(0);
        expect(r.okTypes.every((t) => t === "boolean")).toBe(true);
        expect(r.attempts).toBe(5);
        expect(r.failCopies).toBeLessThanOrEqual(10);
        expect(Object.keys(r.failTypes)).toEqual(["boolean"]);
        expect(r.failWarnings).toBe(1);
    });
});
