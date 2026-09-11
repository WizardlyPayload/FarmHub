import test from "node:test";
import assert from "node:assert/strict";
import { summarizeStockMoisture } from "../../NEW APP/src/lib/storage/stock-moisture.ts";

test("storage moisture uses liters-weighted moisture and grade distribution", () => {
  const summary = summarizeStockMoisture([
    { liters: 100, moisturePct: 10, grade: "A" },
    { liters: 300, moisturePct: 20, grade: "B" },
  ]);

  assert.ok(summary);
  assert.equal(summary.moisturePct, 17.5);
  assert.deepEqual(
    summary.grades.map(({ grade, percent }) => [grade, percent]),
    [["B", 75], ["A", 25]],
  );
});

test("storage moisture ignores non-crops without moisture or grade data", () => {
  assert.equal(
    summarizeStockMoisture([
      { liters: 5000 },
      { liters: 2000, moisturePct: Number.NaN },
    ]),
    null,
  );
});

test("storage moisture does not fabricate values for zero-volume batches", () => {
  assert.equal(
    summarizeStockMoisture([{ liters: 0, moisturePct: 12.5, grade: "A" }]),
    null,
  );
});
