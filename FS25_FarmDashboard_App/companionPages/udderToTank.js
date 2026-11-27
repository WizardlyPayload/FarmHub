"use strict";

module.exports = {
    key: "udderToTank",
    arrays: ["rows"],
    normalize(page) {
        const farms = new Set(Object.keys(page.byFarm || {}));
        page.rows = page.rows.filter((row) => row && farms.has(String(row.farmId)));
        return page;
    },
};
