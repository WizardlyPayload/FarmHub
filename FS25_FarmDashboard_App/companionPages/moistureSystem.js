"use strict";

/** Moisture System page: map moisture, crop windows, this farm's silos, bales and irrigation, in-game forecast. */

const BALE_KEYS = ["gettingWet", "drying", "rottingSlowly", "rotting", "rottingQuickly"];
const CROP_STATES = new Set(["dry", "ideal", "wet"]);

function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function validMonth(value) {
    const n = num(value);
    return n !== undefined && Number.isInteger(n) && n >= 1 && n <= 12 ? n : undefined;
}

function isFarmRow(row, farmKeys) {
    return row && typeof row === "object" && (farmKeys.size === 0 || farmKeys.has(String(row.farmId)));
}

module.exports = {
    key: "moistureSystem",
    arrays: [
        "crops",
        "silos",
        "silos.*.crops",
        "irrigationJobs",
        "irrigationBoosts",
        "weather.forecast",
        "weather.forecast.*.months",
    ],
    normalize(page) {
        const farmKeys = new Set(Object.keys(page.byFarm && typeof page.byFarm === "object" ? page.byFarm : {}));
        const month = validMonth(page.month);
        if (month === undefined) delete page.month;
        else page.month = month;

        page.crops = page.crops
            .filter((c) => c && typeof c === "object" && typeof c.fillType === "string" && num(c.idealMinPercent) !== undefined && num(c.idealMaxPercent) !== undefined)
            .map((c) => (CROP_STATES.has(c.state) ? c : { ...c, state: undefined }))
            .sort((a, b) => a.fillType.localeCompare(b.fillType));

        page.silos = page.silos
            .filter((s) => isFarmRow(s, farmKeys))
            .map((s) => ({ ...s, crops: s.crops.filter((c) => c && typeof c === "object" && typeof c.fillType === "string") }));
        page.irrigationJobs = page.irrigationJobs.filter((j) => isFarmRow(j, farmKeys) && num(j.farmlandId) !== undefined);
        page.irrigationBoosts = page.irrigationBoosts.filter((b) => isFarmRow(b, farmKeys) && num(b.boostPercent) !== undefined);

        for (const farm of Object.values(page.byFarm && typeof page.byFarm === "object" ? page.byFarm : {})) {
            if (!farm || typeof farm !== "object" || !farm.bales || typeof farm.bales !== "object") continue;
            for (const key of BALE_KEYS) farm.bales[key] = Math.max(0, num(farm.bales[key]) ?? 0);
        }

        if (page.weather && typeof page.weather === "object") {
            page.weather.forecast = page.weather.forecast
                .filter((s) => s && typeof s === "object" && [0, 1, 2].includes(s.offset))
                .map((s) => ({ ...s, months: s.months.filter((m) => m && typeof m === "object" && validMonth(m.month) !== undefined) }))
                .sort((a, b) => a.offset - b.offset);
        }
        return page;
    },
};
