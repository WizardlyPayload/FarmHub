"use strict";

const { runCompanionLua } = require("./helpers/companion-page-lua.cjs");

const SETUP = `
  g_time = 1000
  g_currentMission = {}
  local owner = { [1] = 1, [2] = 2 }
  g_farmlandManager = {
    getFarmlandAtWorldPosition = function(_, x) return { id = x < 25 and 1 or 2 } end,
    getFarmlandOwner = function(_, parcelId) return owner[parcelId] end,
  }
  FSDensityMapUtil = { getIsFieldAtWorldPos = function(x) return x ~= 3 end }
  local cells = {}
  for i = 1, 50 do cells[i] = i end
  g_soilCompaction = {
    cells = cells, cellSize = 0.5, overlayRevision = 1,
    keyToWorldCenter = function(_, key) return key, 0 end,
  }
  g_modIsLoaded = { KM_81205_Soil_Compaction = true }
  KM_81205_Soil_Compaction = { g_soilCompaction = g_soilCompaction }
`;

function run(body) {
  return runCompanionLua(["SoilCompactionScanner.lua"], SETUP, body);
}

describe("Soil Compaction frame-bounded snapshot", () => {
  test("withholds prefix totals and joins a completed grid to the selected farm", () => {
    const result = run(`
      SoilCompactionScanner:step()
      local prefix, reason = SoilCompactionScanner:read(1)
      local firstFrame = SoilCompactionScanner.state.scanned
      SoilCompactionScanner:step()
      local own = SoilCompactionScanner:read(1)
      local foreign = SoilCompactionScanner:read(2)
      return __fdEncode({ firstFrame = firstFrame, prefix = prefix, reason = reason,
        scanned = own.scannedCells, own = own.rows[1], foreign = foreign.rows[1],
        ownRows = #own.rows, foreignRows = #foreign.rows })
    `);
    expect(result.firstFrame).toBe(40);
    expect(result.prefix).toBeUndefined();
    expect(result.reason).toBe("scanning");
    expect(result.scanned).toBe(50);
    expect(result.ownRows).toBe(1);
    expect(result.own.parcelId).toBe(1);
    expect(result.own.cellCount).toBe(23); // keys 1..24, excluding nonfield key 3
    expect(result.own.maxPenalty).toBe(24);
    expect(result.foreignRows).toBe(1);
    expect(result.foreign.parcelId).toBe(2);
    expect(result.foreign.cellCount).toBe(26);
  });

  test("invalidates a completed snapshot on revision change and rejoins ownership", () => {
    const result = run(`
      SoilCompactionScanner:step(); SoilCompactionScanner:step()
      owner[1] = 2
      local afterTransfer = SoilCompactionScanner:read(1)
      KM_81205_Soil_Compaction.g_soilCompaction.cells[51] = 80
      KM_81205_Soil_Compaction.g_soilCompaction.overlayRevision = 2
      local invalid, reason = SoilCompactionScanner:read(2)
      return __fdEncode({ afterTransfer = #afterTransfer.rows, invalid = invalid, reason = reason })
    `);
    expect(result.afterTransfer).toBe(0);
    expect(result.invalid).toBeUndefined();
    expect(result.reason).toBe("not-scanned");
  });

  test("rejects unreadable grid entries rather than publishing a partial total", () => {
    const result = run(`
      KM_81205_Soil_Compaction.g_soilCompaction.cells = { [1] = 101 }
      SoilCompactionScanner:step()
      local snapshot, reason = SoilCompactionScanner:read(1)
      return __fdEncode({ snapshot = snapshot, reason = reason })
    `);
    expect(result.snapshot).toBeUndefined();
    expect(result.reason).toBe("invalid-grid-cell");
  });

  test("uses the active companion environment, not a same-named dashboard shadow", () => {
    const result = run(`
      g_soilCompaction = { cells = { [1] = 99 }, cellSize = 0.5,
        overlayRevision = 1, keyToWorldCenter = function() return 1, 0 end }
      SoilCompactionScanner:step(); SoilCompactionScanner:step()
      local own = SoilCompactionScanner:read(1)
      return __fdEncode({ scanned = own.scannedCells, cells = own.rows[1].cellCount,
        maxPenalty = own.rows[1].maxPenalty })
    `);
    expect(result.scanned).toBe(50);
    expect(result.cells).toBe(23);
    expect(result.maxPenalty).toBe(24);
  });

  test("bounds work on a large grid and caps ranked rows without losing farm totals", () => {
    const result = run(`
      local mod = KM_81205_Soil_Compaction.g_soilCompaction
      mod.cells = {}
      for i = 1, 10000 do mod.cells[i] = (i % 100) + 1 end
      mod.overlayRevision = 2
      g_farmlandManager.getFarmlandAtWorldPosition = function(_, x)
        return { id = math.floor((x - 1) / 100) + 1 }
      end
      g_farmlandManager.getFarmlandOwner = function() return 1 end
      FSDensityMapUtil.getIsFieldAtWorldPos = function() return true end
      local maxStep = 0
      for frame = 1, 251 do
        local before = SoilCompactionScanner.state and SoilCompactionScanner.state.scanned or 0
        SoilCompactionScanner:step()
        local delta = SoilCompactionScanner.state.scanned - before
        if delta > maxStep then maxStep = delta end
      end
      local snapshot = SoilCompactionScanner:read(1)
      return __fdEncode({ maxStep = maxStep, scanned = snapshot.scannedCells,
        affectedCells = snapshot.affectedCells, affectedParcels = snapshot.affectedParcels,
        rows = #snapshot.rows, truncated = snapshot.truncated })
    `);
    expect(result.maxStep).toBeLessThanOrEqual(40);
    expect(result.scanned).toBe(10000);
    expect(result.affectedCells).toBe(10000);
    expect(result.affectedParcels).toBe(100);
    expect(result.rows).toBe(60);
    expect(result.truncated).toBe(true);
  });
});

