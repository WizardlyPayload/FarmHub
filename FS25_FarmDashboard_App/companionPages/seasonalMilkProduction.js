"use strict";

/** Seasonal Milk Production page: keep only well-formed months, periods and pen numbers. */

function finite(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function period(value) {
    const n = finite(value);
    return n !== undefined && Number.isInteger(n) && n >= 1 && n <= 12 ? n : undefined;
}

function twelve(list) {
    return Array.isArray(list) && list.length === 12 && list.every((v) => finite(v) !== undefined && v >= 0)
        ? list
        : undefined;
}

function normalizePen(pen) {
    if (!pen || typeof pen !== "object") return null;
    const out = { ...pen };
    out.kind = pen.kind === "pallets" ? "pallets" : "milk";
    for (const key of ["animals", "baselineLph", "currentLph", "appliedRatio", "avgHealth"]) {
        const n = finite(pen[key]);
        if (n === undefined || n < 0) delete out[key];
        else out[key] = n;
    }
    out.baselineCaptured = pen.baselineCaptured === true;
    out.fillTypes = Array.isArray(pen.fillTypes) ? pen.fillTypes.filter((t) => typeof t === "string") : [];
    return out;
}

module.exports = {
    key: "seasonalMilkProduction",
    arrays: ["byFarm.*.pens", "byFarm.*.pens.*.fillTypes"],
    normalize(page) {
        for (const key of ["monthlyPercent", "basePatternPercent"]) {
            const list = twelve(page[key]);
            if (list) page[key] = list;
            else delete page[key];
        }
        for (const key of ["currentPeriod", "nextPeakPeriod"]) {
            const p = period(page[key]);
            if (p === undefined) delete page[key];
            else page[key] = p;
        }
        if (page.hemisphere !== "north" && page.hemisphere !== "south") delete page.hemisphere;
        if (page.monthlyPercent && page.currentPeriod) page.currentPercent = page.monthlyPercent[page.currentPeriod - 1];
        if (page.settings === undefined || typeof page.settings !== "object" || Array.isArray(page.settings)) {
            page.settings = {};
        }
        for (const farm of Object.values(page.byFarm || {})) {
            if (!farm || typeof farm !== "object") continue;
            farm.pens = farm.pens.map(normalizePen).filter(Boolean);
            farm.truncated = farm.truncated === true;
        }
        return page;
    },
};
