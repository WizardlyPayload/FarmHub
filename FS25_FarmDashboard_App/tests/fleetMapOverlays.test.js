const {
  readWorldXZ,
  fieldBlobSizePercent,
  cropOverlayFill,
  overlayPaintForField,
  defaultOverlayMode,
  availableOverlayModes,
  normalizeFieldOutline,
  outlineToSvgPoints,
  pickMapOutlineForField,
  overlayNumericValue,
  computeOverlayRange,
} = require("../fleetMapOverlays.cjs");
const { inferSymmetricalTerrainHalf, resolveFleetMapTerrainBounds } = require("../fleetMapGeo.cjs");

describe("fleet map overlays", () => {
  test("readWorldXZ accepts posX/posZ and nested position", () => {
    expect(readWorldXZ({ posX: 400, posZ: -800 })).toEqual({ x: 400, z: -800 });
    expect(readWorldXZ({ position: { x: 10, z: 20 } })).toEqual({ x: 10, z: 20 });
    expect(readWorldXZ({ posX: 0, posZ: 0 })).toBeNull();
  });

  test("fieldBlobSizePercent scales with map size and clamps", () => {
    const twoKm = fieldBlobSizePercent(10, 2048);
    const fourKm = fieldBlobSizePercent(10, 4096);
    expect(twoKm).toBeGreaterThan(fourKm);
    expect(fieldBlobSizePercent(0.01, 2048)).toBe(2.2);
    expect(fieldBlobSizePercent(400, 2048)).toBe(16);
  });

  test("crop overlay has a wheat colour and hashes unknown crops", () => {
    expect(cropOverlayFill("WHEAT")).toMatch(/^rgba\(/);
    expect(cropOverlayFill("MYMODCROP")).toMatch(/^hsla\(/);
  });

  test("soil OM overlay paints idle when Soil Fertilizer is off", () => {
    const idle = overlayPaintForField({ fruitType: "WHEAT", soilFertilizer: { enabled: false } }, "soilOm", "rgb(1,2,3)");
    expect(idle.fill).toMatch(/148, 163, 184/);
    const paint = overlayPaintForField(
      { fruitType: "WHEAT", soilFertilizer: { enabled: true, organicMatter: 4.2 } },
      "soilOm",
      "rgb(1,2,3)"
    );
    expect(paint.fill).toMatch(/^hsla\(/);
  });

  test("default overlay prefers soil when RF soil is live", () => {
    expect(defaultOverlayMode([{ fruitType: "WHEAT" }])).toBe("crops");
    expect(
      defaultOverlayMode([{ fruitType: "WHEAT", soilFertilizer: { enabled: true, organicMatter: 3 } }])
    ).toBe("soilOm");
  });

  test("default overlay prefers Precision Farming nitrogen when PF is live", () => {
    expect(defaultOverlayMode([{ fruitType: "WHEAT", isPrecisionFarming: true }])).toBe("soilN");
  });

  test("vanilla fertilized and lime overlays hide when PF or Soil Fertilizer is present", () => {
    const vanilla = availableOverlayModes([{ fruitType: "WHEAT" }]);
    expect(vanilla).toEqual(expect.arrayContaining(["fertilized", "needsLime", "weeds", "watered"]));
    const pf = availableOverlayModes([{ isPrecisionFarming: true }]);
    expect(pf).not.toContain("fertilized");
    expect(pf).not.toContain("needsLime");
    expect(pf).toEqual(expect.arrayContaining(["soilN", "soilPh", "pfSoilType", "weeds", "needsPlowing"]));
    const sf = availableOverlayModes([{ soilFertilizer: { enabled: true, organicMatter: 2 } }]);
    expect(sf).not.toContain("fertilized");
    expect(sf).not.toContain("needsLime");
    expect(sf).toEqual(expect.arrayContaining(["soilOm", "soilN", "soilPh", "soilUrgency"]));
  });

  test("Precision Farming nitrogen paints scanned fields and greys unscanned", () => {
    const scanned = overlayPaintForField(
      { isPrecisionFarming: true, isScanned: true, nitrogenLevel: 90, targetNitrogen: 100 },
      "soilN",
      "rgb(1,2,3)"
    );
    const unscanned = overlayPaintForField(
      { isPrecisionFarming: true, isScanned: false },
      "soilN",
      "rgb(1,2,3)"
    );
    expect(scanned.fill).toMatch(/^hsla\(/);
    expect(unscanned.fill).toMatch(/148, 163, 184/);
  });

  test("vanilla fertilized overlay paints spray level", () => {
    const paint = overlayPaintForField({ fertilizationLevel: 2 }, "fertilized", "rgb(1,2,3)");
    expect(paint.fill).toMatch(/^hsla\(/);
  });

  test("owned fields stay visible on needs-lime and weeds overlays", () => {
    const clearLime = overlayPaintForField({ ownerFarmId: 1, needsLime: false }, "needsLime", "rgb(1,2,3)");
    const clearWeeds = overlayPaintForField({ ownerFarmId: 1, weedPercent: 0 }, "weeds", "rgb(1,2,3)");
    expect(clearLime.fill).toMatch(/148, 163, 184/);
    expect(clearWeeds.fill).toMatch(/148, 163, 184/);
  });

  test("normalizeFieldOutline downsamples and maps to svg points", () => {
    const many = Array.from({ length: 80 }, (_, i) => [i, i * 2]);
    const compact = normalizeFieldOutline(many);
    expect(compact.length).toBeLessThanOrEqual(65);
    expect(compact.length).toBeGreaterThanOrEqual(3);
    expect(normalizeFieldOutline([[1, 1], [2, 2]])).toBeNull();
    const liveMap = [
      [
        { x: 0, z: 0 },
        { x: 100, z: 0 },
        { x: 100, z: 80 },
        { x: 0, z: 80 },
      ],
    ];
    expect(normalizeFieldOutline(liveMap)).toEqual([
      [0, 0],
      [100, 0],
      [100, 80],
      [0, 80],
    ]);
    const svg = outlineToSvgPoints(
      [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      (x, z) => ({ left: x / 2, top: z / 2 })
    );
    expect(svg).toBe("0.00,0.00 50.00,0.00 50.00,50.00");
  });

  test("soil urgency and moisture numeric values match the TypeScript overlay source", () => {
    const sf = { soilFertilizer: { enabled: true, urgency: 72, organicMatter: 4 } };
    expect(overlayNumericValue(sf, "soilUrgency")).toBe(72);
    expect(overlayNumericValue({ soilFertilizer: { enabled: false, urgency: 72 } }, "soilUrgency")).toBeNull();
    expect(overlayNumericValue({ soilFertilizer: { enabled: true, pfConflict: true, urgency: 72 } }, "soilUrgency")).toBeNull();
    expect(overlayNumericValue({ cropStress: { moisturePercent: 18 } }, "moisture")).toBe(18);
    expect(overlayNumericValue({ moisture: { percent: 41 } }, "moisture")).toBe(41);
    expect(
      overlayNumericValue({ cropStress: { moisturePercent: 18 }, moisture: { percent: 41 } }, "moisture")
    ).toBe(18);
    const moistModes = availableOverlayModes([{ moisture: { percent: 33 } }]);
    expect(moistModes).toContain("moisture");
    expect(availableOverlayModes([{ fruitType: "WHEAT" }])).not.toContain("moisture");
  });

  test("soil urgency overlay paints from range instead of idle gray", () => {
    const fields = [
      { soilFertilizer: { enabled: true, urgency: 12 } },
      { soilFertilizer: { enabled: true, urgency: 88 } },
    ];
    const range = computeOverlayRange(fields, "soilUrgency");
    expect(range).toEqual({ min: 12, max: 88 });
    const low = overlayPaintForField(fields[0], "soilUrgency", "rgb(1,2,3)", range);
    const high = overlayPaintForField(fields[1], "soilUrgency", "rgb(1,2,3)", range);
    expect(low.fill).toMatch(/^hsla\(/);
    expect(high.fill).toMatch(/^hsla\(/);
    expect(low.fill).not.toBe(high.fill);
    expect(overlayPaintForField(fields[1], "soilUrgency", "rgb(1,2,3)").fill).toMatch(/^hsla\(/);
  });

  test("moisture overlay reads crop stress then field moisture percent", () => {
    const fields = [
      { cropStress: { moisturePercent: 10 } },
      { moisture: { percent: 80 } },
    ];
    const range = computeOverlayRange(fields, "moisture");
    expect(range).toEqual({ min: 10, max: 80 });
    const dry = overlayPaintForField(fields[0], "moisture", "rgb(1,2,3)", range);
    const wet = overlayPaintForField(fields[1], "moisture", "rgb(1,2,3)", range);
    expect(dry.fill).not.toBe(wet.fill);
    expect(overlayPaintForField({ moisture: { percent: 50 } }, "moisture", "rgb(1,2,3)").fill).toMatch(
      /52, 152, 219/
    );
  });

  test("overlay range epsilon matches production (tiny spreads stay unstretched)", () => {
    expect(
      computeOverlayRange(
        [
          { weedPercent: 10 },
          { weedPercent: 17 },
        ],
        "weeds"
      )
    ).toBeNull();
    expect(
      computeOverlayRange(
        [
          { weedPercent: 10 },
          { weedPercent: 18 },
        ],
        "weeds"
      )
    ).toEqual({ min: 10, max: 18 });
    expect(
      computeOverlayRange(
        [
          { soilFertilizer: { enabled: true, urgency: 20 } },
          { soilFertilizer: { enabled: true, urgency: 23.9 } },
        ],
        "soilUrgency"
      )
    ).toBeNull();
    expect(
      computeOverlayRange(
        [
          { soilFertilizer: { enabled: true, urgency: 20 } },
          { soilFertilizer: { enabled: true, urgency: 24 } },
        ],
        "soilUrgency"
      )
    ).toEqual({ min: 20, max: 24 });
    expect(
      computeOverlayRange([{ moisture: { percent: 40 } }, { moisture: { percent: 42.4 } }], "moisture")
    ).toBeNull();
    expect(
      computeOverlayRange([{ moisture: { percent: 40 } }, { moisture: { percent: 42.5 } }], "moisture")
    ).toEqual({ min: 40, max: 42.5 });
    expect(
      computeOverlayRange([{ fertilizationLevel: 0 }, { fertilizationLevel: 0.2 }], "fertilized")
    ).toBeNull();
    expect(
      computeOverlayRange([{ fertilizationLevel: 0 }, { fertilizationLevel: 0.25 }], "fertilized")
    ).toEqual({ min: 0, max: 0.25 });
    expect(computeOverlayRange([{ phValue: 6, isPrecisionFarming: true, isScanned: true }, { phValue: 6.11, isPrecisionFarming: true, isScanned: true }], "soilPh")).toBeNull();
    expect(computeOverlayRange([{ stoneLevel: 0 }, { stoneLevel: 0.19 }], "stones")).toBeNull();
    expect(computeOverlayRange([{ stoneLevel: 0 }, { stoneLevel: 0.2 }], "stones")).toEqual({ min: 0, max: 0.2 });
  });

  test("soil nitrogen colours stretch across the visible field range", () => {
    const fields = [
      { soilFertilizer: { enabled: true, ppm: { n: 12 } } },
      { soilFertilizer: { enabled: true, ppm: { n: 48 } } },
    ];
    const range = computeOverlayRange(fields, "soilN");
    expect(range).toEqual({ min: 12, max: 48 });
    const low = overlayPaintForField(fields[0], "soilN", "rgb(1,2,3)", range);
    const high = overlayPaintForField(fields[1], "soilN", "rgb(1,2,3)", range);
    expect(low.fill).not.toBe(high.fill);
    expect(overlayPaintForField({ fruitType: "WHEAT", fruitMapColor: "#E8C547" }, "crops", "rgb(1,2,3)").fill).toMatch(
      /^rgba\(232, 197, 71/
    );
  });

  test("pickMapOutlineForField prefers farmlandId then containment", () => {
    const map = [
      { id: 70, outline: [[0, 0], [10, 0], [10, 10], [0, 10]], cx: 5, cz: 5 },
      { id: 71, outline: [[100, 100], [110, 100], [110, 110], [100, 110]], cx: 105, cz: 105 },
      { id: 67, outline: [[700, -800], [800, -800], [800, -700], [700, -700]], cx: 750, cz: -750 },
    ];
    expect(pickMapOutlineForField({ farmlandId: 70 }, map)).toEqual(map[0].outline);
    expect(pickMapOutlineForField({ outline: [[1, 1], [2, 1], [2, 2]], farmlandId: 70 }, map)).toEqual([
      [1, 1],
      [2, 1],
      [2, 2],
    ]);
    expect(pickMapOutlineForField({ farmlandId: 99, posX: 104, posZ: 106 }, map)).toEqual(map[1].outline);
    expect(pickMapOutlineForField({ farmlandId: 99, posX: 50, posZ: 50 }, map)).toBeNull();
    expect(
      pickMapOutlineForField({ farmlandId: 97, id: 67, posX: -91, posZ: 810 }, map),
    ).toBeNull();
  });
});

describe("fleet map bounds from fields", () => {
  test("inferSymmetricalTerrainHalf reads field posX on a 4 km map", () => {
    expect(inferSymmetricalTerrainHalf(1024, [{ posX: -1236, posZ: 1797 }])).toBe(2048);
  });

  test("resolveFleetMapTerrainBounds upgrades a 2 km report using outer fields", () => {
    const bounds = resolveFleetMapTerrainBounds(
      { mapBounds: { halfSize: 1024, terrainSize: 2048 } },
      [{ posX: -1236, posZ: 1797 }, { position: { x: 40, z: 80 } }]
    );
    expect(bounds.halfSize).toBe(2048);
    expect(bounds.terrainSize).toBe(4096);
  });

  test("resolveFleetMapTerrainBounds does not jump to 8 km for 4 km i3d rims", () => {
    const bounds = resolveFleetMapTerrainBounds(
      { mapBounds: { halfSize: 1024, terrainSize: 2048 } },
      [
        { x: -2038, z: -100 },
        { x: 2037, z: 200 },
      ]
    );
    expect(bounds.halfSize).toBe(2048);
    expect(bounds.terrainSize).toBe(4096);
  });
});
