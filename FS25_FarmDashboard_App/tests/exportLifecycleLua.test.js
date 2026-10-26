/**
 * Runs the production Lua collectors in Fengari (Lua 5.3 scoping).
 * These cover the four fresh-game failures: nil _jsonWalkNowSec, commit
 * logged without a successful write, inactive Imperial via leftover settings,
 * and bootstrap exportGeneration omitted.
 */
const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const modSrc = path.resolve(__dirname, "../../FS25_FarmDashboard_Mod/src");

function runProduction(files, chunk) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const parts = [
        "Logging = { info = function() end }",
        "FarmDashLog = { devWarn = function() end, dev = function() end, error = function() end }",
    ];
    for (const file of files) {
        parts.push(fs.readFileSync(path.join(modSrc, file), "utf8"));
    }
    parts.push(chunk);
    const status = lauxlib.luaL_dostring(L, to_luastring(parts.join("\n")));
    if (status !== lua.LUA_OK) {
        const err = lua.lua_tostring(L, -1);
        throw new Error(err ? to_jsstring(err) : `lua error status ${status}`);
    }
    if (lua.lua_isnil(L, -1)) return null;
    const asString = lua.lua_tostring(L, -1);
    return asString ? to_jsstring(asString) : null;
}

describe("production export lifecycle", () => {
    test("long composite pen key has the same bounded resource id in game and app", () => {
        const penKey = "C:/Users/Graham/Documents/My Games/FarmingSimulator2025/mods/FS25_cowshedPack/calfShed.xml:517";
        const expected = require("../livestockDetail").resourceIdForPen(penKey);
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            local C = FarmDashboardDataCollector
            C._exportSession = 1
            C._usesXmlTransport = function() return true end
            C._xmlRecord = function() return {} end
            FarmDashboardExportRoute = { submitResource = function(_, kind, json, record)
                record.admissionVersion = 7
                return "queued"
            end }
            local key = "${penKey}"
            local outcome = C:_submitBoundedPen({ penKey = key, ledger = { ts = 1 } }, "{}")
            return C:_resourceIdForPen(key) .. "|" .. tostring(outcome)
        `);
        expect(result).toBe(`${expected}|queued`);
    });

    test("compact frame-bounded snapshot matches the compact serializer", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            local C = FarmDashboardDataCollector
            local data = { title = "spaces stay inside strings", prices = {}, nested = { empty = {}, items = { "a b", "c d" } } }
            for i = 1, 30 do data.prices[i] = { name = "price " .. i, value = i } end
            local walk = C:_jsonWalkBegin(data, 0)
            walk.compact = true
            walk.stack[1].knownObject = true
            local parts = {}
            local steps = 0
            local done = false
            repeat
                C._frameBudget = { bytes = 32, charged = 0 }
                done = C:_jsonWalkStep(walk, parts)
                steps = steps + 1
                if steps > 5000 then return "stuck" end
            until done
            local compact = table.concat(parts)
            C._frameBudget = nil
            local expected = C:toJSON(data)
            local pretty = C:toJSON(data, 0)
            return tostring(compact == expected) .. "|" .. tostring(#compact < #pretty) .. "|" .. tostring(steps > 1)
        `);
        expect(result).toBe("true|true|true");
    });

    test("jsonWriteStep can call _jsonWalkNowSec", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            FarmDashboardDataCollector.config = { sliceBudgetMs = 4, jsonTopLevelKeysPerFrame = 8 }
            FarmDashboardDataCollector._exportSession = 1
            FarmDashboardDataCollector._jsonWriteJob = {
                data = { hello = "world" },
                keys = { "hello" },
                session = 1,
                i = 1,
                parts = { "{\\n" },
            }
            FarmDashboardDataCollector.getSavegameDirName = function() return "savegame3" end
            local ok, err = pcall(function()
                FarmDashboardDataCollector:jsonWriteStep()
            end)
            if ok then return "ok" end
            return tostring(err)
        `);
        expect(result).toBe("ok");
    });

    test("a denied disk write is not logged as committed and keeps the payload", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            local committed = false
            Logging.info = function(msg)
                if type(msg) == "string" and string.find(msg, "export committed", 1, true) then
                    committed = true
                end
            end
            FarmDashboardDataCollector._exportSession = 3
            FarmDashboardDataCollector.config = {}
            FarmDashboardDataCollector._jsonPendingDisk = {
                jsonString = "{\\"exportGeneration\\":1}",
                savegameDir = "savegame3",
                generation = 1,
                session = 3,
            }
            io = { open = function() end }
            FarmDashboardDataCollector.getDataOutputDir = function() return "unused/" end
            FarmDashboardDataCollector.getSavegameDirName = function() return "savegame3" end
            FarmDashboardDataCollector._writeFileAtomic = function() return false end
            _G.saveFile = nil
            local stepOk = FarmDashboardDataCollector:jsonDiskWriteStep()
            local kept = FarmDashboardDataCollector._jsonPendingDisk ~= nil
            return (stepOk and "step-true" or "step-false")
                .. "|" .. (committed and "logged" or "silent")
                .. "|" .. (kept and "kept" or "dropped")
        `);
        expect(result).toBe("step-false|silent|kept");
    });

    test("a confirmed disk write logs the commit and clears the payload", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            local committed = false
            Logging.info = function(msg)
                if type(msg) == "string" and string.find(msg, "export committed", 1, true) then
                    committed = true
                end
            end
            FarmDashboardDataCollector._exportSession = 3
            FarmDashboardDataCollector.config = {}
            FarmDashboardDataCollector._jsonPendingDisk = {
                jsonString = "{\\"exportGeneration\\":1}",
                savegameDir = "savegame3",
                generation = 1,
                session = 3,
            }
            io = { open = function() end }
            FarmDashboardDataCollector.getDataOutputDir = function() return "unused/" end
            FarmDashboardDataCollector.getSavegameDirName = function() return "savegame3" end
            FarmDashboardDataCollector._writeFileAtomic = function() return true end
            _G.saveFile = nil
            local stepOk = FarmDashboardDataCollector:jsonDiskWriteStep()
            local kept = FarmDashboardDataCollector._jsonPendingDisk ~= nil
            return (stepOk and "step-true" or "step-false")
                .. "|" .. (committed and "logged" or "silent")
                .. "|" .. (kept and "kept" or "dropped")
        `);
        expect(result).toBe("step-true|logged|dropped");
    });

    test("synchronous bootstrap records exportGeneration 0", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            FarmDashboardDataCollector.getSavegameDirName = function() return "savegame3" end
            FarmDashboardDataCollector.getMapBounds = function() return {} end
            FarmDashboardDataCollector.refineMapBoundsFromWorldActivity = function(_, bounds) return bounds end
            FarmDashboardDataCollector.getDataOutputDir = function() return "unused/" end
            FarmDashboardDataCollector._writeFileAtomic = function() return true end
            FarmDashboardDataCollector._wroteRichExport = false
            local seen = "missing"
            local orig = FarmDashboardDataCollector.toJSON
            FarmDashboardDataCollector.toJSON = function(self, data, depth)
                if data.exportGeneration == nil then
                    seen = "missing"
                else
                    seen = tostring(data.exportGeneration)
                end
                return orig(self, data, depth)
            end
            FarmDashboardDataCollector:writeDataToFile({ fields = {}, vehicles = {}, animals = {} })
            return seen
        `);
        expect(result).toBe("0");
    });
});

describe("production Imperial membership", () => {
    test("leftover Imperial settings do not activate an inactive mod", () => {
        const result = runProduction(["FillTypeUtils.lua"], `
            _G.g_modIsLoaded = {}
            _G.UnitConversionMod = { settings = { liquidUnit = 1, cropsUnit = 1, weightUnit = 1, weightScale = 1 } }
            XMLFile = {
                loadIfExists = function()
                    return {
                        getInt = function() return 1 end,
                        delete = function() end,
                    }
                end,
            }
            local out = FillTypeUtils.unitDisplayForJson()
            if out.imperial ~= nil then return "imperial-set" end
            local n = 0
            for _, mod in pairs(out.mods) do
                if mod.style == "imperial" then n = n + 1 end
            end
            if n ~= 0 then return "mods" end
            return "absent"
        `);
        expect(result).toBe("absent");
    });

    test("an active Imperial mod is read from its own environment", () => {
        const result = runProduction(["FillTypeUtils.lua"], `
            _G.g_modIsLoaded = { FS25_ImperialSystem = true }
            _G.UnitConversionMod = { settings = { liquidUnit = 0, cropsUnit = 0, weightUnit = 0, weightScale = 0 } }
            _G.FS25_ImperialSystem = {
                UnitConversionMod = { settings = { liquidUnit = 1, cropsUnit = 0, weightUnit = 0, weightScale = 0 } },
            }
            XMLFile = { loadIfExists = function() return nil end }
            local out = FillTypeUtils.unitDisplayForJson()
            if out.imperial == nil then return "missing" end
            return tostring(out.imperial.liquid)
        `);
        expect(result).toBe("gallons");
    });
});

const collectorPrep = `
    local C = FarmDashboardDataCollector
    C.config = { sliceBudgetMs = 1000, jsonTopLevelKeysPerFrame = 32, collectionCycleMs = 60000 }
    C._exportSession = 1
    C._completedGeneration = 0
    C._activeCandidateGeneration = nil
    C._activeTmpPaths = {}
    C._wroteRichExport = false
    C.getSavegameDirName = function() return "savegame3" end
    C.getDataOutputDir = function() return "virtual/" end
    C.getMapBounds = function() return {} end
    C.refineMapBoundsFromWorldActivity = function(_, _, bounds) return bounds end
    C.isAdvancedDamageSystemLoaded = function() return false end
    C.isVehicleYearsLoaded = function() return false end
    C._exportMapOverviewForDashboard = function() end
    C._exportFillTypeHudIcons = function() end
    C._diagTrace = function() end
`;

