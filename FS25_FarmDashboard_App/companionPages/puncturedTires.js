"use strict";

/** Punctured Tires page: save-wide puncture cycle and each vehicle's tyre state. */

const AXLES = new Set(["front", "rear", "middle"]);
const SIDES = new Set(["left", "right"]);
const POSITIONS = new Set(["inner", "outer"]);

function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value, lo, hi) {
    const n = num(value);
    return n === undefined ? undefined : Math.max(lo, Math.min(hi, n));
}

function period(value) {
    const n = num(value);
    return n !== undefined && Number.isInteger(n) && n >= 1 && n <= 12 ? n : undefined;
}

function pick(value, allowed) {
    return allowed.has(value) ? value : undefined;
}

module.exports = {
    key: "puncturedTires",
    arrays: ["byFarm.*.vehicles"],
    normalize(page) {
        if (page.cycle && typeof page.cycle === "object") {
            const c = page.cycle;
            for (const key of ["startPeriod", "dangerPeriod1", "dangerPeriod2", "puncturedThisPeriod", "currentPeriod"]) c[key] = period(c[key]);
            c.count = clamp(c.count, 0, 1000);
            c.dangerNow = c.dangerNow === true;
        }
        for (const farm of Object.values(page.byFarm || {})) {
            if (!farm || typeof farm !== "object") continue;
            farm.vehicles = farm.vehicles
                .filter((row) => row && typeof row === "object")
                .map((row) => ({
                    ...row,
                    punctured: row.punctured === true,
                    armed: row.armed === true,
                    pressurePct: clamp(row.pressurePct, 0, 100),
                    punctureType: [1, 2, 3].includes(row.punctureType) ? row.punctureType : undefined,
                    axle: pick(row.axle, AXLES),
                    side: pick(row.side, SIDES),
                    position: pick(row.position, POSITIONS),
                    metersToPuncture: clamp(row.metersToPuncture, 0, Number.MAX_SAFE_INTEGER),
                    repairCost: clamp(row.repairCost, 0, Number.MAX_SAFE_INTEGER),
                }))
                .sort((a, b) => {
                    if (a.punctured !== b.punctured) return a.punctured ? -1 : 1;
                    if (a.armed !== b.armed) return a.armed ? -1 : 1;
                    return 0;
                });
        }
        return page;
    },
};
