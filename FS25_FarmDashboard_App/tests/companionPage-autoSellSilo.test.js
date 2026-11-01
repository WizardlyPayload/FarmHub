"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AutoSellSiloCollector.lua";
const SETUP = `
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.g_modIsLoaded = { KM_83453_Auto_Sell_Silo = true }
  _G.KM_83453_Auto_Sell_Silo = { AutoSellSilo = {
    pending = {
      { farmId = 1, amount = 1234.567, months = 6 },
      { farmId = 2, amount = 999999, months = 1 },
      { farmId = 1, amount = 100, months = 1 },
    },
    payMode = 3,
  } }
`;

test("reads only unpaid entries for the export farm and does not invent sale details", () => {
    const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "complete",
        byFarm: { "1": { pendingCount: 2, pendingAmount: 1334.57 } },
        pending: [
            { farmId: 1, amount: 100, monthsRemaining: 1 },
            { farmId: 1, amount: 1234.57, monthsRemaining: 6 },
        ] });
    expect(JSON.stringify(page)).not.toContain("999999");
    expect(JSON.stringify(page)).not.toContain("payMode");
    const merged = normalizeCompanionPages({ pages: { autoSellSilo: page } }, { modules: loadModules() });
    expect(merged.pages.autoSellSilo.pending).toHaveLength(2);
});

test("withholds client and shadow-global registers", () => {
    const client = SETUP.replace("return true", "return false");
    expect(runCompanionPage(FILE, client, { farmId: 1 })).toMatchObject({
        readState: "settings-only", reason: "server-register-only",
    });
    const shadow = `
      _G.g_currentMission = { getIsServer = function() return true end }
      _G.g_modIsLoaded = { KM_83453_Auto_Sell_Silo = true }
      _G.AutoSellSilo = { pending = { { farmId = 1, amount = 100, months = 1 } } }
    `;
    expect(runCompanionPage(FILE, shadow, { farmId: 1 })).toMatchObject({
        readState: "settings-only", reason: "pending-register-unavailable",
    });
});

test("marks malformed farm entries partial without exporting them", () => {
    const malformed = SETUP.replace("{ farmId = 1, amount = 100, months = 1 }", "{ farmId = 1, amount = -100, months = 1 }");
    const page = runCompanionPage(FILE, malformed, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial",
        byFarm: { "1": { pendingCount: 1, pendingAmount: 1234.57 } } });
    expect(page.pending).toHaveLength(1);
});
