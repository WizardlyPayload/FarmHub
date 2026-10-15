import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../src/platform/urgent-alerts.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const exports = {};
runInNewContext(outputText, {
  exports,
  require(specifier) {
    if (specifier === "@/i18n/i18n") return { t: (key) => key };
    if (specifier === "@/sections/fields/field-helpers") {
      return { effectiveHarvestReady: () => false, fieldShowsWithered: () => false };
    }
    throw new Error(`Unexpected import: ${specifier}`);
  },
});

const { processUrgentAlertTransitions } = exports;
const criticalVehicle = (id) => ({
  id,
  name: id,
  ownerFarmId: 1,
  isMotorized: true,
  fuelCapacity: 100,
  fuelLevel: 10,
});
const dashboard = (status) => {
  const history = [];
  return {
    activeFarmId: 1,
    sectionOutcomes: status ? { vehicles: { status } } : undefined,
    vehicles: [],
    addNotificationToHistory: (item) => history.push(item),
    history,
  };
};

test("first complete vehicle scan baselines standing faults silently", () => {
  const data = dashboard("unknown");
  processUrgentAlertTransitions(data, undefined, "server::1::save3");
  data.vehicles = [criticalVehicle("tractor-1")];
  data.sectionOutcomes.vehicles.status = "complete";
  processUrgentAlertTransitions(data, undefined, "server::1::save3");
  assert.equal(data.history.length, 0);

  processUrgentAlertTransitions(data, undefined, "server::1::save3");
  assert.equal(data.history.length, 0);

  data.vehicles.push(criticalVehicle("tractor-2"));
  processUrgentAlertTransitions(data, undefined, "server::1::save3");
  assert.equal(data.history.length, 1);
  assert.match(data.history[0].title, /vehicle/i);
});

test("a provisional gap re-baselines the next complete vehicle scan", () => {
  const data = dashboard("complete");
  data.vehicles = [criticalVehicle("tractor-1")];
  processUrgentAlertTransitions(data, undefined, "server::1::save3");
  data.sectionOutcomes.vehicles.status = "unknown";
  data.vehicles = [];
  processUrgentAlertTransitions(data, undefined, "server::1::save3");
  data.sectionOutcomes.vehicles.status = "complete";
  data.vehicles = [criticalVehicle("tractor-1")];
  processUrgentAlertTransitions(data, undefined, "server::1::save3");
  assert.equal(data.history.length, 0);
  data.vehicles.push(criticalVehicle("tractor-2"));
  processUrgentAlertTransitions(data, undefined, "server::1::save3");
  assert.equal(data.history.length, 1);
});

test("legacy payloads without section outcomes retain transition behavior", () => {
  const data = dashboard();
  processUrgentAlertTransitions(data, undefined, "server::1::save3");
  data.vehicles = [criticalVehicle("tractor-1")];
  processUrgentAlertTransitions(data, undefined, "server::1::save3");
  assert.equal(data.history.length, 1);
});

test("watcher passes vehicle section provenance before announcing later faults", () => {
  const watcherSource = readFileSync(new URL("../src/platform/UrgentAlertsWatcher.tsx", import.meta.url), "utf8");
  const watcherJs = ts.transpileModule(watcherSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const history = [];
  const refs = [];
  let refIndex = 0;
  let currentPayload;
  const watcherExports = {};
  runInNewContext(watcherJs, {
    exports: watcherExports,
    require(specifier) {
      if (specifier === "preact/hooks") return {
        useEffect: (callback) => callback(),
        useRef: (initial) => refs[refIndex++] ??= { current: initial },
      };
      if (specifier === "@/store/dashboard-store") return {
        useDashboardStore: (selector) => selector({
          payload: currentPayload,
          activeFarmId: 1,
          activeServerId: "server",
        }),
      };
      if (specifier === "@/platform/notifications") return {
        addNotificationToHistory: (item) => history.push(item),
        setNotificationScope: () => {},
      };
      if (specifier === "@/platform/urgent-alerts") return exports;
      if (specifier === "@/platform/major-deltas") return {
        advanceMajorDeltaTracker: () => ({ state: null, events: [] }),
        takeMajorDeltaSnapshot: () => null,
      };
      if (specifier === "@/platform/ChangesModal") return { showToast: () => {} };
      throw new Error(`Unexpected import: ${specifier}`);
    },
  });

  const scan = (vehicles, status) => {
    currentPayload = {
      serverInfo: { saveSlot: "save3" },
      vehicles,
      fields: [],
      sectionOutcomes: { vehicles: { status } },
    };
    refIndex = 0;
    watcherExports.UrgentAlertsWatcher();
  };
  scan([], "unknown");
  scan([criticalVehicle("tractor-1")], "complete");
  assert.equal(history.length, 0);
  scan([criticalVehicle("tractor-1"), criticalVehicle("tractor-2")], "complete");
  assert.equal(history.length, 1);
});
