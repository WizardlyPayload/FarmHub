import assert from "node:assert/strict";
import test from "node:test";
import { COMPANION_CATALOG, catalogEntry, companionSupport } from "../src/lib/companionMods/catalog.ts";

test("each companion has one catalog entry", () => {
  assert.equal(new Set(COMPANION_CATALOG.map((entry) => entry.id)).size, COMPANION_CATALOG.length);
});

test("Rent Your Field has a mapped live reading", () => {
  assert.equal(catalogEntry("rentYourField")?.liveKey, "rentYourField");
  assert.equal(companionSupport(catalogEntry("rentYourField")), "limited");
});
