// FS25 FarmDashboard | pastures-warnings.js | v3.9.0
//
// Pure helpers for pasture warning decisions. Loaded as a regular browser
// script (window.farmDashPastureWarnings) AND as a CommonJS module
// (`module.exports`) so Jest tests exercise the same code path as production.
// pastures.js delegates the decision boundaries here; localized message
// strings stay in pastures.js because they require the i18n runtime.
//
// Telemetry-absent vs critical contract:
//   - foodReport.hasRealData === false  -> "data_unavailable" (info severity)
//   - foodReport.hasRealData === true and below threshold  -> "food" / "water"
//     (warning or danger severity)
//
// Counts are head-aware: cluster-LOD aggregate rows expose `clusterCount`,
// which we sum so warnings reflect actual head counts, not row counts.

(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.farmDashPastureWarnings = api;
  }
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
    ? window
    : typeof self !== "undefined"
    ? self
    : this,
  function () {
    function countLivestockHeads(animals) {
      if (!Array.isArray(animals)) return 0;
      var n = 0;
      for (var i = 0; i < animals.length; i++) {
        var a = animals[i];
        if (!a) continue;
        if (a.__emptyPen) continue;
        var c = Number(a.clusterCount);
        if (a.__lodClusterAggregate && Number.isFinite(c) && c > 0) n += c;
        else n += 1;
      }
      return n;
    }

    /**
     * Decide telemetry vs critical food/water warnings for a single pen.
     * Returns descriptors with structural metadata only; the caller layers
     * localized message text on top.
     */
    function buildFoodWaterDecisions(heads, foodReport) {
      var out = [];
      if (heads <= 0) return out;
      if (!foodReport) return out;
      if (foodReport.hasRealData === false) {
        out.push({
          type: "data_unavailable",
          subtype: "food",
          severity: "info",
          count: heads,
        });
        out.push({
          type: "data_unavailable",
          subtype: "water",
          severity: "info",
          count: heads,
        });
        return out;
      }
      var amount = Number(foodReport.totalMixedRation) || 0;
      var capacity = Number(foodReport.totalCapacity) || 0;
      if (capacity <= 0) return out;
      var percent = (amount / capacity) * 100;
      if (percent < 20) {
        out.push({
          type: "food",
          subtype: "totalMixedRation",
          severity: percent < 10 ? "danger" : "warning",
          percent: percent,
        });
      }
      return out;
    }

    /**
     * Estimate how many days current pen stock lasts at reported/estimated daily use.
     * @returns {{ durationDays: { food: number|null, water: number|null, straw: number|null }, durationEstimated: boolean, consumptionPerDay: { food: number, water: number, straw: number } }|null}
     */
    function computeFoodDurationEstimates(foodReport, consumptionData, animalCount) {
      if (!foodReport || foodReport.hasRealData === false) return null;
      var heads = Number(animalCount) || 0;
      if (heads <= 0) return null;

      var cons = consumptionData && typeof consumptionData === "object" ? consumptionData : {};
      var foodPerDay = Number(cons.foodPerDay || cons.food || 0);
      var waterPerDay = Number(cons.waterPerDay || cons.water || 0);
      var strawPerDay = Number(cons.strawPerDay || cons.straw || 0);
      var estimated = !!(
        cons.foodEstimated ||
        cons.waterEstimated ||
        cons.strawEstimated
      );

      if (foodPerDay <= 0) {
        foodPerDay = heads * 20;
        estimated = true;
      }
      if (waterPerDay <= 0) {
        waterPerDay = heads * 30;
        estimated = true;
      }
      if (strawPerDay <= 0) {
        strawPerDay = heads * 5;
        estimated = true;
      }

      var availableFood =
        Number(foodReport.availableFood) ||
        Number(foodReport.totalMixedRation) ||
        Number(foodReport.food) ||
        0;
      if (availableFood <= 0) {
        availableFood =
          (Number(foodReport.hay) || 0) +
          (Number(foodReport.silage) || 0) +
          (Number(foodReport.grass) || 0) +
          (Number(foodReport.forage) || 0);
      }
      var water = Number(foodReport.water) || 0;
      var straw = Number(foodReport.straw) || 0;

      function daysFor(stock, perDay) {
        if (!Number.isFinite(stock) || stock <= 0) return null;
        if (!Number.isFinite(perDay) || perDay <= 0) return null;
        return stock / perDay;
      }

      return {
        durationDays: {
          food: daysFor(availableFood, foodPerDay),
          water: daysFor(water, waterPerDay),
          straw: daysFor(straw, strawPerDay),
        },
        durationEstimated: estimated,
        consumptionPerDay: {
          food: foodPerDay,
          water: waterPerDay,
          straw: strawPerDay,
        },
      };
    }

    return {
      countLivestockHeads: countLivestockHeads,
      buildFoodWaterDecisions: buildFoodWaterDecisions,
      computeFoodDurationEstimates: computeFoodDurationEstimates,
    };
  }
);
