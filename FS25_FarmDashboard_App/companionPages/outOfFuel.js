"use strict";

/** Out Of Fuel page: patch flags and the farm's fuel against the vanilla 10 % load top-up floor. */

function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value, lo, hi) {
    const n = num(value);
    return n === undefined ? undefined : Math.max(lo, Math.min(hi, n));
}

function nonNegative(value) {
    const n = num(value);
    return n === undefined ? undefined : Math.max(0, n);
}

function normalizeVehicle(row) {
    if (!row || typeof row !== "object") return null;
    const fuels = Array.isArray(row.fuels) ? row.fuels : [];
    return {
        ...row,
        fuels: fuels
            .filter((f) => f && typeof f === "object")
            .map((f) => ({ ...f, pct: clamp(f.pct, 0, 100), topUpLitres: nonNegative(f.topUpLitres), topUpCost: nonNegative(f.topUpCost) })),
        lowestPct: clamp(row.lowestPct, 0, 100),
        topUpLitres: nonNegative(row.topUpLitres),
        topUpCost: nonNegative(row.topUpCost),
        belowFloor: row.belowFloor === true,
        empty: row.empty === true,
    };
}

module.exports = {
    key: "outOfFuel",
    arrays: ["byFarm.*.vehicles"],
    normalize(page) {
        for (const farm of Object.values(page.byFarm || {})) {
            if (!farm || typeof farm !== "object") continue;
            farm.vehicles = farm.vehicles.map(normalizeVehicle).filter(Boolean)
                .sort((a, b) => (a.lowestPct ?? 101) - (b.lowestPct ?? 101));
            for (const key of ["topUpLitres", "topUpCost"]) farm[key] = nonNegative(farm[key]);
        }
        if (page.settings && typeof page.settings === "object") {
            for (const key of Object.keys(page.settings)) page.settings[key] = page.settings[key] === true;
        }
        return page;
    },
};
