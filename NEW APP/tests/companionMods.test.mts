import assert from "node:assert/strict";
import test from "node:test";
import {
  companionLoansForFarm,
  detectedCompanionMods,
  formatRestrictedBanReason,
  isCompanionModsActive,
  type CompanionModsPayload,
} from "../src/lib/companionMods/index.ts";

test("isCompanionModsActive requires enabled or detected rows", () => {
  assert.equal(isCompanionModsActive(null), false);
  assert.equal(isCompanionModsActive({ enabled: false, mods: [] }), false);
  assert.equal(isCompanionModsActive({ enabled: true, mods: [] }), true);
  assert.equal(
    isCompanionModsActive({
      enabled: false,
      mods: [{ id: "x", title: "X", detected: true }],
    }),
    true,
  );
});

test("detectedCompanionMods filters undetected", () => {
  const payload: CompanionModsPayload = {
    enabled: true,
    mods: [
      { id: "a", title: "A", detected: true },
      { id: "b", title: "B", detected: false },
    ],
  };
  assert.deepEqual(
    detectedCompanionMods(payload).map((m) => m.id),
    ["a"],
  );
});

test("companionLoansForFarm resolves farm keys", () => {
  const payload: CompanionModsPayload = {
    enabled: true,
    loans: {
      enabled: true,
      byFarm: {
        "1": { count: 2, restAmount: 50000 },
      },
    },
  };
  assert.equal(companionLoansForFarm(payload, 1)?.restAmount, 50000);
  assert.equal(companionLoansForFarm(payload, 2), null);
});

test("formatRestrictedBanReason maps known codes", () => {
  assert.equal(formatRestrictedBanReason("sperrfrist"), "restricted period");
  assert.equal(formatRestrictedBanReason("frost"), "ground frost");
  assert.equal(formatRestrictedBanReason(null), null);
});
