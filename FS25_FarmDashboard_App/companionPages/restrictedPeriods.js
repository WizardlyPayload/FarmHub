"use strict";

/** Restricted Periods page: live ban state for liquid/solid organic fertiliser plus this farm's affected vehicles. */

const REASONS = new Set(["sperrfrist", "frost"]);

function period(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12 ? value : undefined;
}

function reason(value) {
    if (typeof value !== "string" || value === "") return undefined;
    return REASONS.has(value) ? value : "other";
}

module.exports = {
    key: "restrictedPeriods",
    arrays: ["vehicles"],
    normalize(page) {
        page.currentPeriod = period(page.currentPeriod);
        page.liquidBan = reason(page.liquidBan);
        page.solidBan = reason(page.solidBan);
        if (page.currentPeriod === undefined) delete page.anyActive;
        else page.anyActive = page.liquidBan !== undefined || page.solidBan !== undefined;
        const farms = page.byFarm && typeof page.byFarm === "object" ? new Set(Object.keys(page.byFarm)) : new Set();
        page.vehicles = page.vehicles
            .filter((row) => row && typeof row === "object")
            .filter((row) => farms.size === 0 || farms.has(String(row.farmId)))
            .filter((row) => row.category === "liquid" || row.category === "solid")
            .map((row) => ({ ...row, blocked: row.blocked === true, reason: reason(row.reason) }));
        return page;
    },
};
