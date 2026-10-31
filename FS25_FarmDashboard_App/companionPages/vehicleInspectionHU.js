"use strict";

module.exports = {
    key: "vehicleInspectionHU",
    arrays: ["rows"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object"
            ? new Set(Object.keys(page.byFarm)) : new Set();
        page.rows = page.rows.filter((row) => row && typeof row === "object"
            && farms.has(String(row.farmId))
            && typeof row.remainingMonths === "number"
            && Number.isFinite(row.remainingMonths));
        return page;
    },
};
