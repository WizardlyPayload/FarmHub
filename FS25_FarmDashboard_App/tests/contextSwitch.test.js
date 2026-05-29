// FS25 FarmDashboard | tests/contextSwitch.test.js | v3.9.0
//
// Integration coverage for the realtime payload dedupe contract:
//   - Identical body bytes with a different active farm or server MUST
//     produce a different fingerprint, so the UI re-renders for that
//     farm/server even when the JSON has not changed.
//   - Volatile fields (timestamp, dataTimestamps, fieldStatusHistory) MUST
//     be stripped so heartbeat-style timestamp churn doesn't bust dedupe.
//
// Tests run against the shared `realtime-dedupe.js` helper that
// `realtime-connector.js` delegates to in production.

const {
  computePayloadDedupeKey,
  stripVolatile,
  VOLATILE_FIELDS,
} = require("../web/assests/js/realtime-dedupe.js");

const sampleBody = {
  fields: [{ id: 1 }, { id: 2 }],
  husbandryData: [{ id: 1, ownerFarmId: 1 }],
  vehicles: [],
};

describe("computePayloadDedupeKey: farm-switch invalidates dedupe", () => {
  test("same body, different active farm => different key", () => {
    const a = computePayloadDedupeKey(sampleBody, 1, "srv-A");
    const b = computePayloadDedupeKey(sampleBody, 2, "srv-A");
    expect(a).not.toBe(b);
  });

  test("same body and farm => identical key (proper dedupe)", () => {
    const a = computePayloadDedupeKey(sampleBody, 1, "srv-A");
    const b = computePayloadDedupeKey(sampleBody, 1, "srv-A");
    expect(a).toBe(b);
  });
});

describe("computePayloadDedupeKey: server-switch invalidates dedupe", () => {
  test("same body, different active server => different key", () => {
    const a = computePayloadDedupeKey(sampleBody, 1, "srv-A");
    const b = computePayloadDedupeKey(sampleBody, 1, "srv-B");
    expect(a).not.toBe(b);
  });

  test("missing serverId still produces a stable key", () => {
    const a = computePayloadDedupeKey(sampleBody, 1, undefined);
    const b = computePayloadDedupeKey(sampleBody, 1, undefined);
    expect(a).toBe(b);
  });
});

describe("stripVolatile: heartbeat fields don't bust dedupe", () => {
  test("removes all known volatile fields", () => {
    const stripped = stripVolatile({
      a: 1,
      timestamp: 12345,
      dataTimestamps: { a: 1 },
      fieldStatusHistory: [],
      b: 2,
    });
    expect(stripped).toEqual({ a: 1, b: 2 });
  });

  test("VOLATILE_FIELDS is the documented contract", () => {
    expect(VOLATILE_FIELDS).toEqual([
      "timestamp",
      "dataTimestamps",
      "fieldStatusHistory",
    ]);
  });

  test("identical body with different timestamp => identical key", () => {
    const a = computePayloadDedupeKey(
      { ...sampleBody, timestamp: 1 },
      1,
      "srv-A"
    );
    const b = computePayloadDedupeKey(
      { ...sampleBody, timestamp: 999999 },
      1,
      "srv-A"
    );
    expect(a).toBe(b);
  });
});

describe("Bootstrap-retry: clearing dedupe state lets identical payloads re-render", () => {
  // Mirrors the pattern in realtime-connector._httpPollData where the cache
  // gets reset on bootstrap or context switch via clearPayloadDedupeCache().
  test("after cache reset, the next identical payload re-applies", () => {
    let lastKey = null;
    const handlers = [];

    function processPayload(body, farmId, srv, force) {
      const key = computePayloadDedupeKey(body, farmId, srv);
      if (force) lastKey = null;
      if (lastKey === key) return false;
      lastKey = key;
      handlers.push(key);
      return true;
    }

    expect(processPayload(sampleBody, 1, "srv-A", false)).toBe(true);
    expect(processPayload(sampleBody, 1, "srv-A", false)).toBe(false);
    expect(processPayload(sampleBody, 1, "srv-A", true)).toBe(true);
    expect(handlers.length).toBe(2);
  });
});
