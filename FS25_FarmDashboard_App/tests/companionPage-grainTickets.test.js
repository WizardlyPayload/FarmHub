"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "GrainTicketsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_DownCropsAndTickets = true }
  _G.FS25_DownCropsAndTickets = { HighWindCropDamage = {
    isServer = true, cropTicketYear = 3, cropTickets = {
      { id = 5, farmId = 1, year = 3, period = 8, day = 2,
        cropTitle = "Barley", stationName = "Grain Mill", liters = 100,
        gross = 200, deductionAmount = 12, net = 188, grade = "B" },
      { id = 6, farmId = 2, year = 3, period = 8, day = 2,
        cropTitle = "Private crop", stationName = "Private station", liters = 900,
        gross = 2000, deductionAmount = 0, net = 2000 },
    }
  } }
`;

test("exports only this farm's completed current-year grain tickets", () => {
    const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
    expect(page.readState).toBe("ok");
    expect(page.cropYear).toBe(3);
    expect(page.byFarm["1"]).toMatchObject({ ticketCount: 1, gross: 200, deductions: 12, net: 188 });
    expect(page.rows).toEqual([expect.objectContaining({ crop: "Barley", liters: 100, farmId: 1, net: 188 })]);
    expect(normalizeCompanionPages({ pages: { grainTickets: page } }, { modules: loadModules() })
        .pages.grainTickets.rows).toHaveLength(1);
});

test("withholds an unloaded or client-only register", () => {
    expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    const client = SETUP.replace("isServer = true", "isServer = false");
    expect(runCompanionPage(FILE, client, { farmId: 1 })).toMatchObject({
        readState: "settings-only", reason: "no-server-tickets",
    });
});

test("withholds full farm ticket totals when an owned ticket is invalid or the scan ends early", () => {
    const malformed = SETUP.replace("gross = 200, deductionAmount = 12, net = 188", "gross = -1, deductionAmount = 12, net = 188");
    const partial = runCompanionPage(FILE, malformed, { farmId: 1 });
    expect(partial).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(partial.byFarm).toBeUndefined();

    const capped = runCompanionPage(FILE, SETUP + `
      local p = _G.FS25_DownCropsAndTickets.HighWindCropDamage.cropTickets
      for i = 1, 201 do p[#p + 1] = { farmId = 2 } end
    `, { farmId: 1 });
    expect(capped).toMatchObject({ readState: "partial", coverage: "truncated" });
    expect(capped.byFarm).toBeUndefined();
});

test("keeps complete farm totals when only the displayed ticket rows are capped", () => {
    const listed = runCompanionPage(FILE, SETUP + `
      local p = _G.FS25_DownCropsAndTickets.HighWindCropDamage.cropTickets
      for i = 1, 97 do p[#p + 1] = {
        farmId = 1, liters = 10, gross = 20, deductionAmount = 2, net = 18,
      } end
    `, { farmId: 1 });
    expect(listed).toMatchObject({ readState: "ok", coverage: "truncated",
        byFarm: { "1": { ticketCount: 98, gross: 2140, deductions: 206, net: 1934 } } });
    expect(listed.rows).toHaveLength(96);
});
