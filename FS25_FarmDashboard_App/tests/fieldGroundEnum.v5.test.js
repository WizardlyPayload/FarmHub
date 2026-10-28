"use strict";

const { productionTs } = require("./helpers/production-source.cjs");
const { isPreparedSeedbedGround } = productionTs("NEW APP/src/lib/rules-engine/forage-crop-types.ts");

test("V5 reads mod FieldGroundType enum rather than raw map density values", () => {
  expect(isPreparedSeedbedGround(1, "NONE")).toBe(false);
  expect(isPreparedSeedbedGround(1)).toBe(false);
  expect(isPreparedSeedbedGround(2, "STUBBLE_TILLAGE")).toBe(true);
  expect(isPreparedSeedbedGround(3, "CULTIVATED")).toBe(true);
  expect(isPreparedSeedbedGround(7, "RIDGE")).toBe(true);
  expect(isPreparedSeedbedGround(8, "SOWN")).toBe(false);
  expect(isPreparedSeedbedGround(0, "CULTIVATED")).toBe(true);
});
