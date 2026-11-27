"use strict";

module.exports = {
    key: "implementUsageCounter",
    arrays: ["rows"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object"
            ? new Set(Object.keys(page.byFarm)) : new Set();
        page.rows = page.rows.filter((row) => row && typeof row === "object"
            && farms.has(String(row.farmId))
            && ["ha", "bales"].includes(row.unit)
            && Number.isFinite(row.lifetime) && row.lifetime >= 0
            && Number.isFinite(row.session) && row.session >= 0);
        return page;
    },
};
