"use strict";

module.exports = {
    key: "productionsManager",
    arrays: ["rows"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object"
            ? new Set(Object.keys(page.byFarm)) : new Set();
        page.rows = page.rows.filter((row) => row && typeof row === "object"
            && farms.has(String(row.farmId))
            && typeof row.point === "string" && typeof row.recipe === "string"
            && typeof row.scheduleEnabled === "boolean"
            && Array.isArray(row.months) && row.months.every((m) => Number.isInteger(m) && m >= 1 && m <= 12));
        return page;
    },
};
