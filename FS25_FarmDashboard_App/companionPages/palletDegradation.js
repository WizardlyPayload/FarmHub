"use strict";

/** Storage Overhaul: Pallet Degradation System page (settings, per-farm pallets worst-first). */

function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value, lo, hi) {
    const n = num(value);
    return n === undefined ? undefined : Math.max(lo, Math.min(hi, n));
}

function normalizePallet(row) {
    if (!row || typeof row !== "object") return null;
    return {
        ...row,
        condition: clamp(row.condition, 0, 100),
        wear: clamp(row.wear, 0, 100),
        saleAdjust: clamp(row.saleAdjust, -1, 1),
        outside: row.outside === true,
        tracked: row.tracked === true,
    };
}

module.exports = {
    key: "palletDegradation",
    arrays: ["byFarm.*.pallets", "byFarm.*.byFillType"],
    normalize(page) {
        for (const farm of Object.values(page.byFarm || {})) {
            if (!farm || typeof farm !== "object") continue;
            farm.pallets = farm.pallets.map(normalizePallet).filter(Boolean)
                .sort((a, b) => (a.condition ?? 101) - (b.condition ?? 101));
            farm.byFillType = farm.byFillType.filter((row) => row && typeof row === "object" && num(row.count) !== undefined);
            for (const key of ["avgCondition", "minCondition", "avgWear"]) farm[key] = clamp(farm[key], 0, 100);
        }
        if (page.settings && typeof page.settings === "object") {
            for (const [key, value] of Object.entries(page.settings)) {
                if (num(value) === undefined) delete page.settings[key];
            }
        }
        return page;
    },
};
