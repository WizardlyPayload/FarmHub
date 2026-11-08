"use strict";

const fs = require("fs");
const path = require("path");
const { normalizeCompanionPages } = require("../companionPagesMerge.cjs");

function sourcePages(count) {
  const pages = {};
  for (let n = 1; n <= count; n += 1) {
    const key = `mod${String(n).padStart(3, "0")}`;
    pages[key] = { detected: true, readState: "ok", rows: [{ farmId: 1, value: n }] };
  }
  return { schema: 1, pages };
}

test("keeps every registered dedicated page when all are detected", () => {
  const registry = fs.readFileSync(path.join(__dirname, "../../NEW APP/src/sections/mods/registry.ts"), "utf8");
  const registeredCount = (registry.match(/catalogId:/g) || []).length;
  expect(registeredCount).toBeGreaterThan(80);
  const result = normalizeCompanionPages(sourcePages(registeredCount), { modules: new Map() });
  expect(Object.keys(result.pages)).toHaveLength(registeredCount);
  const lastKey = `mod${String(registeredCount).padStart(3, "0")}`;
  expect(result.pages[lastKey].rows[0].value).toBe(registeredCount);
});

test("still caps an unexpectedly large page payload", () => {
  const result = normalizeCompanionPages(sourcePages(260), { modules: new Map() });
  expect(Object.keys(result.pages)).toHaveLength(256);
  expect(result.pages.mod257).toBeUndefined();
});
