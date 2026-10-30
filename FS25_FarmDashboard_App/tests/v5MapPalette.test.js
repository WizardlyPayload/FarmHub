"use strict";

const { productionTs } = require("./helpers/production-source.cjs");
const { overlayPaintForField, overlayLegendItems, isRelativeOverlayMode } = productionTs("NEW APP/src/lib/fleetMapOverlays.ts");
const { GAME_MAP_COLORS, gameFarmColor, gameMapColor } = productionTs("NEW APP/src/lib/fs25-map-palette.ts");

test("crop key uses the same map-supplied color as its orchard or field", () => {
  const field = { ownerFarmId: 1, fruitType: "COFFEECHERRIES", fruitMapColor: "#123456" };
  const paint = overlayPaintForField(field, "crops", "rgb(10,20,30)");
  const legend = overlayLegendItems("crops", [field]);
  expect(paint.fill).toBe("rgba(18, 52, 86, 0.5)");
  expect(legend).toEqual([{ cropKey: "COFFEECHERRIES", fill: paint.fill }]);
});

test("weed and stone keys follow the loaded map's exported colors", () => {
  const palette = { weeds: [[1, 0, 0], [0, 1, 0]], stones: [[0, 0, 1]] };
  const weeds = overlayPaintForField({ ownerFarmId: 1, weedPercent: 100 }, "weeds", "rgb(10,20,30)", { min: 0, max: 100 }, palette);
  const stones = overlayPaintForField({ ownerFarmId: 1, stoneLevel: 1 }, "stones", "rgb(10,20,30)", { min: 0, max: 1 }, palette);
  expect(weeds.fill).toBe("rgba(0, 255, 0, 0.52)");
  expect(stones.fill).toBe("rgba(0, 0, 255, 0.52)");
  expect(overlayLegendItems("weeds", [], palette).map(item => item.fill)).toEqual([
    "rgba(148, 163, 184, 0.22)", "rgba(255, 0, 0, 0.52)", weeds.fill,
  ]);
  expect(overlayLegendItems("stones", [], palette)[1].fill).toBe(stones.fill);
  expect(overlayLegendItems("weeds", [], palette)[2]).toMatchObject({ paletteLevel: 2, paletteTotal: 2 });
  expect(isRelativeOverlayMode("weeds")).toBe(false);
  expect(isRelativeOverlayMode("stones")).toBe(false);
});

test("each game stone stage matches its own key swatch", () => {
  const palette = { stones: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
  const legend = overlayLegendItems("stones", [], palette);
  expect(legend).toHaveLength(4);
  for (let level = 1; level <= 3; level++) {
    const paint = overlayPaintForField({ ownerFarmId: 1, stoneLevel: level }, "stones", "rgb(10,20,30)", null, palette);
    expect(paint.fill).toBe(legend[level].fill);
    expect(legend[level]).toMatchObject({ paletteLevel: level, paletteTotal: 3 });
  }
});

test("base-game map key matches the painted native soil states", () => {
  const modes = [
    ["fertilized", { fertilizationLevel: 2 }, "fertFull", gameMapColor(GAME_MAP_COLORS.fertilized2)],
    ["needsPlowing", { needsPlowing: true }, "needsPlowing", gameMapColor(GAME_MAP_COLORS.needsPlowing)],
    ["needsLime", { needsLime: true }, "needsLime", gameMapColor(GAME_MAP_COLORS.needsLime)],
    ["needsRolling", { needsRolling: true }, "needsRolling", gameMapColor(GAME_MAP_COLORS.needsRolling)],
    ["mulched", { mulchLevel: 1 }, "mulched", gameMapColor(GAME_MAP_COLORS.mulched)],
  ];
  for (const [mode, values, key, expected] of modes) {
    const field = { ownerFarmId: 1, ...values };
    expect(overlayPaintForField(field, mode, "rgb(10,20,30)", { min: 0, max: 100 }).fill).toBe(expected);
    expect(overlayLegendItems(mode, [field]).find(item => item.labelKey === `map.legend.${key}`).fill).toBe(expected);
  }
  expect(isRelativeOverlayMode("fertilized")).toBe(false);
});

test("ownership key uses the same game farm palette as its field overlay", () => {
  const multiplayerFarm = gameFarmColor(1, true);
  expect(multiplayerFarm).toBe("rgba(255, 175, 0, 1)");
  expect(overlayPaintForField({ ownerFarmId: 1 }, "ownership", multiplayerFarm).fill)
    .toBe("rgba(255, 175, 0, 0.42)");
  expect(gameFarmColor(1, false)).toBe("rgba(130, 171, 12, 1)");
});