describe("production write verification", () => {
    test("a nil write result does not replace the previous file", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            local opens = 0
            io = { open = function(p)
                opens = opens + 1
                return {
                    write = function() return nil, "disk full" end,
                    close = function() return true end,
                }
            end }
            os = { rename = function() return true end }
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. files["virtual/data.json"] .. "|" .. tostring(opens)
        `);
        expect(result).toBe("false|OLDGOOD|1");
    });

    test("a throwing write does not replace the previous file", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            io = { open = function()
                return {
                    write = function() error("write threw") end,
                    close = function() return true end,
                }
            end }
            os = { rename = function() return true end }
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. files["virtual/data.json"]
        `);
        expect(result).toBe("false|OLDGOOD");
    });

    test("a failed close does not replace the previous file", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            io = { open = function(p)
                return {
                    write = function(self, payload)
                        if string.sub(p, -4) == ".tmp" then files[p] = payload end
                        return self
                    end,
                    close = function() return nil, "flush failed" end,
                }
            end }
            os = { rename = function() return true end }
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. files["virtual/data.json"]
        `);
        expect(result).toBe("false|OLDGOOD");
    });

    test("rename failure keeps a backup and restores old bytes when the destination write fails", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            local opens = 0
            local destWrites = 0
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            io = { open = function(p)
                opens = opens + 1
                if p == "virtual/data.json" then files[p] = "" end
                return {
                    write = function(self, payload)
                        if p == "virtual/data.json" then
                            destWrites = destWrites + 1
                            if destWrites == 1 then
                                files[p] = "PARTIAL"
                                return nil, "full"
                            end
                        end
                        files[p] = payload
                        return self
                    end,
                    close = function() return true end,
                }
            end }
            os = { rename = function() return false end, remove = function(p) files[p] = nil return true end }
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            local bounded = opens <= 6
            return tostring(ok) .. "|" .. tostring(files["virtual/data.json"]) .. "|" .. tostring(files["virtual/data.json.bak"]) .. "|" .. tostring(bounded)
        `);
        expect(result).toBe("false|OLDGOOD|OLDGOOD|true");
    });

    test("a checked fallback replacement keeps the backup and publishes the new bytes", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            io = { open = function(p)
                return {
                    write = function(self, payload)
                        files[p] = payload
                        return self
                    end,
                    close = function() return true end,
                }
            end }
            os = {
                rename = function() return false end,
                remove = function(p) files[p] = nil return true end,
            }
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. tostring(files["virtual/data.json"]) .. "|" .. tostring(files["virtual/data.json.bak"])
        `);
        expect(result).toBe("true|NEW|OLDGOOD");
    });

    test("a false or void saveFile does not commit or drop the pending payload", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local logged = false
            Logging.info = function(msg)
                if type(msg) == "string" and string.find(msg, "export committed", 1, true) then
                    logged = true
                end
            end
            io = nil
            _G.g_time = 0
            FarmDashboardDataCollector._jsonPendingDisk = {
                jsonString = "payload",
                savegameDir = "savegame3",
                generation = 1,
                session = 1,
            }
            _G.saveFile = function() return nil end
            local voidStep = FarmDashboardDataCollector:jsonDiskWriteStep()
            local voidKept = FarmDashboardDataCollector._jsonPendingDisk ~= nil
            _G.g_time = 1000
            _G.saveFile = function() return false end
            local falseStep = FarmDashboardDataCollector:jsonDiskWriteStep()
            local falseKept = FarmDashboardDataCollector._jsonPendingDisk ~= nil
            _G.g_time = 10000
            _G.saveFile = function() error("saveFile threw") end
            local throwStep = FarmDashboardDataCollector:jsonDiskWriteStep()
            local throwKept = FarmDashboardDataCollector._jsonPendingDisk ~= nil
            return tostring(voidStep) .. "|" .. tostring(voidKept)
                .. "|" .. tostring(falseStep) .. "|" .. tostring(falseKept)
                .. "|" .. tostring(throwStep) .. "|" .. tostring(throwKept)
                .. "|" .. tostring(logged)
        `);
        expect(result).toBe("false|true|false|true|false|true|false");
    });
});

describe("production generation and recovery", () => {
    test("gameplay numbering waits for a verified commit", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local writes = 0
            io = { open = function() end }
            FarmDashboardDataCollector._writeFileAtomic = function()
                writes = writes + 1
                return writes >= 2
            end
            FarmDashboardDataCollector:beginDeferredJsonWrite({ fields = { { id = 1 } } })
            local before = tostring(FarmDashboardDataCollector._completedGeneration or 0)
            FarmDashboardDataCollector:writeDataToFile({ fields = { { id = 1 } } }, "gameplay")
            local failed = tostring(FarmDashboardDataCollector._completedGeneration or 0)
                .. "|" .. tostring(FarmDashboardDataCollector._activeCandidateGeneration)
            FarmDashboardDataCollector:writeDataToFile({ fields = { { id = 1 } } }, "gameplay")
            local recovered = tostring(FarmDashboardDataCollector._completedGeneration)
            FarmDashboardDataCollector:writeDataToFile({ fields = { { id = 2 } } }, "gameplay")
            local nextGen = tostring(FarmDashboardDataCollector._completedGeneration)
            return before .. "|" .. failed .. "|" .. recovered .. "|" .. nextGen
        `);
        expect(result).toBe("0|0|1|1|2");
    });

    test("a queued snapshot does not consume a generation", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            io = { open = function() end }
            FarmDashboardDataCollector._writeFileAtomic = function() return true end
            FarmDashboardDataCollector:beginDeferredJsonWrite({ marker = "first" })
            local active = FarmDashboardDataCollector._jsonWriteJob.data.exportGeneration
            FarmDashboardDataCollector:beginDeferredJsonWrite({ marker = "second" })
            local queued = FarmDashboardDataCollector._jsonWritePending.exportGeneration
            local candidate = FarmDashboardDataCollector._activeCandidateGeneration
            local guard = 0
            while FarmDashboardDataCollector._jsonWriteJob and guard < 30 do
                FarmDashboardDataCollector:jsonWriteStep()
                guard = guard + 1
            end
            FarmDashboardDataCollector:jsonDiskWriteStep()
            local completed = FarmDashboardDataCollector._completedGeneration
            local promoted = FarmDashboardDataCollector._jsonWriteJob
                and FarmDashboardDataCollector._jsonWriteJob.data.exportGeneration
            return tostring(active) .. "|" .. tostring(queued) .. "|" .. tostring(candidate)
                .. "|" .. tostring(completed) .. "|" .. tostring(promoted)
        `);
        expect(result).toBe("1|nil|1|1|2");
    });

    test("an empty collector cycle is a gameplay candidate", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            FarmDashboardDataCollector._cycleFresh = {}
            FarmDashboardDataCollector.refreshAssembledInMemory = function(self)
                self.data = { fields = {}, vehicles = {}, animals = {}, weather = { temperature = 20 } }
            end
            FarmDashboardDataCollector:finishModuleSlice("fields", { "fields" }, false, false)
            local job = FarmDashboardDataCollector._jsonWriteJob
            return tostring(job.data.exportGeneration)
                .. "|" .. tostring(job.data.exportClass)
                .. "|" .. tostring(FarmDashboardDataCollector._diagExportCycle)
                .. "|" .. tostring(FarmDashboardDataCollector._completedGeneration or 0)
        `);
        expect(result).toBe("1|gameplay|1|0");
    });

    test("a same-process session change drops a waiting retry", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local calls = 0
            FarmDashboardDataCollector._completedGeneration = 3
            FarmDashboardDataCollector._jsonWriteJob = { data = { stale = true } }
            FarmDashboardDataCollector._jsonWritePending = { queued = true }
            FarmDashboardDataCollector._jsonPendingDisk = {
                jsonString = "STALE",
                savegameDir = "savegame1",
                generation = 4,
                session = 1,
                attempts = 2,
                nextRetryAt = 0,
            }
            FarmDashboardDataCollector._writeJsonStringToDisk = function()
                calls = calls + 1
                return true
            end
            FarmDashboardDataCollector:resetStaggerState()
            local afterReset = tostring(FarmDashboardDataCollector._exportSession)
                .. "|" .. tostring(FarmDashboardDataCollector._completedGeneration or 0)
                .. "|" .. tostring(FarmDashboardDataCollector._jsonPendingDisk == nil)
                .. "|" .. tostring(FarmDashboardDataCollector._jsonWriteJob == nil)
            FarmDashboardDataCollector._exportSession = 9
            FarmDashboardDataCollector._jsonPendingDisk = {
                jsonString = "STALE",
                savegameDir = "savegame1",
                generation = 4,
                session = 1,
            }
            local step = FarmDashboardDataCollector:jsonDiskWriteStep()
            return afterReset .. "|" .. tostring(calls) .. "|" .. tostring(step)
                .. "|" .. tostring(FarmDashboardDataCollector._jsonPendingDisk == nil)
        `);
        expect(result).toBe("2|0|true|true|0|true|true");
    });

    test("a waiting retry does not block the next collector slot", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local slots = 0
            local writes = 0
            _G.g_time = 0
            _G.g_currentMission = {}
            FarmDashboardDataCollector._animalMode = "base"
            FarmDashboardDataCollector._dirtyPens = {}
            FarmDashboardDataCollector._cycleFresh = {}
            FarmDashboardDataCollector.moduleCache = { fields = { { id = 1 } } }
            FarmDashboardDataCollector.staggerFirstRunDone = false
            FarmDashboardDataCollector.getEnabledCollectorOrder = function() return { "fields" } end
            FarmDashboardDataCollector.shouldDeferCollectionWork = function() return false end
            FarmDashboardDataCollector._updateCollectionPauseLatch = function() end
            FarmDashboardDataCollector._jsonPendingDisk = {
                jsonString = "payload",
                savegameDir = "savegame3",
                generation = 1,
                session = 1,
                nextRetryAt = 999999,
            }
            FarmDashboardDataCollector.consumeOneModuleSlot = function() slots = slots + 1 end
            FarmDashboardDataCollector._writeJsonStringToDisk = function()
                writes = writes + 1
                return false
            end
            FarmDashboardDataCollector:_updateBody(16)
            return tostring(slots) .. "|" .. tostring(writes)
        `);
        expect(result).toBe("1|0");
    });

    test("a later successful attempt commits once", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local writes = 0
            io = { open = function() end }
            _G.g_time = 0
            FarmDashboardDataCollector._jsonPendingDisk = {
                jsonString = "payload",
                savegameDir = "savegame3",
                generation = 1,
                session = 1,
                attempts = 2,
            }
            FarmDashboardDataCollector._writeFileAtomic = function()
                writes = writes + 1
                return writes >= 2
            end
            local first = FarmDashboardDataCollector:jsonDiskWriteStep()
            _G.g_time = 1000
            local second = FarmDashboardDataCollector:jsonDiskWriteStep()
            local third = FarmDashboardDataCollector:jsonDiskWriteStep()
            return tostring(first) .. "|" .. tostring(second) .. "|" .. tostring(third)
                .. "|" .. tostring(writes) .. "|" .. tostring(FarmDashboardDataCollector._completedGeneration)
                .. "|" .. tostring(FarmDashboardDataCollector._jsonPendingDisk == nil)
        `);
        expect(result).toBe("false|true|true|2|1|true");
    });
});

