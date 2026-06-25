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

    function isUnknownSubType(st) {
      if (st == null || st === "") return true;
      var s = String(st).trim();
      return s === "" || s.toLowerCase() === "unknown";
    }

    function resolveClusterSubType(c, husbandry) {
      if (!isUnknownSubType(c.subType)) return c.subType;
      if (!isUnknownSubType(c.animalType)) return c.animalType;
      if (husbandry && !isUnknownSubType(husbandry.animalTypeName)) {
        return husbandry.animalTypeName;
      }
      return "Unknown";
    }

    function resolveClusterHealth(c, husbandry) {
      if (typeof c.avgHealth === "number" && c.avgHealth > 0) return c.avgHealth;
      if (typeof husbandry.health === "number" && husbandry.health > 0) {
        return husbandry.health;
      }
      return 100;
    }

    function resolveAnimalGroupHeadCount(animalGroup) {
      if (!animalGroup) return 1;
      var cc = Number(animalGroup.clusterCount);
      if (
        animalGroup.__lodClusterAggregate &&
        Number.isFinite(cc) &&
        cc > 0
      ) {
        return Math.floor(cc);
      }
      var raw =
        animalGroup.count != null
          ? animalGroup.count
          : animalGroup.numAnimals != null
          ? animalGroup.numAnimals
          : NaN;
      var c = Number(raw);
      if (Number.isFinite(c) && c > 0) return Math.floor(c);
      return 1;
    }

    function shouldEmitClusterAggregateRow(animalGroup) {
      if (!animalGroup) return false;
      if (animalGroup.__lodClusterAggregate === true) return true;
      if (String(animalGroup.type || "").toLowerCase() === "cluster") {
        return true;
      }
      return resolveAnimalGroupHeadCount(animalGroup) > 1;
    }

    /** Detail file holds cluster bucket summaries (not RL individuals with uniqueId). */
    function isDetailClusterSummaryPen(husbandry) {
      if (!husbandry) return false;
      var detailReady =
        (husbandry.__detailHydrated === true || husbandry.lod === "full") &&
        Array.isArray(husbandry.animals) &&
        husbandry.animals.length > 0;
      if (!detailReady) return false;
      for (var i = 0; i < husbandry.animals.length; i++) {
        if (husbandry.animals[i] && husbandry.animals[i].uniqueId) return false;
      }
      for (var j = 0; j < husbandry.animals.length; j++) {
        var row = husbandry.animals[j];
        if (
          shouldEmitClusterAggregateRow(row) &&
          resolveAnimalGroupHeadCount(row) > 1
        ) {
          return true;
        }
      }
      return false;
    }

    function animalGroupToClusterEntry(animalGroup) {
      return {
        count: resolveAnimalGroupHeadCount(animalGroup),
        subType:
          animalGroup.subType ||
          animalGroup.type ||
          animalGroup.animalType,
        gender: animalGroup.gender,
        avgHealth: animalGroup.avgHealth != null ? animalGroup.avgHealth : animalGroup.health,
        avgWeight: animalGroup.avgWeight != null ? animalGroup.avgWeight : animalGroup.weight,
        avgAgeMonths:
          animalGroup.avgAgeMonths != null
            ? animalGroup.avgAgeMonths
            : animalGroup.ageMonths != null
            ? animalGroup.ageMonths
            : animalGroup.age,
        ageMonths: animalGroup.ageMonths != null ? animalGroup.ageMonths : animalGroup.age,
        isLactating: animalGroup.isLactating,
        isPregnant: animalGroup.isPregnant,
      };
    }

    function fanOutAnimalGroupsIndividualRows(
      husbandry,
      groups,
      farmId,
      globalCounter,
      opts
    ) {
      if (!husbandry || !Array.isArray(groups)) return [];
      var clusters = [];
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        if (!shouldEmitClusterAggregateRow(g)) continue;
        var heads = resolveAnimalGroupHeadCount(g);
        if (heads <= 1) continue;
        clusters.push(animalGroupToClusterEntry(g));
      }
      return fanOutClustersIndividualRows(
        husbandry,
        clusters,
        farmId,
        globalCounter,
        opts
      );
    }

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

        var subType = resolveClusterSubType(c, husbandry);
        var ageMonths =
          typeof c.avgAgeMonths === "number"
            ? c.avgAgeMonths
            : typeof c.ageMonths === "number"
            ? c.ageMonths
            : (c.ageDecile || 0) * 12;
        var avgHealth = resolveClusterHealth(c, husbandry);
        var avgWeight =
          typeof c.avgWeight === "number" && c.avgWeight > 0 ? c.avgWeight : null;
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
            weight: avgWeight != null ? avgWeight : 0,
            gender: c.gender || "female",
            subType: subType,
            animalTypeName: husbandry.animalTypeName || null,
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
      fanOutAnimalGroupsIndividualRows: fanOutAnimalGroupsIndividualRows,
      resolveAnimalGroupHeadCount: resolveAnimalGroupHeadCount,
      shouldEmitClusterAggregateRow: shouldEmitClusterAggregateRow,
      isDetailClusterSummaryPen: isDetailClusterSummaryPen,
      DEFAULT_PEN_HEAD_ROW_CAP: DEFAULT_PEN_HEAD_ROW_CAP,
      DEFAULT_GLOBAL_ROW_CAP: DEFAULT_GLOBAL_ROW_CAP,
    };
  }
);
