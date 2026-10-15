"use strict";

/** Seasonal Wool Production page: valid shearing months and non-negative pen numbers only. */

function finite(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function period(value) {
    const n = finite(value);
    return n !== undefined && Number.isInteger(n) && n >= 1 && n <= 12 ? n : undefined;
}

const PEN_NUMBERS = [
    "rawRateLph", "historyAvgLph", "monthsRecorded", "lastShearingPeriod", "monthsSinceShearing",
    "matureSheep", "totalSheep", "pendingWoolLiters", "nextShearingCost",
];

function normalizePen(pen) {
    if (!pen || typeof pen !== "object") return null;
    const out = { ...pen, hooked: pen.hooked === true };
    for (const key of PEN_NUMBERS) {
        const n = finite(pen[key]);
        if (n === undefined || n < 0) delete out[key];
        else out[key] = n;
    }
    if (out.lastShearingPeriod !== undefined && period(out.lastShearingPeriod) === undefined) delete out.lastShearingPeriod;
    return out;
}

module.exports = {
    key: "seasonalWoolProduction",
    arrays: ["shearingPeriods", "byFarm.*.pens"],
    normalize(page) {
        page.shearingPeriods = [...new Set(page.shearingPeriods.map(period).filter((p) => p !== undefined))].sort((a, b) => a - b);
        for (const key of ["currentPeriod", "nextShearingPeriod", "lastProcessedMonth"]) {
            const p = period(page[key]);
            if (p === undefined) delete page[key];
            else page[key] = p;
        }
        const until = finite(page.monthsUntilShearing);
        if (until === undefined || until < 1 || until > 12) delete page.monthsUntilShearing;
        if (page.settings === undefined || typeof page.settings !== "object" || Array.isArray(page.settings)) {
            page.settings = {};
        }
        const fee = finite(page.settings.shearingCostPerSheep);
        if (fee === undefined || fee < 0) delete page.settings.shearingCostPerSheep;
        delete page.totalWoolSheared;
        for (const farm of Object.values(page.byFarm || {})) {
            if (!farm || typeof farm !== "object") continue;
            farm.pens = farm.pens.map(normalizePen).filter(Boolean);
            farm.truncated = farm.truncated === true;
        }
        return page;
    },
};
