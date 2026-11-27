"use strict";

module.exports = {
    key: "grainTickets",
    arrays: ["rows"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object"
            ? new Set(Object.keys(page.byFarm)) : new Set();
        page.rows = page.rows.filter((row) => row && typeof row === "object"
            && farms.has(String(row.farmId))
            && Number.isFinite(row.liters) && row.liters > 0
            && Number.isFinite(row.gross) && row.gross >= 0
            && Number.isFinite(row.deductionAmount) && row.deductionAmount >= 0
            && Number.isFinite(row.net) && row.net >= 0);
        return page;
    },
};