describe("production export logging and partial tokens", () => {
    test("diagnostics-off write failures log once, then recovery", () => {
        const result = runProduction(["FarmDashLog.lua", "FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local failed = 0
            local recovered = 0
            Logging.warning = function(msg)
                if type(msg) ~= "string" then return end
                if string.find(msg, "export write failed", 1, true) then failed = failed + 1 end
                if string.find(msg, "export write recovered", 1, true) then recovered = recovered + 1 end
            end
            Logging.info = function() end
            io = { open = function() end }
            _G.g_time = 0
            FarmDashboardDataCollector._jsonPendingDisk = {
                jsonString = "payload",
                savegameDir = "savegame3",
                generation = 1,
                session = 1,
            }
            FarmDashboardDataCollector._writeFileAtomic = function() return false end
            FarmDashboardDataCollector:jsonDiskWriteStep()
            _G.g_time = 250
            FarmDashboardDataCollector:jsonDiskWriteStep()
            _G.g_time = 60500
            FarmDashboardDataCollector:jsonDiskWriteStep()
            FarmDashboardDataCollector._writeFileAtomic = function() return true end
            _G.g_time = 70000
            FarmDashboardDataCollector:jsonDiskWriteStep()
            return tostring(failed) .. "|" .. tostring(recovered)
                .. "|" .. tostring(FarmDashboardDataCollector._completedGeneration)
        `);
        expect(result).toBe("2|1|1");
    });

    test("a walker exception does not publish partial JSON and a later candidate commits", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            io = { open = function() end }
            FarmDashboardDataCollector._writeFileAtomic = function() return true end
            FarmDashboardDataCollector._completedGeneration = 4
            local orig = FarmDashboardDataCollector._jsonWalkStep
            FarmDashboardDataCollector._jsonWalkStep = function(_, _, parts)
                parts[#parts + 1] = "{"
                error("injected failure after prefix")
            end
            FarmDashboardDataCollector._jsonWriteJob = {
                data = { broken = { nested = true }, exportGeneration = 99 },
                keys = { "broken" },
                i = 1,
                parts = { "{\\n" },
                session = 1,
                walk = { stack = { { v = {}, level = 2, phase = "open" } }, seen = {} },
                walkKey = "broken",
            }
            FarmDashboardDataCollector:jsonWriteStep()
            local aborted = tostring(FarmDashboardDataCollector._jsonPendingDisk == nil)
                .. "|" .. tostring(FarmDashboardDataCollector._jsonWriteJob == nil)
                .. "|" .. tostring(FarmDashboardDataCollector._completedGeneration)
            FarmDashboardDataCollector._jsonWalkStep = orig
            FarmDashboardDataCollector:beginDeferredJsonWrite({ ok = true })
            local guard = 0
            while FarmDashboardDataCollector._jsonWriteJob and guard < 30 do
                FarmDashboardDataCollector:jsonWriteStep()
                guard = guard + 1
            end
            local raw = FarmDashboardDataCollector._jsonPendingDisk
                and FarmDashboardDataCollector._jsonPendingDisk.jsonString or ""
            local wellFormed = string.sub(raw, 1, 1) == "{" and string.sub(raw, -1) == "}"
                and string.find(raw, "{null", 1, true) == nil
            local committed = false
            Logging.info = function(msg)
                if type(msg) == "string" and string.find(msg, "export committed", 1, true) then
                    committed = true
                end
            end
            FarmDashboardDataCollector:jsonDiskWriteStep()
            return aborted .. "|" .. tostring(wellFormed) .. "|" .. tostring(committed)
                .. "|" .. tostring(FarmDashboardDataCollector._completedGeneration)
        `);
        expect(result).toBe("true|true|4|true|true|5");
    });
});

describe("production complete-byte recovery", () => {
    test("a payload above 2 MiB round-trips through the non-rename path", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            io = { open = function(p)
                return {
                    write = function(self, payload) files[p] = payload return self end,
                    close = function() return true end,
                }
            end }
            os = { rename = function() return false end, remove = function(p) files[p] = nil return true end }
            local payload = "{\\"blob\\":\\"" .. string.rep("x", 2097216) .. "\\"}"
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", payload)
            return tostring(ok) .. "|" .. tostring(files["virtual/data.json"] == payload) .. "|" .. tostring(#files["virtual/data.json"] == #payload)
        `);
        expect(result).toBe("true|true|true");
    });

    test("an unreadable previous file is not truncated", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            local targetOpens = 0
            readFile = function() return nil end
            fileExists = function(p) return files[p] ~= nil end
            io = { open = function(p)
                if p == "virtual/data.json" then targetOpens = targetOpens + 1 end
                return { write = function(self) return self end, close = function() return true end }
            end }
            os = { rename = function() return false end }
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. tostring(targetOpens) .. "|" .. files["virtual/data.json"]
        `);
        expect(result).toBe("false|0|OLDGOOD");
    });

    test("failed retries keep the original backup and a later write can recover", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            local failDest = true
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            io = { open = function(p)
                return {
                    write = function(self, payload)
                        if p == "virtual/data.json" and failDest then
                            files[p] = "BROKEN"
                            return nil, "destination and restore failure"
                        end
                        files[p] = payload
                        return self
                    end,
                    close = function() return true end,
                }
            end }
            os = { rename = function() return false end, remove = function(p) files[p] = nil return true end }
            local first = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            local second = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            local bakAfterFail = files["virtual/data.json.bak"]
            failDest = false
            local third = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(first) .. "|" .. tostring(second) .. "|" .. tostring(bakAfterFail)
                .. "|" .. tostring(third) .. "|" .. tostring(files["virtual/data.json"])
        `);
        expect(result).toBe("false|false|OLDGOOD|true|NEW");
    });

    test("three empty gameplay writes advance and a bootstrap unload does not replace them", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local writes = 0
            local lastClass = ""
            io = { open = function() end }
            FarmDashboardDataCollector._writeJsonStringToDisk = function(_, raw)
                writes = writes + 1
                if string.find(raw, '"exportClass"%s*:%s*"gameplay"') then lastClass = "gameplay" end
                if string.find(raw, '"exportClass"%s*:%s*"bootstrap"') then lastClass = "bootstrap" end
                return true
            end
            local empty = { fields = {}, vehicles = {}, animals = {}, weather = { temperature = 20 } }
            FarmDashboardDataCollector:writeDataToFile(empty, "gameplay")
            empty.weather.temperature = 21
            FarmDashboardDataCollector:writeDataToFile(empty, "gameplay")
            empty.weather.temperature = 22
            FarmDashboardDataCollector:writeDataToFile(empty, "gameplay")
            local afterGameplay = tostring(writes) .. "|" .. tostring(FarmDashboardDataCollector._completedGeneration)
            FarmDashboardDataCollector:writeDataToFile({ fields = { { id = 1 } }, vehicles = {}, animals = {} }, "gameplay")
            FarmDashboardDataCollector:writeDataToFile({ fields = {}, vehicles = {}, animals = {}, weather = { temperature = 0 } }, "gameplay")
            local afterEmpty = tostring(writes) .. "|" .. tostring(FarmDashboardDataCollector._completedGeneration) .. "|" .. lastClass
            FarmDashboardDataCollector:writeDataToFile({ fields = {}, vehicles = {}, animals = {} })
            return afterGameplay .. "|" .. afterEmpty .. "|" .. tostring(writes)
        `);
        expect(result).toBe("3|3|5|5|gameplay|5");
    });

    test("the zero-module heartbeat publishes an explicit gameplay snapshot", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local writes = 0
            local seenClass = ""
            _G.g_time = 1000
            _G.g_currentMission = {}
            FarmDashboardDataCollector._animalMode = "base"
            FarmDashboardDataCollector._dirtyPens = {}
            FarmDashboardDataCollector._cycleFresh = {}
            FarmDashboardDataCollector.moduleCache = {}
            FarmDashboardDataCollector.staggerFirstRunDone = false
            FarmDashboardDataCollector.getEnabledCollectorOrder = function() return {} end
            FarmDashboardDataCollector.shouldDeferCollectionWork = function() return false end
            FarmDashboardDataCollector._updateCollectionPauseLatch = function() end
            FarmDashboardDataCollector.assembleDataFromModuleCache = function()
                return { fields = {}, vehicles = {}, animals = {} }
            end
            FarmDashboardDataCollector._writeJsonStringToDisk = function(_, raw)
                writes = writes + 1
                if string.find(raw, '"exportClass": "gameplay"', 1, true)
                    or string.find(raw, '"exportClass":"gameplay"', 1, true) then seenClass = "gameplay" end
                return true
            end
            FarmDashboardDataCollector:_updateBody(16)
            return tostring(writes) .. "|" .. seenClass .. "|" .. tostring(FarmDashboardDataCollector._completedGeneration)
        `);
        expect(result).toBe("1|gameplay|1");
    });

    test("a deferred empty gameplay commit blocks a later bootstrap overwrite", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local writes = 0
            io = { open = function() end }
            FarmDashboardDataCollector._writeFileAtomic = function() return true end
            FarmDashboardDataCollector._writeJsonStringToDisk = function()
                writes = writes + 1
                return true
            end
            FarmDashboardDataCollector:beginDeferredJsonWrite({ fields = {}, vehicles = {}, animals = {}, weather = { temperature = 20 } })
            local guard = 0
            while FarmDashboardDataCollector._jsonWriteJob and guard < 30 do
                FarmDashboardDataCollector:jsonWriteStep()
                guard = guard + 1
            end
            FarmDashboardDataCollector:jsonDiskWriteStep()
            FarmDashboardDataCollector:writeDataToFile({ fields = {}, vehicles = {}, animals = {} })
            return tostring(writes) .. "|" .. tostring(FarmDashboardDataCollector._completedGeneration)
                .. "|" .. tostring(FarmDashboardDataCollector._wroteRichExport)
        `);
        expect(result).toBe("1|1|true");
    });

    test("an aborted queued snapshot loses to a newer submission", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local commits = {}
            io = { open = function() end }
            FarmDashboardDataCollector._writeJsonStringToDisk = function(_, raw)
                for _, marker in ipairs({ "A", "B", "C" }) do
                    if string.find(raw, '"marker": "' .. marker .. '"', 1, true)
                        or string.find(raw, '"marker":"' .. marker .. '"', 1, true) then
                        commits[#commits + 1] = marker
                    end
                end
                return true
            end
            local walker = FarmDashboardDataCollector._jsonWalkStep
            FarmDashboardDataCollector:beginDeferredJsonWrite({ marker = "A" })
            FarmDashboardDataCollector:beginDeferredJsonWrite({ marker = "B" })
            FarmDashboardDataCollector._jsonWalkStep = function() error("abort A") end
            FarmDashboardDataCollector:jsonWriteStep()
            FarmDashboardDataCollector._jsonWalkStep = walker
            local released = tostring(FarmDashboardDataCollector._activeCandidateGeneration == nil)
            FarmDashboardDataCollector:beginDeferredJsonWrite({ marker = "C" })
            local guard = 0
            while guard < 30 and (FarmDashboardDataCollector._jsonWriteJob or FarmDashboardDataCollector._jsonPendingDisk) do
                if FarmDashboardDataCollector._jsonWriteJob then
                    FarmDashboardDataCollector:jsonWriteStep()
                elseif FarmDashboardDataCollector._jsonPendingDisk then
                    FarmDashboardDataCollector:jsonDiskWriteStep()
                end
                guard = guard + 1
            end
            return released .. "|" .. table.concat(commits, ",") .. "|" .. tostring(FarmDashboardDataCollector._completedGeneration)
        `);
        expect(result).toBe("true|C|1");
    });

    test("an aborted successor is promoted on a later update when nothing newer arrives", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local commits = {}
            _G.g_time = 1000
            _G.g_currentMission = {}
            FarmDashboardDataCollector._animalMode = "base"
            FarmDashboardDataCollector._dirtyPens = {}
            FarmDashboardDataCollector._cycleFresh = {}
            FarmDashboardDataCollector.moduleCache = { fields = { { id = 1 } } }
            FarmDashboardDataCollector.staggerFirstRunDone = true
            FarmDashboardDataCollector.slotAccumulator = 0
            FarmDashboardDataCollector.getEnabledCollectorOrder = function() return { "fields" } end
            FarmDashboardDataCollector.shouldDeferCollectionWork = function() return false end
            FarmDashboardDataCollector._updateCollectionPauseLatch = function() end
            io = { open = function() end }
            FarmDashboardDataCollector._writeJsonStringToDisk = function(_, raw)
                if string.find(raw, '"marker": "B"', 1, true)
                    or string.find(raw, '"marker":"B"', 1, true) then commits[#commits + 1] = "B" end
                return true
            end
            local walker = FarmDashboardDataCollector._jsonWalkStep
            FarmDashboardDataCollector:beginDeferredJsonWrite({ marker = "A" })
            FarmDashboardDataCollector:beginDeferredJsonWrite({ marker = "B" })
            FarmDashboardDataCollector._jsonWalkStep = function() error("abort A") end
            FarmDashboardDataCollector:jsonWriteStep()
            FarmDashboardDataCollector._jsonWalkStep = walker
            local guard = 0
            while guard < 8 and #commits < 1 do
                FarmDashboardDataCollector:_updateBody(16)
                guard = guard + 1
            end
            return table.concat(commits, ",") .. "|" .. tostring(FarmDashboardDataCollector._jsonWritePending == nil)
        `);
        expect(result).toBe("B|true");
    });

    test("a newer snapshot during a disk retry replaces the queued successor", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local commits = {}
            io = { open = function() end }
            FarmDashboardDataCollector._writeFileAtomic = function() return true end
            FarmDashboardDataCollector._jsonPendingDisk = {
                jsonString = '{"marker":"DISK"}',
                savegameDir = "savegame3",
                generation = 1,
                session = 1,
            }
            FarmDashboardDataCollector._completedGeneration = 0
            FarmDashboardDataCollector:beginDeferredJsonWrite({ marker = "B" })
            FarmDashboardDataCollector:beginDeferredJsonWrite({ marker = "C" })
            FarmDashboardDataCollector._writeJsonStringToDisk = function(_, raw)
                for _, marker in ipairs({ "B", "C", "DISK" }) do
                    if string.find(raw, '"marker": "' .. marker .. '"', 1, true)
                        or string.find(raw, '"marker":"' .. marker .. '"', 1, true) then
                        commits[#commits + 1] = marker
                    end
                end
                return true
            end
            FarmDashboardDataCollector:jsonDiskWriteStep()
            local guard = 0
            while FarmDashboardDataCollector._jsonWriteJob and guard < 20 do
                FarmDashboardDataCollector:jsonWriteStep()
                guard = guard + 1
            end
            local queuedMarker = "none"
            local raw = FarmDashboardDataCollector._jsonPendingDisk and FarmDashboardDataCollector._jsonPendingDisk.jsonString or ""
            if string.find(raw, '"marker": "C"', 1, true)
                or string.find(raw, '"marker":"C"', 1, true) then queuedMarker = "C" end
            if string.find(raw, '"marker": "B"', 1, true)
                or string.find(raw, '"marker":"B"', 1, true) then queuedMarker = "B" end
            return table.concat(commits, ",") .. "|" .. queuedMarker
        `);
        expect(result).toBe("DISK|C");
    });
});

describe("production recovery isolation", () => {
    test("a dirty-pen index write does not replace the authority backup", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local base = "virtual/modSettings/FS25_FarmDashboard/savegame3/"
            local target = base .. "data.json"
            local old = '{"exportGeneration":7,"marker":"LAST_GOOD"}'
            local files = { [target] = old }
            local denyTarget = true
            getUserProfileAppPath = function() return "virtual/" end
            FarmDashboardDataCollector._detailLedger = {}
            FarmDashboardDataCollector._idScheme = "test"
            FarmDashboardDataCollector._animalMode = "vanilla"
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            os = { remove = function(p) files[p] = nil return true end }
            io = { open = function(p)
                files[p] = ""
                return {
                    write = function(self, text)
                        if p == target and denyTarget then files[p] = "BROKEN" return nil, "fail" end
                        files[p] = text
                        return self
                    end,
                    close = function() return true end,
                }
            end }
            local first = FarmDashboardDataCollector:_writeFileAtomic(target, '{"marker":"NEW"}')
            FarmDashboardDataCollector:_writeDirtyPensIndex()
            local second = FarmDashboardDataCollector:_writeFileAtomic(target, '{"marker":"NEW"}')
            local index = files[base .. "dirtyPens.json"]
            return tostring(first) .. "|" .. tostring(files[target .. ".bak"] == old)
                .. "|" .. tostring(type(index) == "string" and #index > 0)
                .. "|" .. tostring(second) .. "|" .. tostring(files[target .. ".bak"] == old)
        `);
        expect(result).toBe("false|true|true|false|true");
    });

    test("an authority success leaves an unresolved auxiliary backup in place", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/notes.json"] = "NOTES", ["virtual/data.json"] = "AUTH" }
            local deny = { ["virtual/notes.json"] = true }
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            os = { remove = function(p) files[p] = nil return true end, rename = function() return false end }
            io = { open = function(p)
                return {
                    write = function(self, text)
                        if deny[p] then files[p] = "BROKEN" return nil, "fail" end
                        files[p] = text
                        return self
                    end,
                    close = function() return true end,
                }
            end }
            local aux = FarmDashboardDataCollector:_writeFileAtomic("virtual/notes.json", "AUXNEW")
            local auth = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "AUTHNEW")
            return tostring(aux) .. "|" .. tostring(auth)
                .. "|" .. tostring(files["virtual/notes.json.bak"]) .. "|" .. tostring(files["virtual/data.json"])
        `);
        expect(result).toBe("false|true|NOTES|AUTHNEW");
    });

    test("interleaved failures do not swap backups, and a cleared fault can recover", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/a.json"] = "OLD_A", ["virtual/b.json"] = "OLD_B" }
            local deny = { ["virtual/a.json"] = true, ["virtual/b.json"] = true }
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            os = { remove = function(p) files[p] = nil return true end, rename = function() return false end }
            io = { open = function(p)
                return {
                    write = function(self, text)
                        if deny[p] then files[p] = "BROKEN" return nil, "fail" end
                        files[p] = text
                        return self
                    end,
                    close = function() return true end,
                }
            end }
            FarmDashboardDataCollector:_writeFileAtomic("virtual/a.json", "NEW_A")
            FarmDashboardDataCollector:_writeFileAtomic("virtual/b.json", "NEW_B")
            FarmDashboardDataCollector:_writeFileAtomic("virtual/a.json", "NEW_A")
            local kept = tostring(files["virtual/a.json.bak"]) .. "|" .. tostring(files["virtual/b.json.bak"])
            deny["virtual/a.json"] = nil
            local recovered = FarmDashboardDataCollector:_writeFileAtomic("virtual/a.json", "NEW_A")
            return kept .. "|" .. tostring(recovered) .. "|" .. tostring(files["virtual/a.json"])
                .. "|" .. tostring(files["virtual/b.json.bak"])
        `);
        expect(result).toBe("OLD_A|OLD_B|true|NEW_A|OLD_B");
    });

    test("a full auxiliary registry refuses another file without evicting a backup", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = {}
            local destOpens = {}
            for i = 1, 9 do files["virtual/aux" .. i .. ".json"] = "KEEP" .. i end
            files["virtual/data.json"] = "AUTH"
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            os = { remove = function(p) files[p] = nil return true end, rename = function() return false end }
            io = { open = function(p)
                local side = string.sub(p, -4) == ".tmp" or string.sub(p, -4) == ".bak"
                if not side then destOpens[p] = (destOpens[p] or 0) + 1 end
                return {
                    write = function(self, text)
                        if not side and string.sub(p, -10) ~= "/data.json" and p ~= "virtual/data.json" then
                            return nil, "fail"
                        end
                        files[p] = text
                        return self
                    end,
                    close = function() return true end,
                }
            end }
            for i = 1, 8 do
                FarmDashboardDataCollector:_writeFileAtomic("virtual/aux" .. i .. ".json", "NEW")
            end
            local ninth = FarmDashboardDataCollector:_writeFileAtomic("virtual/aux9.json", "NEW")
            local auth = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "AUTHNEW")
            return tostring(ninth) .. "|" .. tostring(destOpens["virtual/aux9.json"] or 0)
                .. "|" .. tostring(files["virtual/aux1.json.bak"]) .. "|" .. tostring(auth)
                .. "|" .. tostring(files["virtual/data.json"]) .. "|" .. tostring(files["virtual/aux1.json.bak"])
        `);
        expect(result).toBe("false|0|KEEP1|true|AUTHNEW|KEEP1");
    });

    test("session reset drops in-memory recovery without reusing it on another path", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLD", ["virtual/other.json"] = "OTHER" }
            local deny = { ["virtual/data.json"] = true }
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            os = { remove = function(p) files[p] = nil return true end, rename = function() return false end }
            io = { open = function(p)
                return {
                    write = function(self, text)
                        if deny[p] then files[p] = "BROKEN" return nil, "fail" end
                        files[p] = text
                        return self
                    end,
                    close = function() return true end,
                }
            end }
            FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            local bakBefore = files["virtual/data.json.bak"]
            FarmDashboardDataCollector:resetStaggerState()
            local cleared = FarmDashboardDataCollector._recoveryByTarget == nil
            local other = FarmDashboardDataCollector:_writeFileAtomic("virtual/other.json", "FRESH")
            return tostring(bakBefore) .. "|" .. tostring(cleared) .. "|" .. tostring(other)
                .. "|" .. tostring(files["virtual/other.json"]) .. "|" .. tostring(files["virtual/data.json.bak"])
                .. "|" .. tostring(files["virtual/other.json.bak"])
        `);
        expect(result).toBe("OLD|true|true|FRESH|OLD|OTHER");
    });

    test("a stale session drop does not clear current-session recovery for another target", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            FarmDashboardDataCollector._exportSession = 2
            FarmDashboardDataCollector._recoveryByTarget = {
                ["virtual/keep.json"] = { session = 2, untrusted = true, backup = "KEEP", status = "complete" },
                ["virtual/old.json"] = { session = 1, untrusted = true, backup = "OLD", status = "complete" },
            }
            FarmDashboardDataCollector._jsonPendingDisk = {
                jsonString = "stale",
                savegameDir = "savegame1",
                generation = 1,
                session = 1,
            }
            FarmDashboardDataCollector._writeJsonStringToDisk = function() return true end
            FarmDashboardDataCollector:jsonDiskWriteStep()
            local keep = FarmDashboardDataCollector._recoveryByTarget["virtual/keep.json"]
            local old = FarmDashboardDataCollector._recoveryByTarget["virtual/old.json"]
            return tostring(keep and keep.backup) .. "|" .. tostring(old)
        `);
        expect(result).toBe("KEEP|nil");
    });

    test("unknown, missing, and ambiguous presence never opens an existing destination", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            local opens = 0
            readFile = function(p) return files[p] end
            os = { rename = function() return false end, remove = function() return true end }
            io = { open = function(p)
                if p == "virtual/data.json" then opens = opens + 1 end
                return { write = function(self, text) files[p] = text return self end, close = function() return true end }
            end }
            fileExists = function(p) if p == "virtual/data.json" then error("thrown") end return false end
            local thrown = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            local afterThrow = tostring(thrown) .. "|" .. files["virtual/data.json"] .. "|" .. tostring(opens)
            FarmDashboardDataCollector._recoveryByTarget = nil
            fileExists = nil
            local missing = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            local afterMissing = tostring(missing) .. "|" .. files["virtual/data.json"] .. "|" .. tostring(opens)
            FarmDashboardDataCollector._recoveryByTarget = nil
            fileExists = function() return 0 end
            local ambiguous = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return afterThrow .. "|" .. afterMissing .. "|" .. tostring(ambiguous)
                .. "|" .. files["virtual/data.json"] .. "|" .. tostring(opens)
        `);
        expect(result).toBe("false|OLDGOOD|0|false|OLDGOOD|0|false|OLDGOOD|0");
    });

    test("a known-absent file can be created and a known-present file can be replaced", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/present.json"] = "OLD" }
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            os = { rename = function() return false end, remove = function(p) files[p] = nil return true end }
            io = { open = function(p)
                return { write = function(self, text) files[p] = text return self end, close = function() return true end }
            end }
            local created = FarmDashboardDataCollector:_writeFileAtomic("virtual/fresh.json", "CREATED")
            local replaced = FarmDashboardDataCollector:_writeFileAtomic("virtual/present.json", "REPLACED")
            return tostring(created) .. "|" .. tostring(files["virtual/fresh.json"])
                .. "|" .. tostring(replaced) .. "|" .. tostring(files["virtual/present.json"])
                .. "|" .. tostring(files["virtual/present.json.bak"])
        `);
        expect(result).toBe("true|CREATED|true|REPLACED|OLD");
    });

    test("a safety refusal does not let saveFile overwrite the destination", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local path = "virtual/data.json"
            local files = { [path] = "OLDGOOD" }
            local saveCalls = 0
            local opens = 0
            readFile = function(p) return files[p] end
            fileExists = function(p)
                if p == path then error("presence unavailable") end
                return files[p] ~= nil
            end
            os = { rename = function() return false end, remove = function() return true end }
            io = { open = function(p)
                if p == path then opens = opens + 1 end
                return { write = function(self, text) files[p] = text return self end, close = function() return true end }
            end }
            _G.saveFile = function() saveCalls = saveCalls + 1 return true end
            FarmDashboardDataCollector._completedGeneration = 4
            local ok = FarmDashboardDataCollector:_writeJsonStringToDisk('{"marker":"NEW"}', "savegame3")
            return tostring(ok) .. "|" .. tostring(saveCalls) .. "|" .. tostring(opens)
                .. "|" .. files[path] .. "|" .. tostring(FarmDashboardDataCollector._completedGeneration)
        `);
        expect(result).toBe("false|0|0|OLDGOOD|4");
    });

    test("a temporary presence or read failure recovers on the next attempt", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLD" }
            local presenceDown = true
            local readDown = false
            readFile = function(p)
                if readDown and (p == "virtual/data.json" or p == "virtual/read.json") then return nil end
                return files[p]
            end
            fileExists = function(p)
                if p == "virtual/data.json" and presenceDown then error("temporary") end
                return files[p] ~= nil
            end
            os = { rename = function() return false end, remove = function(p) files[p] = nil return true end }
            io = { open = function(p)
                return { write = function(self, text) files[p] = text return self end, close = function() return true end }
            end }
            local first = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            local preserved = files["virtual/data.json"]
            presenceDown = false
            local second = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            local afterPresence = tostring(first) .. "|" .. preserved .. "|" .. tostring(second)
                .. "|" .. tostring(files["virtual/data.json"]) .. "|" .. tostring(files["virtual/data.json.bak"])
            files["virtual/read.json"] = "OLDREAD"
            readDown = true
            local readFirst = FarmDashboardDataCollector:_writeFileAtomic("virtual/read.json", "NEWREAD")
            local readPreserved = files["virtual/read.json"]
            readDown = false
            local readSecond = FarmDashboardDataCollector:_writeFileAtomic("virtual/read.json", "NEWREAD")
            return afterPresence .. "|" .. tostring(readFirst) .. "|" .. readPreserved
                .. "|" .. tostring(readSecond) .. "|" .. tostring(files["virtual/read.json"])
                .. "|" .. tostring(files["virtual/read.json.bak"])
        `);
        expect(result).toBe("false|OLD|true|NEW|OLD|false|OLDREAD|true|NEWREAD|OLDREAD");
    });

    test("backup denial is retried before any destination change, including saveFile", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLD" }
            local destOpens = 0
            local renames = 0
            local saveCalls = 0
            local mode = "open-deny"
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            os = {
                rename = function(_, dst)
                    if dst == "virtual/data.json" then renames = renames + 1 end
                    return false
                end,
                remove = function(p) files[p] = nil return true end,
            }
            io = { open = function(p)
                if p == "virtual/data.json" then destOpens = destOpens + 1 end
                if mode ~= "ok" and (p == "virtual/data.json.bak" or p == "virtual/data.json.bak.tmp") then
                    if mode == "open-deny" then return nil, "denied" end
                    return {
                        write = function() return nil, "write denied" end,
                        close = function() return nil, "close denied" end,
                    }
                end
                return { write = function(self, text) files[p] = text return self end, close = function() return true end }
            end }
            _G.saveFile = function() saveCalls = saveCalls + 1 return true end
            local first = FarmDashboardDataCollector:_writeJsonStringToDisk("NEW", "savegame3")
            local second = FarmDashboardDataCollector:_writeJsonStringToDisk("NEW", "savegame3")
            local whileOpenDenied = tostring(first) .. "|" .. tostring(second) .. "|" .. tostring(destOpens)
                .. "|" .. tostring(renames) .. "|" .. tostring(saveCalls) .. "|" .. files["virtual/data.json"]
            FarmDashboardDataCollector._recoveryByTarget = nil
            mode = "write-deny"
            destOpens = 0
            renames = 0
            local third = FarmDashboardDataCollector:_writeJsonStringToDisk("NEW", "savegame3")
            local whileWriteDenied = tostring(third) .. "|" .. tostring(destOpens) .. "|" .. tostring(renames)
                .. "|" .. tostring(saveCalls) .. "|" .. files["virtual/data.json"]
            mode = "ok"
            local recovered = FarmDashboardDataCollector:_writeJsonStringToDisk("NEW", "savegame3")
            return whileOpenDenied .. "|" .. whileWriteDenied .. "|" .. tostring(recovered)
                .. "|" .. tostring(files["virtual/data.json"]) .. "|" .. tostring(files["virtual/data.json.bak"])
                .. "|" .. tostring(saveCalls)
        `);
        expect(result).toBe("false|false|0|0|0|OLD|false|0|0|0|OLD|true|NEW|OLD|0");
    });

    test("a deferred export retries a transient preflight and commits once", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLD" }
            local presenceDown = true
            local commits = 0
            readFile = function(p) return files[p] end
            fileExists = function(p)
                if p == "virtual/data.json" and presenceDown then error("temporary") end
                return files[p] ~= nil
            end
            os = { rename = function() return false end, remove = function(p) files[p] = nil return true end }
            io = { open = function(p)
                return { write = function(self, text) files[p] = text return self end, close = function() return true end }
            end }
            Logging.info = function(msg)
                if type(msg) == "string" and string.find(msg, "export committed", 1, true) then
                    commits = commits + 1
                end
            end
            _G.g_time = 0
            FarmDashboardDataCollector._completedGeneration = 0
            FarmDashboardDataCollector._jsonPendingDisk = {
                jsonString = "NEWPAYLOAD",
                savegameDir = "savegame3",
                generation = 3,
                session = 1,
            }
            local first = FarmDashboardDataCollector:jsonDiskWriteStep()
            presenceDown = false
            _G.g_time = 250
            local second = FarmDashboardDataCollector:jsonDiskWriteStep()
            local third = FarmDashboardDataCollector:jsonDiskWriteStep()
            return tostring(first) .. "|" .. tostring(second) .. "|" .. tostring(third)
                .. "|" .. tostring(commits) .. "|" .. tostring(FarmDashboardDataCollector._completedGeneration)
                .. "|" .. tostring(FarmDashboardDataCollector._jsonPendingDisk == nil)
                .. "|" .. tostring(files["virtual/data.json"])
        `);
        expect(result).toBe("false|true|true|1|3|true|NEWPAYLOAD");
    });

    test("a failed first creation does not keep the partial file as the backup", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = {}
            local attempt = 0
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            os = { rename = function() return false end, remove = function(p) files[p] = nil return true end }
            io = { open = function(p)
                return {
                    write = function(self, text)
                        if p == "virtual/fresh.json" then
                            attempt = attempt + 1
                            if attempt == 1 then
                                files[p] = "PARTIAL"
                                return nil, "short write"
                            end
                        end
                        files[p] = text
                        return self
                    end,
                    close = function() return true end,
                }
            end }
            local first = FarmDashboardDataCollector:_writeFileAtomic("virtual/fresh.json", "COMPLETE")
            local second = FarmDashboardDataCollector:_writeFileAtomic("virtual/fresh.json", "COMPLETE")
            return tostring(first) .. "|" .. tostring(second)
                .. "|" .. tostring(files["virtual/fresh.json"])
                .. "|" .. tostring(files["virtual/fresh.json.bak"])
        `);
        expect(result).toBe("false|true|COMPLETE|nil");
    });

    function voidHost(extra) {
        return `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            local destOpens = 0
            local closes = 0
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            os = {
                rename = function(a, b) files[b] = files[a]; files[a] = nil; return true end,
                remove = function(p) files[p] = nil; return true end,
            }
            io = { open = function(p)
                if p == "virtual/data.json" then destOpens = destOpens + 1 end
                return {
                    write = function(self, payload)
                        files[p] = payload
                    end,
                    close = function()
                        closes = closes + 1
                    end,
                }
            end }
            ${extra || ""}
        `;
    }

    test("a void write with matching bytes publishes and leaves the old file backed up", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${voidHost(`
                io.open = function(p)
                    return {
                        write = function(self, payload)
                            files[p] = payload
                            if p:sub(-4) ~= ".tmp" then return self end
                        end,
                        close = function() return true end,
                    }
                end
            `)}
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. tostring(files["virtual/data.json"]) .. "|" .. tostring(files["virtual/data.json.bak"])
        `);
        expect(result).toBe("true|NEW|OLDGOOD");
    });

    test("a void close with matching bytes publishes", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${voidHost(`
                io.open = function(p)
                    return {
                        write = function(self, payload) files[p] = payload; return self end,
                        close = function() end,
                    }
                end
            `)}
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. tostring(files["virtual/data.json"])
        `);
        expect(result).toBe("true|NEW");
    });

    test("void write and void close together publish the closed bytes", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${voidHost("")}
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. tostring(files["virtual/data.json"]) .. "|" .. tostring(closes >= 1)
        `);
        expect(result).toBe("true|NEW|true");
    });

    test("a false write result does not replace the previous file", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${voidHost(`
                io.open = function(p)
                    return {
                        write = function() return false, "denied" end,
                        close = function() closes = closes + 1; return true end,
                    }
                end
            `)}
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. files["virtual/data.json"] .. "|" .. tostring(closes)
        `);
        expect(result).toBe("false|OLDGOOD|1");
    });

    test("truncated bytes after an apparently successful write do not replace the previous file", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${voidHost(`
                io.open = function(p)
                    if p == "virtual/data.json" then destOpens = destOpens + 1 end
                    return {
                        write = function(self, payload)
                            files[p] = string.sub(payload, 1, 3)
                            return self
                        end,
                        close = function() return true end,
                    }
                end
            `)}
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEWPAYLOAD")
            return tostring(ok) .. "|" .. files["virtual/data.json"] .. "|" .. tostring(destOpens)
        `);
        expect(result).toBe("false|OLDGOOD|0");
    });

    test("a void close that leaves truncated bytes does not replace the previous file", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${voidHost(`
                io.open = function(p)
                    if p == "virtual/data.json" then destOpens = destOpens + 1 end
                    return {
                        write = function(self, payload) files[p] = payload end,
                        close = function()
                            files[p] = string.sub(files[p] or "", 1, 2)
                        end,
                    }
                end
            `)}
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEWPAYLOAD")
            return tostring(ok) .. "|" .. files["virtual/data.json"] .. "|" .. tostring(destOpens)
        `);
        expect(result).toBe("false|OLDGOOD|0");
    });

    test("a missing readFile leaves the authoritative file untouched", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${voidHost(`
                readFile = nil
                io.open = function(p, mode)
                    if mode ~= nil and mode ~= "w" then error("read mode") end
                    if p == "virtual/data.json" then destOpens = destOpens + 1 end
                    return {
                        write = function(self, payload) files[p] = payload end,
                        close = function() end,
                    }
                end
            `)}
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. files["virtual/data.json"] .. "|" .. tostring(destOpens)
        `);
        expect(result).toBe("false|OLDGOOD|0");
    });

    test("a throwing readFile does not open the authoritative file", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${voidHost(`
                readFile = function() error("mid-read") end
            `)}
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. files["virtual/data.json"] .. "|" .. tostring(destOpens)
        `);
        expect(result).toBe("false|OLDGOOD|0");
    });

    test("a nil read error does not open the authoritative file", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${voidHost(`
                readFile = function() return nil, "mid-file" end
            `)}
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. files["virtual/data.json"] .. "|" .. tostring(destOpens)
        `);
        expect(result).toBe("false|OLDGOOD|0");
    });

    test("an empty payload is a complete publish when the closed file is empty", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${voidHost(`
                files["virtual/data.json"] = nil
            `)}
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "")
            return tostring(ok) .. "|" .. tostring(files["virtual/data.json"] == "")
        `);
        expect(result).toBe("true|true");
    });

    test("a failed destination write restores a backup larger than 2 MiB", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local previous = string.rep("Q", 2100000)
            local files = { ["virtual/data.json"] = previous }
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            os = { rename = function() return false end, remove = function(p) files[p] = nil; return true end }
            io = { open = function(p)
                return {
                    write = function(self, payload)
                        if p == "virtual/data.json" and payload == "NEW" then
                            files[p] = "PARTIAL"
                            return nil, "disk full"
                        end
                        files[p] = payload
                    end,
                    close = function() end,
                }
            end }
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. tostring(files["virtual/data.json"] == previous) .. "|" .. tostring(files["virtual/data.json.bak"] == previous)
        `);
        expect(result).toBe("false|true|true");
    });

    test("a verified stage still refuses a throwing destination write and restores the previous file", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            local destWrites = 0
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            os = { rename = function() return false end, remove = function(p) files[p] = nil; return true end }
            io = { open = function(p)
                return {
                    write = function(self, payload)
                        if p == "virtual/data.json" then
                            destWrites = destWrites + 1
                            if destWrites == 1 then error("destination write failed") end
                        end
                        files[p] = payload
                    end,
                    close = function() return true end,
                }
            end }
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. tostring(files["virtual/data.json"]) .. "|" .. tostring(files["virtual/data.json.bak"])
        `);
        expect(result).toBe("false|OLDGOOD|OLDGOOD");
    });

    test("a throwing write still closes the handle once", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${voidHost(`
                io.open = function()
                    return {
                        write = function() error("write threw") end,
                        close = function() closes = closes + 1; return true end,
                    }
                end
            `)}
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. files["virtual/data.json"] .. "|" .. tostring(closes)
        `);
        expect(result).toBe("false|OLDGOOD|1");
    });

    test("diagnostics-off failures warn once and a later success logs recovery once", () => {
        const result = runProduction(["FarmDashLog.lua", "FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local warnings = {}
            Logging.warning = function(msg) warnings[#warnings + 1] = msg end
            Logging.info = function() end
            _G.g_time = 0
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            local mode = "fail"
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            os = {
                rename = function(a, b) files[b] = files[a]; files[a] = nil; return true end,
                remove = function(p) files[p] = nil; return true end,
            }
            io = { open = function(p)
                return {
                    write = function(self, payload)
                        if mode == "fail" then return nil, "disk full" end
                        files[p] = payload
                    end,
                    close = function() end,
                }
            end }
            FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            _G.g_time = 1000
            FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            _G.g_time = 2000
            FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            local first = #warnings
            mode = "ok"
            _G.g_time = 3000
            local recovered = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            local mid = #warnings
            mode = "fail"
            files["virtual/data.json"] = "NEW"
            _G.g_time = 4000
            FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "AGAIN")
            local held = #warnings
            _G.g_time = 80000
            FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "AGAIN")
            local last = warnings[#warnings] or ""
            local visible = string.find(warnings[1] or "", "write failure: write(", 1, true) ~= nil
            local recovery = string.find(warnings[2] or "", "export write recovered:", 1, true) ~= nil
            return tostring(first) .. "|" .. tostring(mid) .. "|" .. tostring(held) .. "|" .. tostring(#warnings)
                .. "|" .. tostring(visible) .. "|" .. tostring(recovery) .. "|" .. tostring(recovered)
                .. "|" .. tostring(files["virtual/data.json"])
                .. "|" .. tostring(string.find(last, "write failure: write(", 1, true) ~= nil)
        `);
        expect(result).toBe("1|2|3|4|true|true|true|NEW|true");
    });

    test("a partial read plus an error does not replace or back up the old file", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            local reads = 0
            local destOpens = 0
            readFile = function(p)
                if p == "virtual/data.json" then
                    reads = reads + 1
                    if reads == 1 then return "OLD", "mid-file read failure" end
                end
                return files[p]
            end
            fileExists = function(p) return files[p] ~= nil end
            os = { rename = function() return false end, remove = function(p) files[p] = nil; return true end }
            io = { open = function(p)
                if p == "virtual/data.json" then destOpens = destOpens + 1 end
                files[p] = ""
                return {
                    write = function(self, payload)
                        if p == "virtual/data.json" and payload == "NEW" then
                            files[p] = "PARTIAL"
                            return nil, "disk full"
                        end
                        files[p] = payload
                    end,
                    close = function() end,
                }
            end }
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. tostring(files["virtual/data.json"]) .. "|" .. tostring(files["virtual/data.json.bak"]) .. "|" .. tostring(destOpens)
        `);
        expect(result).toBe("false|OLDGOOD|nil|0");
    });

    test("a stage read error is not success even when the partial bytes match", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            local destOpens = 0
            readFile = function(p)
                if string.sub(p, -4) == ".tmp" then return "NEW", "stage short" end
                return files[p]
            end
            fileExists = function(p) return files[p] ~= nil end
            os = { rename = function() return true end }
            io = { open = function(p)
                if p == "virtual/data.json" then destOpens = destOpens + 1 end
                return {
                    write = function(self, payload) files[p] = payload end,
                    close = function() end,
                }
            end }
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. files["virtual/data.json"] .. "|" .. tostring(destOpens)
        `);
        expect(result).toBe("false|OLDGOOD|0");
    });

    test("a backup read error does not open the authoritative file", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            local destOpens = 0
            readFile = function(p)
                if string.find(p, ".bak", 1, true) then return "OLD", "bak short" end
                return files[p]
            end
            fileExists = function(p) return files[p] ~= nil end
            os = { rename = function() return false end, remove = function(p) files[p] = nil; return true end }
            io = { open = function(p)
                if p == "virtual/data.json" then destOpens = destOpens + 1 end
                return {
                    write = function(self, payload) files[p] = payload end,
                    close = function() end,
                }
            end }
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. files["virtual/data.json"] .. "|" .. tostring(files["virtual/data.json.bak"]) .. "|" .. tostring(destOpens)
        `);
        expect(result).toBe("false|OLDGOOD|nil|0");
    });

    test("a post-replacement read error does not count as success or reopen the file", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            local destOpens = 0
            readFile = function(p)
                if p == "virtual/data.json" and files[p] == "NEW" then return "NEW", "after short" end
                return files[p]
            end
            fileExists = function(p) return files[p] ~= nil end
            os = {
                rename = function(a, b) files[b] = files[a]; files[a] = nil; return true end,
                remove = function(p) files[p] = nil; return true end,
            }
            io = { open = function(p)
                if p == "virtual/data.json" then destOpens = destOpens + 1 end
                return {
                    write = function(self, payload) files[p] = payload end,
                    close = function() end,
                }
            end }
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            return tostring(ok) .. "|" .. tostring(files["virtual/data.json"]) .. "|" .. tostring(files["virtual/data.json.bak"]) .. "|" .. tostring(destOpens)
        `);
        expect(result).toBe("false|NEW|OLDGOOD|0");
    });

    test("an auxiliary success does not recover an unrelated target", () => {
        const result = runProduction(["FarmDashLog.lua", "FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local warnings = {}
            Logging.warning = function(msg) warnings[#warnings + 1] = msg end
            Logging.info = function() end
            FarmDashLog._errLast["sentinel"] = 1
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            os = { rename = function() return false end, remove = function(p) files[p] = nil; return true end }
            local opening = function(p)
                files[p] = ""
                return { write = function(self, payload) files[p] = payload end, close = function() end }
            end
            io = { open = function(p)
                if p == "virtual/data.json.tmp" then
                    return { write = function() return nil, "disk full" end, close = function() end }
                end
                return opening(p)
            end }
            local a = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            local b = FarmDashboardDataCollector:_writeFileAtomic("virtual/dirtyPens.json", "INDEX")
            local recovery = 0
            for _, msg in ipairs(warnings) do
                if string.find(msg, "export write recovered", 1, true) then recovery = recovery + 1 end
            end
            return tostring(a) .. "|" .. tostring(b) .. "|" .. tostring(recovery) .. "|" .. tostring(FarmDashLog._errLast["sentinel"])
        `);
        expect(result).toBe("false|true|0|1");
    });

    test("a new session does not report recovery for the previous career", () => {
        const result = runProduction(["FarmDashLog.lua", "FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local warnings = {}
            Logging.warning = function(msg) warnings[#warnings + 1] = msg end
            Logging.info = function() end
            FarmDashLog._errLast["sentinel"] = 7
            local files = { ["virtual/data.json"] = "OLDGOOD" }
            local failing = true
            readFile = function(p) return files[p] end
            fileExists = function(p) return files[p] ~= nil end
            os = {
                rename = function(a, b) files[b] = files[a]; files[a] = nil; return true end,
                remove = function(p) files[p] = nil; return true end,
            }
            io = { open = function(p)
                return {
                    write = function(self, payload)
                        if failing and string.sub(p, -4) == ".tmp" then return nil, "disk full" end
                        files[p] = payload
                    end,
                    close = function() end,
                }
            end }
            _G.g_time = 0
            FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            FarmDashboardDataCollector:resetStaggerState()
            FarmDashboardDataCollector.getSavegameDirName = function() return "savegame3" end
            FarmDashboardDataCollector.getDataOutputDir = function() return "virtual/" end
            FarmDashboardDataCollector._activeTmpPaths = {}
            failing = false
            _G.g_time = 1000
            local ok = FarmDashboardDataCollector:_writeFileAtomic("virtual/data.json", "NEW")
            local recovery = 0
            for _, msg in ipairs(warnings) do
                if string.find(msg, "export write recovered", 1, true) then recovery = recovery + 1 end
            end
            return tostring(ok) .. "|" .. tostring(recovery) .. "|" .. tostring(FarmDashLog._errLast["sentinel"])
        `);
        expect(result).toBe("true|0|7");
    });

    test("a thousand active failure targets stay within the episode cap", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local warnings = {}
            Logging.warning = function(msg) warnings[#warnings + 1] = msg end
            _G.g_time = 0
            for i = 1, 1000 do
                FarmDashboardDataCollector:_logWriteFail("virtual/animals_" .. i .. ".json", "open", "failed", "disk full")
            end
            local n = 0
            for _ in pairs(FarmDashboardDataCollector._writeEpisodes or {}) do n = n + 1 end
            local overflow = 0
            for _, msg in ipairs(warnings) do
                if string.find(msg, "write failure overflow:", 1, true) then overflow = overflow + 1 end
            end
            local bounded = n <= 32 and "bounded" or ("entries=" .. n)
            return bounded .. "|" .. tostring(#warnings < 40) .. "|" .. tostring(overflow)
        `);
        expect(result).toBe("bounded|true|1");
    });

    test("authority failure tracking remains when auxiliary slots are full", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            Logging.warning = function() end
            _G.g_time = 0
            for i = 1, 1000 do
                FarmDashboardDataCollector:_logWriteFail("virtual/animals_" .. i .. ".json", "open", "failed", "disk full")
            end
            FarmDashboardDataCollector:_logWriteFail("virtual/data.json", "write", "error", "disk full")
            local n = 0
            for _ in pairs(FarmDashboardDataCollector._writeEpisodes or {}) do n = n + 1 end
            local has = FarmDashboardDataCollector._writeEpisodes["1|virtual/data.json"] ~= nil
            return tostring(has) .. "|" .. (n <= 32 and "bounded" or ("entries=" .. n))
        `);
        expect(result).toBe("true|bounded");
    });

    test("a thousand authority-shaped paths stay inside the episode cap", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            Logging.warning = function() end
            _G.g_time = 0
            for i = 1, 1000 do
                FarmDashboardDataCollector:_logWriteFail("virtual/savegame" .. i .. "/data.json", "open", "failed", "disk full")
            end
            FarmDashboardDataCollector:_logWriteFail("virtual/data.json", "write", "error", "disk full")
            local n = 0
            for _ in pairs(FarmDashboardDataCollector._writeEpisodes or {}) do n = n + 1 end
            local has = FarmDashboardDataCollector._writeEpisodes["1|virtual/data.json"] ~= nil
            local bounded = n <= 32 and "bounded" or ("entries=" .. n)
            return bounded .. "|" .. tostring(has)
        `);
        expect(result).toBe("bounded|true");
    });

    test("mixed auxiliary and authority-shaped failures stay bounded", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            Logging.warning = function() end
            _G.g_time = 0
            for i = 1, 20 do
                FarmDashboardDataCollector:_logWriteFail("virtual/animals_" .. i .. ".json", "open", "failed", "disk full")
            end
            for i = 1, 20 do
                FarmDashboardDataCollector:_logWriteFail("virtual/savegame" .. i .. "/data.json", "open", "failed", "disk full")
            end
            local episodes = FarmDashboardDataCollector._writeEpisodes or {}
            local n = 0
            for _ in pairs(episodes) do n = n + 1 end
            local hasAux = episodes["1|virtual/animals_1.json"] ~= nil
            local hasShaped = episodes["1|virtual/savegame1/data.json"] ~= nil
            return tostring(hasAux) .. "|" .. tostring(hasShaped) .. "|" .. (n <= 32 and "bounded" or ("entries=" .. n))
        `);
        expect(result).toBe("true|true|bounded");
    });

    test("session reset clears authority-shaped episodes and admits the real target", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            Logging.warning = function() end
            _G.g_time = 0
            for i = 1, 1000 do
                FarmDashboardDataCollector:_logWriteFail("virtual/savegame" .. i .. "/data.json", "open", "failed", "disk full")
            end
            FarmDashboardDataCollector:resetStaggerState()
            local n = 0
            if type(FarmDashboardDataCollector._writeEpisodes) == "table" then
                for _ in pairs(FarmDashboardDataCollector._writeEpisodes) do n = n + 1 end
            end
            FarmDashboardDataCollector:_logWriteFail("virtual/data.json", "write", "error", "disk full")
            local episodes = FarmDashboardDataCollector._writeEpisodes or {}
            local has = episodes["2|virtual/data.json"] ~= nil
            return tostring(n) .. "|" .. tostring(has)
        `);
        expect(result).toBe("0|true");
    });

    test("a resolved episode slot admits a new target", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            Logging.warning = function() end
            _G.g_time = 0
            for i = 1, 1000 do
                FarmDashboardDataCollector:_logWriteFail("virtual/animals_" .. i .. ".json", "open", "failed", "disk full")
            end
            FarmDashboardDataCollector:_noteWriteRecovered("virtual/animals_1.json")
            FarmDashboardDataCollector:_logWriteFail("virtual/animals_new.json", "open", "failed", "disk full")
            local episodes = FarmDashboardDataCollector._writeEpisodes or {}
            local n = 0
            for _ in pairs(episodes) do n = n + 1 end
            local admitted = episodes["1|virtual/animals_new.json"] ~= nil
            return tostring(admitted) .. "|" .. (n <= 32 and "bounded" or ("entries=" .. n))
        `);
        expect(result).toBe("true|bounded");
    });

    test("session reset drops failure episodes", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            Logging.warning = function() end
            FarmDashboardDataCollector:_logWriteFail("virtual/data.json", "write", "error", "disk full")
            FarmDashboardDataCollector:resetStaggerState()
            local n = 0
            if type(FarmDashboardDataCollector._writeEpisodes) == "table" then
                for _ in pairs(FarmDashboardDataCollector._writeEpisodes) do n = n + 1 end
            end
            return tostring(n)
        `);
        expect(result).toBe("0");
    });

    test("a repeated reason stays throttled after a different reason", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local warnings = {}
            Logging.warning = function(msg) warnings[#warnings + 1] = msg end
            _G.g_time = 0
            FarmDashboardDataCollector:_logWriteFail("virtual/data.json", "write", "error", "A")
            _G.g_time = 1000
            FarmDashboardDataCollector:_logWriteFail("virtual/data.json", "verify", "read error", "B")
            _G.g_time = 2000
            FarmDashboardDataCollector:_logWriteFail("virtual/data.json", "write", "error", "A")
            return tostring(#warnings)
        `);
        expect(result).toBe("2");
    });

    test("distinct reasons in one episode stay within a fixed history", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local warnings = {}
            Logging.warning = function(msg) warnings[#warnings + 1] = msg end
            for i = 1, 20 do
                _G.g_time = i * 1000
                FarmDashboardDataCollector:_logWriteFail("virtual/data.json", "stage" .. i, "reason" .. i, "x")
            end
            local seen = 0
            local entry = FarmDashboardDataCollector._writeEpisodes["1|virtual/data.json"]
            for _ in pairs(entry.seen) do seen = seen + 1 end
            return tostring(#warnings <= 9) .. "|" .. tostring(seen)
        `);
        expect(result).toBe("true|8");
    });

    test("recovery starts a new episode that logs immediately", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local warnings = {}
            Logging.warning = function(msg) warnings[#warnings + 1] = msg end
            _G.g_time = 0
            FarmDashboardDataCollector:_logWriteFail("virtual/data.json", "write", "error", "A")
            _G.g_time = 1000
            FarmDashboardDataCollector:_noteWriteRecovered("virtual/data.json")
            _G.g_time = 2000
            FarmDashboardDataCollector:_logWriteFail("virtual/data.json", "write", "error", "A")
            return tostring(#warnings)
        `);
        expect(result).toBe("3");
    });

    test("a backwards clock logs a reason again", () => {
        const result = runProduction(["FarmDashboardDataCollector.lua"], `
            ${collectorPrep}
            local warnings = {}
            Logging.warning = function(msg) warnings[#warnings + 1] = msg end
            _G.g_time = 5000
            FarmDashboardDataCollector:_logWriteFail("virtual/data.json", "write", "error", "A")
            _G.g_time = 6000
            FarmDashboardDataCollector:_logWriteFail("virtual/data.json", "write", "error", "A")
            _G.g_time = 0
            FarmDashboardDataCollector:_logWriteFail("virtual/data.json", "write", "error", "A")
            return tostring(#warnings)
        `);
        expect(result).toBe("2");
    });
});
