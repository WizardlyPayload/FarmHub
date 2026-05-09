// FS25 FarmDashboard | realtime-fanout.js | v3.9.0
//
// Pure helper: fans out mod LOD `clusters[]` into one dashboard row per animal head.
// Loaded as a regular browser script (exposing `window.farmDashFanOut`) AND as a
// CommonJS module (`module.exports`) so Jest tests can exercise the same code path
// that ships in production. realtime-connector.js delegates here.
//
// `globalCounter.emitted` counts emitted rows (heads); `globalCounter.trimmed`
// counts heads skipped by the per-pen and global caps; `globalCounter.capHit`
// flips true the moment the global cap is reached.

(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.farmDashFanOut = api;
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
    var DEFAULT_PEN_HEAD_ROW_CAP = 4096;
    var DEFAULT_GLOBAL_ROW_CAP = 8000;

    function fanOutClustersIndividualRows(
      husbandry,
      clusters,
      farmId,
      globalCounter,
      opts
    ) {
      var out = [];
      if (!husbandry || !Array.isArray(clusters)) return out;

      var penCap =
        opts && Number.isFinite(opts.penCap)
          ? Math.floor(opts.penCap)
          : DEFAULT_PEN_HEAD_ROW_CAP;
      var globalCap =
        globalCounter && Number.isFinite(globalCounter.cap)
          ? Math.floor(globalCounter.cap)
          : opts && Number.isFinite(opts.globalCap)
          ? Math.floor(opts.globalCap)
          : DEFAULT_GLOBAL_ROW_CAP;

      var huName = husbandry.name || husbandry.buildingName;
      var huId = husbandry.id || husbandry.buildingId;

      var headsThisPen = 0;
      var trimmedHeads = 0;

      outer: for (var ci = 0; ci < clusters.length; ci++) {
        var c = clusters[ci];
        if (!c || !c.count || c.count <= 0) continue;

        var subType = c.subType || c.animalType || "Unknown";
        var ageMonths =
          typeof c.avgAgeMonths === "number"
            ? c.avgAgeMonths
            : typeof c.ageMonths === "number"
            ? c.ageMonths
            : (c.ageDecile || 0) * 12;
        var avgHealth = typeof c.avgHealth === "number" ? c.avgHealth : 100;
        var avgWeight = typeof c.avgWeight === "number" ? c.avgWeight : 0;
        var nTotal = Math.floor(Number(c.count)) || 0;

        var genetics =
          typeof c.avgGenFert === "number"
            ? {
                fertility: c.avgGenFert,
                productivity: c.avgGenProd,
                health: c.avgGenHealth,
                metabolism: c.avgGenMetabolism,
                quality: c.avgGenQuality,
              }
            : null;

        for (var hi = 0; hi < nTotal; hi++) {
          if (headsThisPen >= penCap) {
            trimmedHeads += nTotal - hi;
            for (var cj = ci + 1; cj < clusters.length; cj++) {
              var cc = clusters[cj];
              if (cc && cc.count > 0)
                trimmedHeads += Math.floor(Number(cc.count)) || 0;
            }
            break outer;
          }
          if (
            globalCounter &&
            (globalCounter.emitted || 0) >= globalCap
          ) {
            trimmedHeads += nTotal - hi;
            for (var ck = ci + 1; ck < clusters.length; ck++) {
              var cd = clusters[ck];
              if (cd && cd.count > 0)
                trimmedHeads += Math.floor(Number(cd.count)) || 0;
            }
            break outer;
          }

          var id = (huId || "pen") + "-c" + ci + "-h" + hi;
          out.push({
            id: id,
            name: "" + subType,
            husbandryName: huName,
            husbandryId: huId,
            ownerFarmId: husbandry.ownerFarmId || husbandry.farmId,
            farmId: farmId,
            age: ageMonths,
            health: avgHealth,
            weight: avgWeight,
            gender: c.gender || "female",
            subType: subType,
            location: huName,
            locationType: "pasture",
            isLactating: !!c.isLactating,
            isPregnant: !!c.isPregnant,
            isParent: false,
            genetics: genetics,
            productivity: c.avgGenProd != null ? c.avgGenProd : null,
            __lodSynth: true,
            __lodSynthEstimate: true,
          });
          headsThisPen += 1;
          if (globalCounter) {
            globalCounter.emitted = (globalCounter.emitted || 0) + 1;
          }
        }
      }

      if (trimmedHeads > 0) {
        husbandry.__lodTrimmed = trimmedHeads;
        if (globalCounter)
          globalCounter.trimmed =
            (globalCounter.trimmed || 0) + trimmedHeads;
      }
      if (
        globalCounter &&
        (globalCounter.emitted || 0) >= globalCap
      ) {
        globalCounter.capHit = true;
      }
      return out;
    }

    return {
      fanOutClustersIndividualRows: fanOutClustersIndividualRows,
      DEFAULT_PEN_HEAD_ROW_CAP: DEFAULT_PEN_HEAD_ROW_CAP,
      DEFAULT_GLOBAL_ROW_CAP: DEFAULT_GLOBAL_ROW_CAP,
    };
  }
);
