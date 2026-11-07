"use strict";

module.exports = {
    key: "transportCompany",
    arrays: ["contracts", "truckBooks", "drivers"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object"
            ? new Set(Object.keys(page.byFarm)) : new Set();
        for (const key of ["contracts", "truckBooks", "drivers"]) {
            page[key] = page[key].filter((row) => row && typeof row === "object"
                && farms.has(String(row.farmId)));
        }
        return page;
    },
};
