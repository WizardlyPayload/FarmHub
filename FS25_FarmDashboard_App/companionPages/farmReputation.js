"use strict";

module.exports = {
    key: "farmReputation",
    arrays: ["contractors"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object"
            ? new Set(Object.keys(page.byFarm)) : new Set();
        page.contractors = page.contractors.filter((row) => row && typeof row === "object"
            && farms.has(String(row.farmId)) && typeof row.contractor === "string");
        return page;
    },
};
