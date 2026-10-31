"use strict";

module.exports = {
    key: "productionControl",
    arrays: ["lines"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object" ? new Set(Object.keys(page.byFarm)) : new Set();
        page.lines = page.lines.filter((row) => row && typeof row === "object"
            && (farms.size === 0 || farms.has(String(row.farmId)))
            && typeof row.productivityPercent === "number"
            && row.productivityPercent >= 50 && row.productivityPercent <= 300);
        return page;
    },
};
