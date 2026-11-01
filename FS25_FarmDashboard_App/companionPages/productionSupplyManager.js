"use strict";

module.exports = {
    key: "productionSupplyManager",
    arrays: ["purchases"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object"
            ? new Set(Object.keys(page.byFarm)) : new Set();
        page.purchases = page.purchases.filter((row) => row && typeof row === "object"
            && farms.has(String(row.farmId))
            && Number.isFinite(row.liters) && row.liters > 0
            && Number.isFinite(row.cost) && row.cost >= 0);
        return page;
    },
};
