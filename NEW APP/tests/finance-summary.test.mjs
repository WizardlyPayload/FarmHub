import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/economy.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const isolated = compiled.replace(/^import .*;\s*$/gm, "");
const { calculateTotalPurchases, computeFinancialSummary } = await import(
  `data:text/javascript,${encodeURIComponent(isolated)}`
);

test("tracked assets include farm-owned pallets and use resale value when available", () => {
  const vehicles = [
    { ownerFarmId: 1, typeName: "pallet", price: 900, sellValue: 450 },
    { ownerFarmId: 1, typeName: "tractor", price: 5000, sellValue: 4200 },
    { ownerFarmId: 2, typeName: "pallet", price: 1200, sellValue: 600 },
  ];
  assert.equal(calculateTotalPurchases(vehicles, 1), 4650);
  assert.equal(calculateTotalPurchases(vehicles, 2), 600);
});

test("finance buckets are added only to their own farm, with purchase price as legacy fallback", () => {
  const data = {
    farmInfo: [
      { id: 1, money: 1000, loan: 100 },
      { id: 2, money: 2000, loan: 0 },
    ],
    finance: { farmId: 1, buildings: { totalValue: 300 } },
    vehicles: [
      { ownerFarmId: 1, price: 500 },
      { ownerFarmId: 2, price: 900, sellValue: 600 },
    ],
  };
  assert.deepEqual(computeFinancialSummary({ ...data, activeFarmId: 1 }), {
    money: 1000,
    loan: 100,
    totalPurchases: 800,
    netWorth: 1700,
  });
  assert.deepEqual(computeFinancialSummary({ ...data, activeFarmId: 2 }), {
    money: 2000,
    loan: 0,
    totalPurchases: 600,
    netWorth: 2600,
  });
});
