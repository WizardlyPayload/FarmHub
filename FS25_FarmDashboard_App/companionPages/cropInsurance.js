"use strict";

module.exports = {
    key: "cropInsurance",
    arrays: ["policies", "history"],
    normalize(page) {
        const farms = new Set(Object.keys(page.byFarm || {}));
        page.policies = page.policies.filter((row) => row && farms.has(String(row.farmId)));
        page.history = page.history.filter((row) => row && farms.has(String(row.farmId)));
        return page;
    },
};