describe("Soil Compaction companion reading", () => {
  const PAGE_SETUP = `${SETUP}
    g_modIsLoaded = { KM_81205_Soil_Compaction = true }
    g_modManager = { getActiveMods = function() return {
      { modName = "KM_81205_Soil_Compaction", version = "1.0.0.0" }
    } end }
    g_currentMission.getFarmId = function() return 1 end
    g_currentMission.getIsServer = function() return true end
    g_fieldManager = { farmlandIdFieldMapping = {
      [1] = { getName = function() return "Field 36" end },
    } }
  `;

  test("exports only a complete owned snapshot and its field label", () => {
    const result = runCompanionLua(
      ["SoilCompactionScanner.lua", "SoilCompactionCollector.lua"], PAGE_SETUP,
      `local entry = CompanionPages.entries.soilCompaction
       SoilCompactionScanner:step()
       local pending = CompanionPages.collectEntry(entry, 1)
       SoilCompactionScanner:step()
       local ready = CompanionPages.collectEntry(entry, 2)
       return __fdEncode({ pending = pending, ready = ready })`,
    );
    expect(result.pending.readState).toBe("pending");
    expect(result.pending.rows).toBeUndefined();
    expect(result.ready.readState).toBe("ok");
    expect(result.ready.byFarm["1"].affectedParcels).toBe(1);
    expect(result.ready.byFarm["1"].affectedCells).toBe(23);
    expect(result.ready.rows).toHaveLength(1);
    expect(result.ready.rows[0].fieldName).toBe("Field 36");
    expect(result.ready.rows[0].parcelId).toBe(1);
  });

  test("does not export an unreviewed mod version", () => {
    const result = runCompanionLua(
      ["SoilCompactionScanner.lua", "SoilCompactionCollector.lua"],
      PAGE_SETUP.replace('version = "1.0.0.0"', 'version = "1.1.0.0"'),
      `local entry = CompanionPages.entries.soilCompaction
       SoilCompactionScanner:step(); SoilCompactionScanner:step()
       return __fdEncode(CompanionPages.collectEntry(entry, 1))`,
    );
    expect(result.readState).toBe("settings-only");
    expect(result.reason).toBe("unreviewed-version");
    expect(result.rows).toBeUndefined();
  });
});
