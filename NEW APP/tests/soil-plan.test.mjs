import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/realisticFarming/land/index.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { buildRfSoilPanel } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function fieldInfo(direction) {
  return {
    enabled: true,
    pfConflict: false,
    nitrogen: { value: 50, status: "good" },
    phosphorus: { value: 55, status: "good" },
    potassium: { value: 30, status: "fair" },
    cropTargets: { N: { opt: 50 }, P: { opt: 40 }, K: { opt: 40 } },
    pH: 6.3,
    treatmentPlan: [
      { key: "p", label: "P", text: "Above target - skip P product this pass.", priority: "watch", ...(direction ? { direction } : {}) },
      { key: "k", label: "K", text: "Top-up with POTASH", priority: "watch", ...(direction ? { direction: "below" } : {}) },
      { key: "ph", label: "pH", text: "Apply LIME", priority: "urgent" },
    ],
  };
}

for (const direction of ["above", undefined]) {
  test(`above-target P is not described as a deficit (${direction ?? "legacy payload"})`, () => {
    const plan = buildRfSoilPanel(fieldInfo(direction))?.plan;
    assert.ok(plan);
    assert.deepEqual(
      plan.reasons.find((r) => r.key === "fields.rf.soil.reasonNutrientBelowTarget")?.params,
      { list: "K" },
    );
    assert.deepEqual(
      plan.reasons.find((r) => r.key === "fields.rf.soil.reasonNutrientAboveTarget")?.params,
      { list: "P" },
    );
    assert.ok(plan.reasons.some((r) => r.key === "fields.rf.soil.reasonPhLow"));
  });
}
