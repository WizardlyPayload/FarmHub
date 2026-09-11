import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canAccessSetupPayload,
  ERROR_SETUP_LOCAL_ONLY,
  ERROR_INVALID_TOKEN,
} from "../setupAccessPolicy.cjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const mainJs = fs.readFileSync(path.join(root, "..", "main.js"), "utf8");

test("main.js gates setup.html and setup-config through evaluateSetupAccess", () => {
  assert.match(mainJs, /evaluateSetupAccess\(req, false\)/);
  assert.match(mainJs, /evaluateSetupAccess\(req, true\)/);
  assert.match(mainJs, /expressApp\.get\('\/setup\.html'/);
  assert.match(mainJs, /expressApp\.get\('\/api\/setup-config'/);
  assert.match(mainJs, /expressApp\.post\('\/api\/setup-config'/);
  assert.match(mainJs, /setupAccessPolicy/);
  assert.match(mainJs, /Cache-Control.*no-store/);
});

test("remote GET setup-config is denied even with a matching write token", () => {
  const denied = canAccessSetupPayload(
    { path: "/api/setup-config" },
    {
      isLocalClient: false,
      remoteAllowed: false,
      requireToken: false,
      tokenMatches: true,
    }
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 403);
  assert.equal(denied.errorCode, ERROR_SETUP_LOCAL_ONLY);
});

test("POST still rejects a missing token on localhost", () => {
  const denied = canAccessSetupPayload(
    { path: "/api/setup-config" },
    {
      isLocalClient: true,
      requireToken: true,
      tokenMatches: false,
    }
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.errorCode, ERROR_INVALID_TOKEN);
});
