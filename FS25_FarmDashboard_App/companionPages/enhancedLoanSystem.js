"use strict";

module.exports = {
    key: "enhancedLoanSystem",
    arrays: ["byFarm.*.loans", "byFarm.*.paidOff"],
    normalize(page) {
        for (const farm of Object.values(page.byFarm || {})) {
            if (!farm || !Array.isArray(farm.loans)) continue;
            farm.loans.sort((a, b) => (Number(b.restAmount) || 0) - (Number(a.restAmount) || 0));
        }
        return page;
    },
};
