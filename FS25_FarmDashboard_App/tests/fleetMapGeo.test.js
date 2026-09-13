const {
  worldToMapPercent,
  fleetMapPercent,
  ingameMapWorldToLocalPercent,
  applyOverviewCropPercent,
  computeObjectFitContainLayout,
  mapOverviewIdentityKey,
  inferSymmetricalTerrainHalf,
  normalizeTerrainHalf,
  resolveTerrainBounds,
  resolveOverviewTerrainBounds,
  resolveFleetMapTerrainBounds,
  terrainClipPixelSize,
  INGAME_MAP_WORLD_INSET,
} = require("../fleetMapGeo.cjs");

describe("fleetMapGeo", () => {
  const bounds = { minX: -1024, maxX: 1024, minZ: -1024, maxZ: 1024, terrainSize: 2048 };

  test("INGAME_MAP_WORLD_INSET matches Giants mapExtension 0.25 / 0.5", () => {
    expect(INGAME_MAP_WORLD_INSET).toEqual({ left: 0.25, top: 0.25, width: 0.5, height: 0.5 });
  });

  test("ingameMapWorldToLocalPercent is 0–1 of the playable square", () => {
    const origin = ingameMapWorldToLocalPercent(0, 0, 2048, false);
    expect(origin.left).toBeCloseTo(50, 5);
    expect(origin.top).toBeCloseTo(50, 5);
    const field1 = ingameMapWorldToLocalPercent(-980, -987, 2048, false);
    expect(field1.left).toBeCloseTo(((-980 + 1024) / 2048) * 100, 5);
    expect(field1.top).toBeCloseTo(((-987 + 1024) / 2048) * 100, 5);
  });

  test("worldToMapPercent matches IngameMap:drawHotspot on the full overview photo", () => {
    const origin = worldToMapPercent(0, 0, bounds, false);
    expect(origin.left).toBeCloseTo(50, 5);
    expect(origin.top).toBeCloseTo(50, 5);
    const field1 = worldToMapPercent(-980, -987, bounds, false);
    const u = (-980 + 1024) / 2048;
    const v = (-987 + 1024) / 2048;
    expect(field1.left).toBeCloseTo((0.25 + u * 0.5) * 100, 5);
    expect(field1.top).toBeCloseTo((0.25 + v * 0.5) * 100, 5);
    expect(field1.left).toBeGreaterThan(25);
    expect(field1.left).toBeLessThan(28);
  });

  test("fleetMapPercent hide-border uses the terrain square (clipped photo)", () => {
    const field1 = fleetMapPercent(-980, -987, bounds, { hideBorder: true, clampFrame: false });
    expect(field1.left).toBeCloseTo(((-980 + 1024) / 2048) * 100, 5);
    expect(field1.top).toBeCloseTo(((-987 + 1024) / 2048) * 100, 5);
  });

  test("worldToMapPercent can skip edge clamp for polygon vertices", () => {
    const north = worldToMapPercent(0, -1024, bounds, false);
    expect(north.top).toBeCloseTo(25, 5);
    const past = worldToMapPercent(3000, 0, bounds, false);
    expect(past.left).toBeGreaterThan(100);
  });

  test("applyOverviewCropPercent insets pin layer for texture border", () => {
    const centre = worldToMapPercent(0, 0, bounds);
    const cropped = applyOverviewCropPercent(centre, {
      left: 0.1,
      top: 0.1,
      width: 0.8,
      height: 0.8,
    });
    expect(cropped.left).toBeCloseTo(50, 0);
    expect(cropped.top).toBeCloseTo(50, 0);
  });

  test("computeObjectFitContainLayout letterboxes wide images", () => {
    const layout = computeObjectFitContainLayout(2048, 1024, 400, 400);
    expect(layout.w).toBe(400);
    expect(layout.h).toBe(200);
    expect(layout.y).toBe(100);
  });

  test("mapOverviewIdentityKey distinguishes maps", () => {
    expect(mapOverviewIdentityKey("mapUS", "Riverside")).not.toBe(
      mapOverviewIdentityKey("mapWitcombe", "Witcombe Valley")
    );
  });

  test("inferSymmetricalTerrainHalf keeps 2 km when rim fields sit at ±1010", () => {
    expect(
      inferSymmetricalTerrainHalf(1024, [
        { x: -1010, z: 980 },
        { x: 1005, z: -990 },
      ])
    ).toBe(1024);
  });

  test("resolveOverviewTerrainBounds prefers map.xml width over a doubled terrainSize", () => {
    const bounds = resolveOverviewTerrainBounds({
      mapBounds: {
        halfSize: 2048,
        terrainSize: 4096,
        mapWidth: 2048,
        mapHeight: 2048,
        minX: -2048,
        maxX: 2048,
        minZ: -2048,
        maxZ: 2048,
      },
    });
    expect(bounds.halfSize).toBe(1024);
    expect(bounds.terrainSize).toBe(2048);
    const field1 = worldToMapPercent(-980, -987, bounds, false);
    const u = (-980 + 1024) / 2048;
    const v = (-987 + 1024) / 2048;
    expect(field1.left).toBeCloseTo((0.25 + u * 0.5) * 100, 5);
    expect(field1.top).toBeCloseTo((0.25 + v * 0.5) * 100, 5);
  });

  test("resolveFleetMapTerrainBounds does not double Riverbend when Lua already bumped to 4 km", () => {
    const bounds = resolveFleetMapTerrainBounds(
      {
        mapBounds: {
          halfSize: 2048,
          terrainSize: 4096,
          mapWidth: 2048,
          mapHeight: 2048,
        },
      },
      [
        { x: -1010, z: 980 },
        { x: 1005, z: -990 },
        { posX: -980, posZ: -987 },
      ]
    );
    expect(bounds.terrainSize).toBe(2048);
    expect(bounds.halfSize).toBe(1024);
  });

  test("inferSymmetricalTerrainHalf upgrades 2 km report when fleet exceeds ±1024", () => {
    expect(
      inferSymmetricalTerrainHalf(1024, [{ x: -49, z: 718 }, { x: -1236, z: 1797 }])
    ).toBe(2048);
  });

  test("inferSymmetricalTerrainHalf ignores one stray point that would jump two size classes", () => {
    expect(
      inferSymmetricalTerrainHalf(1024, [
        { x: -49, z: 718 },
        { x: 120, z: -80 },
        { x: 12, z: 400 },
        { x: 6400, z: -10 },
      ])
    ).toBe(1024);
  });

  test("inferSymmetricalTerrainHalf keeps 4 km when i3d rim verts sit just inside ±2048", () => {
    expect(
      inferSymmetricalTerrainHalf(1024, [
        { x: -2038, z: 10 },
        { x: 2037, z: -80 },
      ])
    ).toBe(2048);
  });

  test("normalizeTerrainHalf rejects bogus bootstrap halfSize", () => {
    expect(normalizeTerrainHalf(0.5)).toBe(1024);
    expect(normalizeTerrainHalf(2048)).toBe(2048);
  });

  test("resolveTerrainBounds ignores invalid mapBounds from pre-mission bootstrap", () => {
    const bounds = resolveTerrainBounds(
      { mapBounds: { halfSize: 0.5, terrainSize: 1, minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5 } },
      []
    );
    expect(bounds.halfSize).toBe(1024);
  });

  test("terrainClipPixelSize maps Witcombe inset to terrain window", () => {
    const clip = terrainClipPixelSize(4096, 4096, {
      left: 0.1133,
      top: 0.25,
      width: 0.6377,
      height: 0.5,
    });
    expect(clip.w).toBeCloseTo(2612, -1);
    expect(clip.h).toBe(2048);
    expect(clip.offsetX).toBeCloseTo(464, -1);
    expect(clip.offsetY).toBe(1024);
  });

  test("resolveOverviewTerrainBounds uses reported 4 km half for overview UVs", () => {
    const bounds = resolveOverviewTerrainBounds({
      serverInfo: {
        mapBounds: { halfSize: 2048, terrainSize: 4096, minX: -2048, maxX: 2048, minZ: -2048, maxZ: 2048 },
      },
    });
    expect(bounds.halfSize).toBe(2048);
    // Montana-like vehicle north of ±1024 must not clamp to the edge.
    const north = worldToMapPercent(542, -1305, bounds);
    expect(north.top).toBeGreaterThan(30);
    expect(north.top).toBeLessThan(40);
    expect(north.left).toBeGreaterThan(54);
    expect(north.left).toBeLessThan(60);
  });

  test("resolveOverviewTerrainBounds keeps 2 km half for standard maps", () => {
    const bounds = resolveOverviewTerrainBounds({
      serverInfo: {
        mapBounds: { halfSize: 1024, terrainSize: 2048, minX: -1024, maxX: 1024, minZ: -1024, maxZ: 1024 },
      },
    });
    expect(bounds.halfSize).toBe(1024);
    const yard = worldToMapPercent(-13, 699, bounds);
    expect(yard.left).toBeCloseTo(49.7, 0);
    expect(yard.top).toBeCloseTo(67.1, 0);
  });

  test("applyOverviewCropPercent with raw Witcombe UV places yard in satellite", () => {
    const yard = ingameMapWorldToLocalPercent(-13, 699, 2048);
    const remapped = applyOverviewCropPercent(yard, {
      left: 0.1133,
      top: 0.25,
      width: 0.6367,
      height: 0.5,
    });
    // Must not use left-padded clip inset (that shifts ~1.5% right).
    const padded = applyOverviewCropPercent(yard, {
      left: 0.1283,
      top: 0.25,
      width: 0.6217,
      height: 0.5,
    });
    expect(remapped.left).toBeLessThan(padded.left);
    expect(padded.left - remapped.left).toBeGreaterThan(0.5);
    expect(remapped.top).toBeCloseTo(padded.top, 0);
  });

  test("resolveTerrainBounds uses expanded half for Witcombe-like fleet spread", () => {
    const bounds = resolveTerrainBounds(
      { mapBounds: { halfSize: 1024, terrainSize: 2048, minX: -1024, maxX: 1024, minZ: -1024, maxZ: 1024 } },
      [{ position: { x: -1236, z: 1797 } }]
    );
    expect(bounds.halfSize).toBe(2048);
    const pin = worldToMapPercent(-1236, 1797, bounds);
    expect(pin.top).toBeGreaterThan(68);
    expect(pin.top).toBeLessThan(76);
    expect(pin.left).toBeGreaterThan(32);
    expect(pin.left).toBeLessThan(38);
  });
});
