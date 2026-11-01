"use strict";

module.exports = {
    key: "harvestLedger",
    arrays: ["rows"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object"
            ? new Set(Object.keys(page.byFarm)) : new Set();
        page.rows = page.rows.filter((row) => row && typeof row === "object"
            && farms.has(String(row.farmId))
            && ["farm", "contract"].includes(row.scope)
            && Number.isFinite(row.liters) && row.liters >= 0
            && Number.isFinite(row.areaSqm) && row.areaSqm >= 0);
        return page;
    },
};
