"use strict";

/** Advanced Maintenance page: machines by damage zone (ok / risk / locked) with the mod's stall odds. */

const ZONES = new Set(["ok", "risk", "locked"]);

function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value, lo, hi) {
    const n = num(value);
    return n === undefined ? undefined : Math.max(lo, Math.min(hi, n));
}

module.exports = {
    key: "advancedMaintenance",
    arrays: ["byFarm.*.machines"],
    normalize(page) {
        for (const farm of Object.values(page.byFarm || {})) {
            if (!farm || typeof farm !== "object") continue;
            farm.machines = farm.machines
                .filter((row) => row && typeof row === "object")
                .map((row) => {
                    const odds = num(row.oddsPerCheck);
                    return {
                        ...row,
                        damagePct: clamp(row.damagePct, 0, 100),
                        operatingHours: clamp(row.operatingHours, 0, Number.MAX_SAFE_INTEGER),
                        zone: ZONES.has(row.zone) ? row.zone : "ok",
                        oddsPerCheck: odds !== undefined && odds >= 100 ? Math.floor(odds) : undefined,
                        aiActive: row.aiActive === true,
                    };
                })
                .sort((a, b) => (b.damagePct ?? -1) - (a.damagePct ?? -1));
            farm.averageDamagePct = clamp(farm.averageDamagePct, 0, 100);
        }
        return page;
    },
};
