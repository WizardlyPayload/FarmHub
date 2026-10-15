"use strict";

/** Realistic Animal Losses page: percentages clamped to 0-100, counts non-negative. */

function finite(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function percent(value) {
    const n = finite(value);
    return n === undefined ? undefined : Math.min(100, Math.max(0, n));
}

const PEN_PERCENTS = [
    "foodEffectivity", "careRiskPercentPerCheck", "ageRiskPercentPerCheck",
    "lastWarnedCareRiskPercent", "lastWarnedAgeRiskPercent",
];
const PEN_COUNTS = ["animals", "oldAnimals", "riskAgeMonths"];

function normalizePen(pen) {
    if (!pen || typeof pen !== "object") return null;
    const out = {
        ...pen,
        belowThreshold: pen.belowThreshold === true,
        noWater: pen.noWater === true,
        noStraw: pen.noStraw === true,
    };
    for (const key of PEN_PERCENTS) {
        const n = percent(pen[key]);
        if (n === undefined) delete out[key];
        else out[key] = n;
    }
    for (const key of PEN_COUNTS) {
        const n = finite(pen[key]);
        if (n === undefined || n < 0) delete out[key];
        else out[key] = n;
    }
    return out;
}

module.exports = {
    key: "realisticAnimalLosses",
    arrays: ["rules.riskAges", "byFarm.*.pens"],
    normalize(page) {
        if (!page.settings || typeof page.settings !== "object" || Array.isArray(page.settings)) page.settings = {};
        if (!page.rules || typeof page.rules !== "object" || Array.isArray(page.rules)) page.rules = { riskAges: [] };
        if (!Array.isArray(page.rules.riskAges)) page.rules.riskAges = [];
        const threshold = percent(page.settings.foodEffectivityThreshold);
        if (threshold === undefined) delete page.settings.foodEffectivityThreshold;
        else page.settings.foodEffectivityThreshold = threshold;
        page.rules.riskAges = page.rules.riskAges.filter(
            (row) => row && typeof row.animalType === "string" && finite(row.months) !== undefined,
        );
        for (const key of ["ageLossRatePercent", "waterLossRatePercent", "strawLossRatePercent"]) {
            const n = percent(page.rules[key]);
            if (n === undefined) delete page.rules[key];
            else page.rules[key] = n;
        }
        for (const farm of Object.values(page.byFarm || {})) {
            if (!farm || typeof farm !== "object") continue;
            farm.pens = farm.pens.map(normalizePen).filter(Boolean);
            farm.truncated = farm.truncated === true;
        }
        return page;
    },
};
