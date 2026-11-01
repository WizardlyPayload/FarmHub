"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "GrassContractsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_377438_Grass_Contracts = true }
  _G.FS25_377438_Grass_Contracts = { GrassContracts = {
    _pending = { [1] = 52.785, [2] = 1500 },
    _paidTotal = { [1] = 300 },
  } }
`;

test("reads this farm's pending mowing amount without other farms or paid totals", () => {
    const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "complete",
        byFarm: { "1": { pendingAmount: 52.79 } } });
    expect(JSON.stringify(page)).not.toContain("1500");
    expect(JSON.stringify(page)).not.toContain("300");
});

test("handles zero pending and rejects an unrelated global shadow", () => {
    expect(runCompanionPage(FILE, SETUP.replace("[1] = 52.785, ", ""), { farmId: 1 }))
        .toMatchObject({ readState: "ok", byFarm: { "1": { pendingAmount: 0 } } });
    const shadow = `
      _G.g_modIsLoaded = { FS25_377438_Grass_Contracts = true }
      _G.GrassContracts = { _pending = { [1] = 500 } }
    `;
    expect(runCompanionPage(FILE, shadow, { farmId: 1 })).toMatchObject({
        readState: "settings-only", reason: "no-pending-register",
    });
});
