"use strict";

/** Animal Food Calculator page: per-pen outputs re-joined from aligned arrays; negative amounts dropped. */

function finite(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const PEN_NUMBERS = ["animals", "foodDaily", "foodYearly", "waterDaily", "waterYearly", "strawDaily", "strawYearly"];

function normalizePen(pen) {
    if (!pen || typeof pen !== "object") return null;
    const out = { ...pen, calculated: pen.calculated === true };
    for (const key of PEN_NUMBERS) {
        const n = finite(pen[key]);
        if (n === undefined || n < 0) delete out[key];
        else out[key] = n;
    }
    const titles = Array.isArray(pen.outputTitles) ? pen.outputTitles : [];
    const daily = Array.isArray(pen.outputDaily) ? pen.outputDaily : [];
    const yearly = Array.isArray(pen.outputYearly) ? pen.outputYearly : [];
    const outputs = [];
    const n = Math.min(titles.length, daily.length, yearly.length);
    for (let i = 0; i < n; i += 1) {
        const d = finite(daily[i]);
        const y = finite(yearly[i]);
        if (typeof titles[i] === "string" && d !== undefined && y !== undefined && d >= 0 && y >= 0) {
            outputs.push({ title: titles[i], daily: d, yearly: y });
        }
    }
    delete out.outputTitles;
    delete out.outputDaily;
    delete out.outputYearly;
    out.outputs = out.calculated ? outputs : [];
    return out;
}

module.exports = {
    key: "animalFoodCalculator",
    arrays: ["byFarm.*.pens"],
    normalize(page) {
        if (!page.settings || typeof page.settings !== "object" || Array.isArray(page.settings)) page.settings = {};
        if (!page.hooks || typeof page.hooks !== "object" || Array.isArray(page.hooks)) page.hooks = {};
        for (const key of ["foodScale", "waterScale", "strawScale", "customMultiplier"]) {
            const n = finite(page.settings[key]);
            if (n === undefined || n < 0) delete page.settings[key];
        }
        for (const farm of Object.values(page.byFarm || {})) {
            if (!farm || typeof farm !== "object") continue;
            farm.pens = farm.pens.map(normalizePen).filter(Boolean);
            farm.truncated = farm.truncated === true;
        }
        return page;
    },
};
