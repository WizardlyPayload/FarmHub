import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { COMPANION_CATALOG, catalogEntry, companionSupport } from "../src/lib/companionMods/catalog.ts";

test("each companion has one catalog entry", () => {
  assert.equal(new Set(COMPANION_CATALOG.map((entry) => entry.id)).size, COMPANION_CATALOG.length);
});

test("Rent Your Field has a mapped live reading", () => {
  assert.equal(catalogEntry("rentYourField")?.liveKey, "rentYourField");
  assert.equal(companionSupport(catalogEntry("rentYourField")), "limited");
});

test("the UI catalog and exporter detector share one entry per ID", () => {
  const source = readFileSync(new URL("../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua", import.meta.url), "utf8");
  const catalog = source.match(/local CATALOG = \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(catalog, "exporter catalog should be present");
  const exporterIds = [...catalog.matchAll(/\bid = "([^"]+)"/g)].map((match) => match[1]);
  const appIds = COMPANION_CATALOG.map((entry) => entry.id);
  assert.equal(new Set(exporterIds).size, exporterIds.length, "exporter IDs must be unique");
  assert.deepEqual(exporterIds.sort(), [...appIds].sort());
});

test("each dedicated UI page has a Lua collector and catalog ID", () => {
  const registry = readFileSync(new URL("../src/sections/mods/registry.ts", import.meta.url), "utf8");
  const pageIds = [...registry.matchAll(/\{\s*key: "([^"]+)",\s*catalogId: "([^"]+)"/g)]
    .map((match) => {
      assert.equal(match[1], match[2], "page key must match its catalog ID");
      return match[1];
    });
  const folder = new URL("../../FS25_FarmDashboard_Mod/src/companionPages/", import.meta.url);
  const collectorIds = readdirSync(folder).filter((name) => name.endsWith(".lua"))
    .flatMap((name) => [...readFileSync(new URL(name, folder), "utf8")
      .matchAll(/CompanionPages\.register\(\{\s*key\s*=\s*"([^"]+)"/g)]
      .map((match) => match[1]));
  const appIds = new Set(COMPANION_CATALOG.map((entry) => entry.id));
  assert.equal(new Set(pageIds).size, pageIds.length, "UI page IDs must be unique");
  assert.equal(new Set(collectorIds).size, collectorIds.length, "Lua page IDs must be unique");
  for (const id of pageIds) {
    assert.ok(appIds.has(id), `${id} is missing from the app catalog`);
    assert.ok(collectorIds.includes(id), `${id} is missing a Lua page collector`);
  }
});
