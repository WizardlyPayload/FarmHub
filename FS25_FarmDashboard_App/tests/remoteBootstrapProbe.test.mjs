import test from "node:test";
import assert from "node:assert/strict";
import { probeRemoteDashboardBootstrap } from "../web/assests/js/lan-http-auth.js";

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
