import test from "node:test";
import assert from "node:assert/strict";
import {
  probeRemoteDashboardBootstrap,
  interpretLanVerifyResult,
  farmdashWaitForLanHttpBasicIfNeeded,
} from "../web/assests/js/lan-http-auth.js";

test("probeRemoteDashboardBootstrap rejects status-only success (servers still 401)", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (String(url).endsWith("/api/status")) {
      return { ok: true };
    }
    if (String(url).endsWith("/api/servers")) {
      return { ok: false, status: 401 };
    }
    return { ok: false, status: 404 };
  };
  const ok = await probeRemoteDashboardBootstrap(fetchImpl, "https://demo.farmdashboard.co.uk");
  assert.equal(ok, false);
  assert.deepEqual(calls, [
    "https://demo.farmdashboard.co.uk/api/status",
    "https://demo.farmdashboard.co.uk/api/servers",
  ]);
});

test("probeRemoteDashboardBootstrap accepts when status and servers both succeed", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("/api/status") || String(url).includes("/api/servers")) {
      return { ok: true };
    }
    return { ok: false };
  };
  const ok = await probeRemoteDashboardBootstrap(fetchImpl, "https://demo.farmdashboard.co.uk");
  assert.equal(ok, true);
});

test("interpretLanVerifyResult treats 401/403 as auth and other failures as network", () => {
  assert.equal(interpretLanVerifyResult(200), "ok");
  assert.equal(interpretLanVerifyResult(204), "ok");
  assert.equal(interpretLanVerifyResult(401), "auth");
  assert.equal(interpretLanVerifyResult(403), "auth");
  assert.equal(interpretLanVerifyResult(500), "network");
  assert.equal(interpretLanVerifyResult(0), "network");
  assert.equal(interpretLanVerifyResult(200, true), "network");
});

test("farmdashWaitForLanHttpBasicIfNeeded times out for remote viewers", async () => {
  const prevWindow = globalThis.window;
  const prevDoc = globalThis.document;
  const prevSs = globalThis.sessionStorage;
  const store = {};
  globalThis.window = { __farmDashRemoteViewer: true };
  globalThis.document = { body: { classList: { add() {} } } };
  globalThis.sessionStorage = { setItem(k, v) { store[k] = v; } };
  try {
    const start = Date.now();
    await farmdashWaitForLanHttpBasicIfNeeded({ timeoutMs: 30 });
    assert.ok(Date.now() - start >= 20);
    assert.equal(store.farmdash_last_error_code, "E_LAN_TIMEOUT");
  } finally {
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
    if (prevSs === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = prevSs;
  }
});
