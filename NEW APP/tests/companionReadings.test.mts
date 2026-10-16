import assert from "node:assert/strict";
import test from "node:test";
import {
  companionLoansForFarm,
  cropRegionView,
  loanFarmView,
  restrictionAdvice,
} from "../src/lib/companionMods/readings.ts";

test("companionLoansForFarm resolves farm keys", () => {
  const payload = {
    loans: { enabled: true, byFarm: { "1": { count: 2, restAmount: 50000 } } },
  };
  assert.equal(companionLoansForFarm(payload, 1)?.restAmount, 50000);
  assert.equal(companionLoansForFarm(payload, 2), null);
});

test("a missing farm is zero only when coverage is complete", () => {
  const shared = {
    enabled: true,
    readState: "ok",
    restAmount: 80000,
    loanCount: 2,
    byFarm: { "2": { count: 2, restAmount: 80000 } },
  };
  const absent = loanFarmView({ loans: shared }, 1);
  assert.equal(absent.status, "unavailable");
  const covered = loanFarmView({ loans: { ...shared, coverage: "complete" } }, 1);
  assert.equal(covered.status, "ok");
  if (covered.status === "ok") {
    assert.equal(covered.restAmount, 0);
    assert.equal(covered.count, 0);
  }
  const farmB = loanFarmView({ loans: shared }, 2);
  assert.equal(farmB.status, "ok");
  if (farmB.status === "ok") assert.equal(farmB.restAmount, 80000);
});

test("explicit measured zero stays zero and a malformed row does not", () => {
  const zero = loanFarmView({
    loans: {
      enabled: true,
      readState: "ok",
      restAmount: 80000,
      loanCount: 2,
      byFarm: {
        "1": { count: 0, restAmount: 0 },
        "2": { count: 2, restAmount: 80000 },
      },
    },
  }, 1);
  assert.equal(zero.status, "ok");
  if (zero.status === "ok") {
    assert.equal(zero.restAmount, 0);
    assert.equal(zero.count, 0);
  }
  assert.deepEqual(
    loanFarmView({
      loans: { enabled: true, readState: "ok", byFarm: { "1": {} } },
    }, 1),
    { status: "unavailable" },
  );
});

test("loan states that are not an explicit success stay unavailable", () => {
  for (const readState of [undefined, "pending", "partial", "stale", "disabled"]) {
    assert.equal(
      loanFarmView({
        loans: { enabled: true, readState, restAmount: 0, loanCount: 0, byFarm: {} },
      }, 1).status,
      "unavailable",
    );
  }
});

test("a failed loan read is unavailable, not zero and not the aggregate", () => {
  assert.deepEqual(
    loanFarmView(
      { loans: { enabled: true, readState: "failed", restAmount: 80000, byFarm: {} } },
      1,
    ),
    { status: "unavailable" },
  );
});

test("missing restriction API is not spreading allowed", () => {
  assert.equal(restrictionAdvice({ enabled: true, readState: "unavailable" }), "unavailable");
  assert.equal(restrictionAdvice({ enabled: true }), "unavailable");
  for (const readState of ["pending", "partial", "stale", "disabled", "failed"]) {
    assert.equal(
      restrictionAdvice({ enabled: true, readState, anyActive: false }),
      "unavailable",
    );
  }
  assert.equal(restrictionAdvice({ enabled: true, readState: "ok", anyActive: false }), "allowed");
  assert.equal(restrictionAdvice({ enabled: true, readState: "ok", anyActive: true }), "banned");
});

test("missing crop region is not labelled vanilla", () => {
  assert.deepEqual(cropRegionView({ enabled: true, readState: "unavailable" }), { status: "unavailable" });
  assert.deepEqual(cropRegionView({ enabled: true, readState: "pending", selectedRegion: "old-region" }), {
    status: "unavailable",
  });
  assert.deepEqual(cropRegionView({ enabled: true, readState: "failed", selectedRegion: "alpine" }), {
    status: "unavailable",
  });
  assert.deepEqual(cropRegionView({ enabled: true, readState: "ok", selectedRegion: null }), {
    status: "unavailable",
  });
  assert.deepEqual(cropRegionView({ enabled: true, readState: "ok", selectedRegion: "  " }), {
    status: "unavailable",
  });
  assert.deepEqual(cropRegionView({ enabled: true, readState: "ok", selectedRegion: "vanilla" }), {
    status: "ok",
    region: "vanilla",
  });
  assert.deepEqual(cropRegionView({ enabled: true, readState: "ok", selectedRegion: "alpine" }), {
    status: "ok",
    region: "alpine",
  });
});
