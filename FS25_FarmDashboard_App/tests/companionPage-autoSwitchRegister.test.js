"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const FILE = "AutoSwitchRegisterCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_82844_AutoSwitch = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82844_AutoSwitch", version = "1.0.3.0" }
  } end }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.AS_Register = {
    weighings = {
      { farmId = 1, year = 4, period = 6, dayInPeriod = 2, minutes = 600,
        vehicle = "MF 8570", site = "Mill", fillType = "WHEAT", load = 8350, total = 14600 },
      { farmId = 2, year = 4, period = 6, dayInPeriod = 2, minutes = 601,
        vehicle = "Other farm secret", load = 999999, total = 999999 },
    },
    sales = {
      { farmId = 1, year = 4, period = 6, dayInPeriod = 2, minutes = 605,
        fillType = "WHEAT", station = "Mill", liters = 10000, kg = 7800,
        money = 2000, pending = 2000 },
      { farmId = 2, year = 4, period = 6, dayInPeriod = 2, minutes = 606,
        fillType = "BARLEY", liters = 999999, kg = 999999, money = 999999 },
    }
  }
`;

test("exports only the selected farm's recorded weighing and sale", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { weighingCount: 1, saleCount: 1 } } });
  expect(page.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "weighing", vehicle: "MF 8570", loadKg: 8350 }),
    expect.objectContaining({ kind: "sale", fillType: "WHEAT", litres: 10000, pending: 2000 }),
  ]));
  expect(JSON.stringify(page)).not.toContain("999999");
  expect(JSON.stringify(page)).not.toContain("Other farm secret");
});

test("does not assert zero or money from an empty or invalid register", () => {
  const empty = runCompanionPage(FILE, GAME.replace(/weighings = \{[\s\S]*?\},\n    sales = \{[\s\S]*?\}\n  \}/, "weighings = {}, sales = {}\n  }"), { farmId: 1 });
  expect(empty).toMatchObject({ readState: "settings-only", reason: "no-farm-records" });
  expect(empty.byFarm).toBeUndefined();
  const invalid = runCompanionPage(FILE, GAME.replace("load = 8350", "load = 0/0"), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(invalid.rows).toBeUndefined();
  expect(invalid.byFarm).toBeUndefined();
});

test("gates wrong version and client state", () => {
  expect(runCompanionPage(FILE, GAME.replace("1.0.3.0", "9.9.9.9"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, GAME.replace("return true", "return false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-register-only" });
});

test("shows recent readings without claiming a full total when the register is long", () => {
  const entries = Array.from({ length: 61 }, (_, i) =>
    `{ farmId = 1, year = 4, period = 6, dayInPeriod = 2, minutes = ${i}, vehicle = "Vehicle ${i}", load = ${i}, total = 10000 },`
  ).join("\n");
  const game = GAME.replace(/weighings = \{[\s\S]*?\},\n    sales = \{/, `weighings = {${entries}\n    },\n    sales = {`);
  const page = runCompanionPage(FILE, game, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "truncated" });
  expect(page.byFarm).toBeUndefined();
  expect(page.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "weighing", vehicle: "Vehicle 60" }),
  ]));
  expect(JSON.stringify(page)).not.toContain("Vehicle 0");
});
