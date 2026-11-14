"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RealisticFarmFinanceLoansCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_82429_Realistic_Farm_Finance = true }
  _G.g_currentMission = { getFarmId = function() return 1 end,
    realisticFarmFinance = { repository = { loaded = true, loans = {
      { id = 17, farmId = 1, type = "TERM", paidOff = false, principal = 25000.568,
        arrearsBalance = 300.4, interestRate = 5.5, remainingMonths = 18, paymentsMade = 6 },
      { id = 18, farmId = 1, type = "BULLET", paidOff = false, principal = 10000,
        arrearsBalance = 0, interestRate = 6.0, remainingMonths = 10, paymentsMade = 2 },
      { id = 19, farmId = 1, type = "REVOLVING", paidOff = false, principal = 0,
        drawnAmount = 8000, arrearsBalance = 0 },
      { id = 20, farmId = 1, type = "TERM", paidOff = true, principal = 0, arrearsBalance = 0 },
      { id = 21, farmId = 2, type = "TERM", paidOff = false, principal = 900000,
        arrearsBalance = 1000 },
    }, assetFinance = {
      { id = 31, farmId = 1, product = "HIRE_PURCHASE", status = "ACTIVE", vehicleName = "MF 8570",
        principal = 12000.345, monthlyPayment = 250.125, arrearsBalance = 10.5, remainingMonths = 24 },
      { id = 32, farmId = 1, product = "OPERATING_LEASE", status = "RETURN_DUE", vehicleName = "Trailer",
        principal = 0, monthlyPayment = 75, arrearsBalance = 0, remainingMonths = 0, refundableDeposit = 500 },
      { id = 33, farmId = 2, product = "HIRE_PURCHASE", status = "ACTIVE", vehicleName = "Other farm",
        principal = 8000, monthlyPayment = 100, arrearsBalance = 0, remainingMonths = 12 },
      { id = 34, farmId = 1, product = "HIRE_PURCHASE", status = "COMPLETED", vehicleName = "Completed",
        principal = 0, monthlyPayment = 0, arrearsBalance = 0, remainingMonths = 0 },
    }, tenancies = {
      { id = 41, farmId = 1, holdingName = "North Farm", status = "NOTICE_SERVED",
        monthlyRent = 425.255, rentDue = 425.25, arrears = 50, nextRentDuePeriod = 22 },
      { id = 42, farmId = 2, holdingName = "Other farm", status = "ACTIVE",
        monthlyRent = 1000, rentDue = 1000, arrears = 500, nextRentDuePeriod = 22 },
      { id = 43, farmId = 1, holdingName = "Ended", status = "ENDED",
        monthlyRent = 0, rentDue = 0, arrears = 0, nextRentDuePeriod = 0 },
    } } } }
`;

test("exports only supported active loans for the selected farm", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.byFarm["1"]).toMatchObject({ loanCount: 2, arrearsCount: 1, otherProductCount: 1 });
  expect(page.rows.map((row) => row.id)).toEqual([17, 18]);
  expect(page.rows[0]).toMatchObject({ kind: "TERM", principal: 25000.57, arrears: 300.4 });
  expect(page.rows.some((row) => row.farmId === 2 || row.id === 19 || row.id === 20)).toBe(false);
  expect(page.byFarm["1"]).toMatchObject({ assetFinanceCount: 2, assetArrearsCount: 1, operatingLeaseCount: 1, assetRegisterAvailable: true });
  expect(page.assetRows.map((row) => row.id)).toEqual([31, 32]);
  expect(page.assetRows[0]).toMatchObject({ asset: "MF 8570", principal: 12000.35, monthlyPayment: 250.13, arrears: 10.5 });
  expect(page.assetRows[1]).toMatchObject({ product: "OPERATING_LEASE", status: "RETURN_DUE", refundableDeposit: 500 });
  expect(page.byFarm["1"]).toMatchObject({ tenancyCount: 1, tenancyArrearsCount: 1, tenancyRegisterAvailable: true });
  expect(page.tenancyRows[0]).toMatchObject({ holding: "North Farm", monthlyRent: 425.26, rentDue: 425.25, arrears: 50, nextRentDuePeriod: 22 });
  const merged = normalizeCompanionPages({ pages: { realisticFarmFinanceLoans: page } }, { modules: loadModules() });
  expect(merged.pages.realisticFarmFinanceLoans.rows).toHaveLength(2);
  expect(merged.pages.realisticFarmFinanceLoans.assetRows).toHaveLength(2);
  expect(merged.pages.realisticFarmFinanceLoans.tenancyRows).toHaveLength(1);
});

test("withholds an absent asset register instead of reporting zero agreements", () => {
  const page = runCompanionPage(FILE, GAME.replace("assetFinance = {", "unavailableAssetFinance = {"), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm["1"].assetRegisterAvailable).toBe(false);
});

test("withholds an absent tenancy register instead of reporting zero tenancies", () => {
  const page = runCompanionPage(FILE, GAME.replace("tenancies = {", "unavailableTenancies = {"), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm["1"].tenancyRegisterAvailable).toBe(false);
});

test("shows a farm asset agreement when no supported loan exists", () => {
  const assetOnly = `
    _G.g_modIsLoaded = { KM_82429_Realistic_Farm_Finance = true }
    _G.g_currentMission = { getFarmId = function() return 1 end,
      realisticFarmFinance = { repository = { loaded = true, loans = {}, assetFinance = {
        { id = 4, farmId = 1, product = "OPERATING_LEASE", status = "ACTIVE",
          vehicleName = "Leased seeder", principal = 0, monthlyPayment = 120,
          arrearsBalance = 0, remainingMonths = 9, refundableDeposit = 600 },
      }, tenancies = {} } } }
  `;
  const page = runCompanionPage(FILE, assetOnly, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(Object.keys(page.rows)).toHaveLength(0);
  expect(page.assetRows).toHaveLength(1);
  expect(page.byFarm["1"]).toMatchObject({ loanCount: 0, assetFinanceCount: 1 });
});

test("shows a current farm tenancy without a loan or asset agreement", () => {
  const tenancyOnly = `
    _G.g_modIsLoaded = { KM_82429_Realistic_Farm_Finance = true }
    _G.g_currentMission = { getFarmId = function() return 1 end,
      realisticFarmFinance = { repository = { loaded = true, loans = {}, assetFinance = {}, tenancies = {
        { id = 6, farmId = 1, holdingName = "West Field", status = "EXPIRING",
          monthlyRent = 200, rentDue = 0, arrears = 0, nextRentDuePeriod = 25 },
      } } } }
  `;
  const page = runCompanionPage(FILE, tenancyOnly, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.byFarm["1"]).toMatchObject({ loanCount: 0, assetFinanceCount: 0, tenancyCount: 1 });
  expect(page.tenancyRows[0]).toMatchObject({ holding: "West Field", status: "EXPIRING", nextRentDuePeriod: 25 });
});

test("withholds an unloaded repository and an unloaded mod", () => {
  expect(runCompanionPage(FILE, GAME.replace("loaded = true", "loaded = false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "finance-repository-unavailable" });
  expect(runCompanionPage(FILE, GAME.replace("KM_82429_Realistic_Farm_Finance = true", "OtherMod = true"), { farmId: 1 })).toBeUndefined();
});
