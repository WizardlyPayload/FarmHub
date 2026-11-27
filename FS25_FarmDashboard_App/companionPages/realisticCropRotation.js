"use strict";

module.exports = {
    key: "realisticCropRotation",
    arrays: ["rows"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object"
            ? new Set(Object.keys(page.byFarm)) : new Set();
        page.rows = page.rows.filter((row) => row && typeof row === "object"
            && farms.has(String(row.farmId)) && Number.isInteger(row.farmlandId)
            && row.farmlandId > 0);
        return page;
    },
};
