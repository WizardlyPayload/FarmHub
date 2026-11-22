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
      g_soilCompaction.cells[51] = 80
      g_soilCompaction.overlayRevision = 2
      local invalid, reason = SoilCompactionScanner:read(2)
      return __fdEncode({ afterTransfer = #afterTransfer.rows, invalid = invalid, reason = reason })
    `);
    expect(result.afterTransfer).toBe(0);
    expect(result.invalid).toBeUndefined();
    expect(result.reason).toBe("not-scanned");
  });

  test("rejects unreadable grid entries rather than publishing a partial total", () => {
    const result = run(`
      g_soilCompaction.cells = { [1] = 101 }
      SoilCompactionScanner:step()
      local snapshot, reason = SoilCompactionScanner:read(1)
      return __fdEncode({ snapshot = snapshot, reason = reason })
    `);
    expect(result.snapshot).toBeUndefined();
    expect(result.reason).toBe("invalid-grid-cell");
  });
});
