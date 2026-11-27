"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "TransportCompanyCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_TransportCompany = true }
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
  }
  _G.g_transportCompanyManager = {
    isMissionLoaded = true, isServer = true,
    companies = {
      [1] = {
        farmId = 1, isArchived = true, hqLevel = 2, reputation = 34,
        getIsActive = function() return false end,
        ledger = { revenue = 15000.35, driverWages = 1200, jobs = 7 },
        contracts = {
          a = { contractId = "a", state = 2, farmId = 1, sourceName = "Mill",
            destName = "Dairy", fillTypeIndex = 4, contractType = 1,
            amount = 10000, delivered = 2500, reward = 4500, deadline = 43 },
          b = { contractId = "b", state = 1, farmId = 0, amount = 9999, delivered = 0, reward = 99999 },
        },
        trucks = {
          sold = { uniqueId = "sold", vehicleName = "Old lorry", farmId = 1,
            distanceM = 12000, revenue = 6400, fuelCost = 100, otherCost = 50,
            jobsDelivered = 3, isEnrolled = false },
          foreign = { uniqueId = "foreign", vehicleName = "Other lorry", farmId = 2,
            distanceM = 500000, revenue = 99999, fuelCost = 0, otherCost = 0, jobsDelivered = 90 },
        },
        drivers = { d1 = { driverId = "d1", name = "Sam", weeklyWage = 300,
          jobsDone = 3, assignedTruckUniqueId = "" } },
      },
      [2] = { farmId = 2, ledger = { revenue = 999999, driverWages = 1, jobs = 9 },
        contracts = {}, trucks = {}, drivers = {} },
    },
  }
`;

test("reads exact farm company books and labels sold truck records as history", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm["1"]).toMatchObject({ archived: true, revenue: 15000.35,
    active: false, driverWages: 1200, jobs: 7, acceptedCount: 1, truckBookCount: 1, driverCount: 1 });
  expect(page.contracts).toHaveLength(1);
  expect(page.contracts[0]).toMatchObject({ source: "Mill", destination: "Dairy",
    amount: 10000, delivered: 2500, reward: 4500 });
  expect(page.truckBooks).toHaveLength(1);
  expect(page.truckBooks[0]).toMatchObject({ name: "Old lorry", distanceKm: 12, jobsDone: 3 });
  expect(page.drivers).toHaveLength(1);
  const merged = normalizeCompanionPages({ pages: { transportCompany: page } }, { modules: loadModules() });
  expect(merged.pages.transportCompany.truckBooks).toHaveLength(1);
});

test("withholds client, missing company, and mismatched farm identity", () => {
  expect(runCompanionPage(FILE, GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-state-only" });
  expect(runCompanionPage(FILE, GAME.replace("[1] = {\n        farmId = 1", "[1] = {\n        farmId = 2"), { farmId: 1 }))
    .toMatchObject({ readState: "partial", reason: "farm-identity-mismatch" });
  expect(runCompanionPage(FILE, GAME.replace("FS25_TransportCompany = true", "OtherMod = true"), { farmId: 1 }))
    .toBeUndefined();
});
