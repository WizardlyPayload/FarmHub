"use strict";

module.exports = {
    key: "cropContracts",
    arrays: ["rows"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object"
            ? new Set(Object.keys(page.byFarm)) : new Set();
        page.rows = page.rows.filter((row) => row && typeof row === "object"
            && farms.has(String(row.farmId))
            && ["ACTIVE", "COMPLETED", "EXPIRED"].includes(row.status)
            && Number.isFinite(row.targetLiters) && row.targetLiters > 0
            && Number.isFinite(row.deliveredLiters) && row.deliveredLiters >= 0);
        return page;
    },
};
