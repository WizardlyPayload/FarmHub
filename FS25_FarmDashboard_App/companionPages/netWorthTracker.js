"use strict";

module.exports = {
    key: "netWorthTracker",
    arrays: ["rows"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object"
            ? new Set(Object.keys(page.byFarm)) : new Set();
        page.rows = page.rows.filter((row) => row && typeof row === "object"
            && farms.has(String(row.farmId))
            && Number.isFinite(row.dayId) && row.dayId >= 0
            && Number.isFinite(row.amount));
        return page;
    },
};
