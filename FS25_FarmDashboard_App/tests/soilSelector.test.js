"use strict";

const { productionTs } = require("./helpers/production-source.cjs");

const helpers = productionTs("NEW APP/src/sections/fields/field-helpers.ts", {
    "@/i18n/i18n": {
        t: (key, params) => `${key}:${params ? JSON.stringify(params) : ""}`,
        tOr: (_key, fallback) => fallback,
    },
    "@/lib/rules-engine": {
        nitrogenTargetForDisplay: (field) => Number(field.targetNitrogen) || 0,
        PF_NUTRIENT_CLOSE_FRAC: 0.05,
    },
    "@/lib/field-harvest-state": { xmlGrowthLooksHarvested: () => false },
});

describe("soil selector current, target, zero and unknown", () => {
    test("an unscanned field is not a measured zero", () => {
        const bars = helpers.buildSoilBars({
            isPrecisionFarming: true,
            isScanned: false,
            nitrogenLevel: null,
            targetNitrogen: 120,
            phValue: null,
            targetPh: 6.5,
        });
        expect(bars.nitrogen.label).toContain("fields.needsScan");
        expect(bars.ph.label).toContain("fields.needsScan");
    });

    test("a scanned field with no current sample stays unknown while the target is kept", () => {
        const bars = helpers.buildSoilBars({
            isPrecisionFarming: true,
            isScanned: true,
            nitrogenLevel: null,
            targetNitrogen: 120,
            phValue: null,
            targetPh: 6.5,
        });
        expect(bars.nitrogen.label).toContain("Awaiting live soil map");
        expect(bars.ph.label).toContain("Awaiting live soil map");
        expect(bars.nitrogen.label).not.toContain("\"current\":0");
    });

    test("a measured nitrogen of zero is shown against its target", () => {
        const bars = helpers.buildSoilBars({
            isPrecisionFarming: true,
            isScanned: true,
            nitrogenLevel: 0,
            targetNitrogen: 120,
            phValue: 6.5,
            targetPh: 6.5,
        });
        expect(bars.nitrogen.label).toContain("\"current\":0");
        expect(bars.nitrogen.label).toContain("\"target\":120");
        expect(bars.nitrogen.label).not.toContain("Awaiting live soil map");
    });

    test("card, overview and the shared reading agree, and a target does not invent a current", () => {
        const field = {
            isPrecisionFarming: true,
            isScanned: true,
            nitrogenLevel: null,
            targetNitrogen: 80,
            phValue: null,
            targetPh: 6.2,
            soilSampledAt: 1000,
        };
        const reading = helpers.resolveSoilReading(field);
        expect(reading.nitrogen.current).toBeNull();
        expect(reading.nitrogen.target).toBe(80);
        expect(reading.nitrogen.reason).toBe("awaiting-live");
        expect(reading.nitrogen.sampledAt).toBe(1000);
        expect(helpers.overviewSoilLine(field)).toContain("Awaiting live soil map");
        const bars = helpers.buildSoilBars(field);
        expect(bars.nitrogen.label).toContain("Awaiting live soil map");
        const zero = helpers.resolveSoilReading({
            isPrecisionFarming: true,
            isScanned: true,
            nitrogenLevel: 0,
            targetNitrogen: 80,
            soilSampledAt: 1000,
        });
        expect(zero.nitrogen.reason).toBe("measured-zero");
        expect(zero.nitrogen.current).toBe(0);
        const held = helpers.resolveSoilReading({
            isPrecisionFarming: true,
            isScanned: true,
            soilReadState: "failed",
            nitrogenLevel: null,
            targetNitrogen: 80,
            soilSampledAt: 1000,
        });
        expect(held.nitrogen.reason).toBe("held");
        expect(held.nitrogen.current).toBeNull();
        const remembered = {
            isPrecisionFarming: true,
            isScanned: true,
            soilReadState: "failed",
            nitrogenLevel: 100,
            targetNitrogen: 100,
            phValue: 6.5,
            targetPh: 6.5,
            soilSampledAt: 1000,
        };
        const rememberedBars = helpers.buildSoilBars(remembered);
        expect(helpers.resolveSoilReading(remembered).nitrogen.reason).toBe("held");
        expect(rememberedBars.nitrogen.colour).toBe("#6c757d");
        expect(rememberedBars.nitrogen.label).toContain("fields.soilLastKnown");
        expect(helpers.overviewSoilLine(remembered)).toContain("fields.soilLastKnown");
        const currentBars = helpers.buildSoilBars({
            isPrecisionFarming: true,
            isScanned: true,
            nitrogenLevel: 100,
            targetNitrogen: 100,
            phValue: 6.5,
            targetPh: 6.5,
            soilSampledAt: 1000,
        });
        expect(currentBars.nitrogen.colour).not.toBe(rememberedBars.nitrogen.colour);
    });
});
