/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "transportCompany";
const ui = loadCompanionPage(KEY, { title: "Transport Company", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("shows accepted freight and historic truck books for the selected farm", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.3.1.0" }] },
    companionPages: { pages: { [KEY]: { key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { archived: true, hqLevel: 2, reputation: 34, revenue: 15000,
        driverWages: 1200, jobs: 7, acceptedCount: 1, truckBookCount: 1, driverCount: 1 } },
      contracts: [{ farmId: 1, id: "c1", source: "Mill", destination: "Dairy", fillTypeIndex: 4, contractType: 1,
        amount: 10000, delivered: 2500, reward: 4500, deadline: 43 }],
      truckBooks: [{ farmId: 1, vehicleId: "old", name: "Old lorry", distanceKm: 12,
        revenue: 6400, fuelCost: 100, otherCost: 50, jobsDone: 3 }],
      drivers: [{ farmId: 1, id: "d1", name: "Sam", weeklyWage: 300, jobsDone: 3 }],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("Accepted freight jobs");
  expect(host.textContent).toContain("Mill → Dairy");
  expect(host.textContent).toContain("2,500 / 10,000 L");
  expect(host.textContent).toContain("including sold vehicles");
  expect(host.textContent).toContain("Old lorry");
  expect(host.textContent).toContain("Company archived");
  expect(host.textContent).toContain("Sam");
});

test("labels pallet quantities and a disabled company without claiming a live fleet", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true }] },
    companionPages: { pages: { [KEY]: { key: KEY, detected: true, readState: "ok",
      byFarm: { "1": { archived: false, active: false, acceptedCount: 1, jobs: 0 } },
      contracts: [{ farmId: 1, id: "p1", source: "Warehouse", destination: "Shop",
        contractType: 2, amount: 6, delivered: 2, reward: 100 }],
      truckBooks: [], drivers: [],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("2 / 6 pallets");
  expect(host.textContent).toContain("Company activity is paused");
  expect(host.textContent).toContain("Truck books, including sold vehicles");
});
