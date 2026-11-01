"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "SnowContractsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_354811_FS25_SnowContracts = true }
  _G.FS25_354811_FS25_SnowContracts = { SnowContracts = {
    _pending = { [1] = 187.345, [2] = 991.23 },
    _paidTotal = { [1] = 7000 },
  } }
`;

test("reads only this farm's unpaid amount, without session-paid total", () => {
    const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "complete",
        byFarm: { "1": { pendingAmount: 187.35 } } });
    expect(JSON.stringify(page)).not.toContain("991.23");
    expect(JSON.stringify(page)).not.toContain("7000");
});

test("distinguishes zero pending from a missing mod register", () => {
    const zero = SETUP.replace("[1] = 187.345, ", "");
    expect(runCompanionPage(FILE, zero, { farmId: 1 })).toMatchObject({
        readState: "ok", byFarm: { "1": { pendingAmount: 0 } },
    });
    const shadow = `
      _G.g_modIsLoaded = { FS25_354811_FS25_SnowContracts = true }
      _G.SnowContracts = { _pending = { [1] = 500 } }
    `;
    expect(runCompanionPage(FILE, shadow, { farmId: 1 })).toMatchObject({
        readState: "settings-only", reason: "no-pending-register",
    });
    expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});

test("accepts the byte-identical alternate vault archive name", () => {
    const alternate = SETUP.replaceAll("FS25_354811_FS25_SnowContracts", "KM_76170_Snow_Contracts");
    expect(runCompanionPage(FILE, alternate, { farmId: 1 })).toMatchObject({
        readState: "ok", byFarm: { "1": { pendingAmount: 187.35 } },
    });
});
