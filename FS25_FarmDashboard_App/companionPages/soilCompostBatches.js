"use strict";

module.exports = {
    key: "soilCompostBatches",
    arrays: ["rows"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object"
            ? new Set(Object.keys(page.byFarm)) : new Set();
        page.rows = page.rows.filter((row) => row && typeof row === "object"
            && (farms.size === 0 || farms.has(String(row.farmId)))
            && Number.isInteger(row.batchId) && row.batchId > 0
            && Number.isFinite(row.outputLitres) && row.outputLitres > 0);
        return page;
    },
};
