"use strict";

/** Time Saving Stock Check page: copy of the in-game Stock Check table from the last time it was opened. */

const GUIDES = new Set(["great", "veryGood", "good", "normal", "noSellPoint"]);

function period(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12 ? value : undefined;
}

module.exports = {
    key: "timeSavingStockCheck",
    arrays: ["byFarm.*.items"],
    normalize(page) {
        page.currentPeriod = period(page.currentPeriod);
        for (const farm of Object.values(page.byFarm || {})) {
            if (!farm || typeof farm !== "object") continue;
            farm.items = farm.items
                .filter((row) => row && typeof row === "object")
                .map((row) => ({
                    ...row,
                    guide: GUIDES.has(row.guide) ? row.guide : undefined,
                    bestPeriod: period(row.bestPeriod),
                    noSellPoint: row.noSellPoint === true,
                    greatDemand: row.greatDemand === true,
                }));
        }
        return page;
    },
};
