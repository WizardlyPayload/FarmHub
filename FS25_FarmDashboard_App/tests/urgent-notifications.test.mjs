import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {
  fetch: async () => ({
    ok: true,
    json: async () => ({ strings: {} }),
  }),
  localStorage: {
    getItem: () => null,
    setItem() {},
  },
  dispatchEvent() {},
};

const { getVehicleFuelPercent, collectUrgentAlerts, processUrgentAlertTransitions } =
  await import("../web/assests/js/modules/urgent-notifications.js");

test("getVehicleFuelPercent returns -1 for non-motorized", () => {
  assert.equal(getVehicleFuelPercent({ isMotorized: false }), -1);
});

test("getVehicleFuelPercent computes from tank level", () => {
  assert.equal(
    getVehicleFuelPercent({
      isMotorized: true,
      fuelCapacity: 200,
      fuelLevel: 50,
    }),
    25
  );
});

test("collectUrgentAlerts includes pasture danger and skips info", () => {
  const alerts = collectUrgentAlerts({
    activeFarmId: 1,
    gameSettings: {},
    pastures: [
      {
        id: 5,
        name: "Cow Barn",
        farmId: 1,
        animalCount: 10,
        allWarnings: [
          { type: "food", severity: "danger", message: "Low food" },
          { type: "data_unavailable", severity: "info", message: "No telemetry" },
        ],
      },
    ],
    vehicles: [],
    fields: [],
  });
  assert.ok(alerts.some((a) => a.category === "pasture" && a.type === "danger"));
  assert.equal(alerts.some((a) => a.type === "info"), false);
});

test("collectUrgentAlerts includes critical fuel", () => {
  const alerts = collectUrgentAlerts({
    activeFarmId: 1,
    gameSettings: {},
    pastures: [],
    vehicles: [
      {
        id: 99,
        name: "Tractor",
        ownerFarmId: 1,
        isMotorized: true,
        fuelCapacity: 100,
        fuelLevel: 10,
      },
    ],
    fields: [],
  });
  assert.ok(alerts.some((a) => a.key.includes("fuel:critical")));
});

test("processUrgentAlertTransitions baseline does not notify", () => {
  const history = [];
  const dashboard = {
    activeFarmId: 1,
    gameSettings: {},
    pastures: [
      {
        id: 1,
        farmId: 1,
        animalCount: 5,
        allWarnings: [{ type: "health", severity: "warning", message: "Sick" }],
      },
    ],
    vehicles: [],
    fields: [],
    showAlert() {},
    addNotificationToHistory: (n) => history.push(n),
  };
  processUrgentAlertTransitions(dashboard);
  assert.equal(history.length, 0);
  assert.equal(dashboard._urgentAlertsInitialized, true);
});
