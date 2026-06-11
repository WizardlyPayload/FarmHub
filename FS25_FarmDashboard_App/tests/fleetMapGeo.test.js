const {
  worldToMapPercent,
  applyOverviewCropPercent,
  computeObjectFitContainLayout,
  mapOverviewIdentityKey,
  inferSymmetricalTerrainHalf,
  resolveTerrainBounds,
} = require("../fleetMapGeo.cjs");

describe("fleetMapGeo", () => {
  const bounds = { minX: -1024, maxX: 1024, minZ: -1024, maxZ: 1024 };

  test("north (−Z) maps to top of overview", () => {
    const north = worldToMapPercent(0, -1024, bounds);
    const south = worldToMapPercent(0, 1024, bounds);
    expect(north.top).toBeLessThan(south.top);
    expect(north.top).toBeCloseTo(0.5, 0);
    expect(south.top).toBeCloseTo(99.5, 0);
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

  test("inferSymmetricalTerrainHalf upgrades 2 km report when fleet exceeds ±1024", () => {
    expect(
      inferSymmetricalTerrainHalf(1024, [{ x: -49, z: 718 }, { x: -1236, z: 1797 }])
    ).toBe(2048);
  });

  test("resolveTerrainBounds uses expanded half for Witcombe-like fleet spread", () => {
    const bounds = resolveTerrainBounds(
      { mapBounds: { halfSize: 1024, terrainSize: 2048, minX: -1024, maxX: 1024, minZ: -1024, maxZ: 1024 } },
      [{ position: { x: -1236, z: 1797 } }]
    );
    expect(bounds.halfSize).toBe(2048);
    const pin = worldToMapPercent(-1236, 1797, bounds);
    expect(pin.top).toBeGreaterThan(80);
    expect(pin.top).toBeLessThan(95);
    expect(pin.left).toBeGreaterThan(10);
    expect(pin.left).toBeLessThan(30);
  });
});
