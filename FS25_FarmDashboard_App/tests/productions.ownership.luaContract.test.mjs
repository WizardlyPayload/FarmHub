/**
 * Contract test: ProductionDataCollector must not assign map/EVERYONE
 * productions to the local player via mission:getFarmId().
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const luaPath = path.resolve(
  __dirname,
  "../../FS25_FarmDashboard_Mod/src/collectors/ProductionDataCollector.lua",
);

function extractLocalFunction(src, fnName) {
  const startRe = new RegExp(`local function ${fnName}\\s*\\(`);
  const start = src.search(startRe);
  assert.ok(start >= 0, `missing local function ${fnName}`);
  const after = src.slice(start);
  const next = after.search(/\nlocal function |\nfunction /);
  return next > 0 ? after.slice(0, next) : after;
}

function extractMethod(src, methodName) {
  const needle = `function ProductionDataCollector:${methodName}`;
  const start = src.indexOf(needle);
  assert.ok(start >= 0, `missing method ${methodName}`);
  const after = src.slice(start);
  const next = after.search(/\nfunction /);
  return next > 0 ? after.slice(0, next) : after;
}

test("resolveProductionOwnerFarmId does not fall back to mission:getFarmId", () => {
  const src = fs.readFileSync(luaPath, "utf8");
  const body = extractLocalFunction(src, "resolveProductionOwnerFarmId");
  // Strip Lua comments so explanatory notes do not false-positive.
  const codeOnly = body.replace(/--[^\n]*/g, "");
  assert.equal(
    /mission\s*:\s*getFarmId/.test(codeOnly),
    false,
    "resolveProductionOwnerFarmId must not call mission:getFarmId (assigns EVERYONE to player)",
  );
  assert.match(
    codeOnly,
    /return 0/,
    "unresolved / public ownership must default to farm id 0",
  );
});

test("public production points export isPublic / isOwned and ownerFarmId 0", () => {
  const src = fs.readFileSync(luaPath, "utf8");
  const chunk = extractMethod(src, "_tryAddProductionPoint");
  assert.match(chunk, /isPublic\s*=\s*fid\s*<=\s*0\s*or\s*fid\s*==\s*everyone/);
  assert.match(chunk, /pData\.isPublic\s*=\s*isPublic/);
  assert.match(chunk, /pData\.isOwned\s*=\s*not isPublic/);
  assert.match(chunk, /if isPublic then[\s\S]*fid\s*=\s*0/);
});

test("public factories export isPublic / isOwned and ownerFarmId 0", () => {
  const src = fs.readFileSync(luaPath, "utf8");
  const chunk = extractMethod(src, "_tryAddFactory");
  assert.match(chunk, /isPublic\s*=\s*fid\s*<=\s*0\s*or\s*fid\s*==\s*everyone/);
  assert.match(chunk, /pData\.isPublic\s*=\s*isPublic/);
  assert.match(chunk, /pData\.isOwned\s*=\s*not isPublic/);
  assert.match(chunk, /if isPublic then[\s\S]*fid\s*=\s*0/);
});
