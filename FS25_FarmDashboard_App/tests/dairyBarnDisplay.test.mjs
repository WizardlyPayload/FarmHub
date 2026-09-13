/**
 * Dairy Core cards prefer the placeable barn name over a truncated uniqueId.
 * Run: node --experimental-strip-types --test tests/dairyBarnDisplay.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  barnDisplayName,
  shortBarnLabel,
} from "../../NEW APP/src/lib/realisticFarming/dairy/index.ts";

test("barnDisplayName uses the exported placeable name", () => {
  assert.equal(
    barnDisplayName({ barnId: "placeable_fs25_dairycore_0123456789abcdef", name: "North Barn" }),
    "North Barn",
  );
});

test("barnDisplayName trims whitespace around the placeable name", () => {
  assert.equal(
    barnDisplayName({ barnId: "abc", name: "  West Parlour  " }),
    "West Parlour",
  );
});

test("barnDisplayName falls back to the short uniqueId label", () => {
  const barnId = "placeable_fs25_dairycore_0123456789abcdef";
  assert.equal(barnDisplayName({ barnId }), shortBarnLabel(barnId));
  assert.equal(barnDisplayName({ barnId, name: "   " }), shortBarnLabel(barnId));
  assert.equal(barnDisplayName(null), "");
});
