import test from "node:test";
import assert from "node:assert/strict";
import { roundAgeMonths } from "../web/assests/js/modules/livestock.js";

test("roundAgeMonths rounds RL fractional ages to one decimal", () => {
  assert.equal(roundAgeMonths(6.916666666666667), 6.9);
  assert.equal(roundAgeMonths(18.25), 18.3);
});

test("roundAgeMonths snaps near-integer ages to whole months", () => {
  assert.equal(roundAgeMonths(12), 12);
  assert.equal(roundAgeMonths(12.0004), 12);
});

test("roundAgeMonths treats non-finite input as zero", () => {
  assert.equal(roundAgeMonths("bad"), 0);
  assert.equal(roundAgeMonths(null), 0);
});
