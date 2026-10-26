"use strict";

const { productionTs } = require("./helpers/production-source.cjs");
const { isSoilCollectionPending } = productionTs(
  "NEW APP/src/sections/fields/soil-collection-state.ts",
);

const pending = (soil, mods) => ({
  collectorModules: { rfSoilFertilizer: true },
  realisticFarming: {
    soilFertilizer: soil,
    presence: { mods },
  },
});

describe("Soil Fertilizer collection state", () => {
  test("withholds advice before the enabled collector produces a result", () => {
    expect(isSoilCollectionPending(pending({ enabled: false }, []))).toBe(true);
    expect(isSoilCollectionPending(pending(null, [{ id: "FS25_RedTape", detected: true }]))).toBe(true);
    expect(isSoilCollectionPending(pending({ enabled: false, reason: "manager-missing", modLoaded: true }, []))).toBe(true);
    expect(isSoilCollectionPending(pending({ enabled: false, reason: "not-initialized", modLoaded: true }, []))).toBe(true);
  });

  test("restores normal advice when soil is active or definitively unavailable", () => {
    expect(isSoilCollectionPending(pending({ enabled: true }, []))).toBe(false);
    expect(isSoilCollectionPending(pending({ enabled: false, reason: "mod-absent", modLoaded: false }, []))).toBe(false);
    expect(isSoilCollectionPending(pending({ enabled: false, reason: "settings-disabled", modLoaded: true }, []))).toBe(false);
    expect(isSoilCollectionPending(pending({ enabled: false, reason: "pf-conflict", modLoaded: true }, []))).toBe(false);
    expect(isSoilCollectionPending(pending({ enabled: false }, [{ id: "FS25_SoilFertilizer", detected: false }]))).toBe(false);
  });

  test("does not gate vanilla fields when the collector is not configured", () => {
    expect(isSoilCollectionPending(null)).toBe(false);
    expect(isSoilCollectionPending({ collectorModules: { rfSoilFertilizer: false } })).toBe(false);
  });
});
