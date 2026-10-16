"use strict";

/** Collision Damage page: multiplier / damage bands and this session's hits per machine. */

function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value, lo, hi) {
    const n = num(value);
    return n === undefined ? undefined : Math.max(lo, Math.min(hi, n));
}

module.exports = {
    key: "collisionDamage",
    arrays: ["byFarm.*.machines"],
    normalize(page) {
        if (page.settings && typeof page.settings === "object") {
            const s = page.settings;
            s.multiplierPct = clamp(s.multiplierPct, 0, 1000);
            s.counterpartDamage = s.counterpartDamage === true;
        }
        for (const farm of Object.values(page.byFarm || {})) {
            if (!farm || typeof farm !== "object") continue;
            farm.machines = farm.machines
                .filter((row) => row && typeof row === "object")
                .map((row) => ({
                    ...row,
                    damagePct: clamp(row.damagePct, 0, 100),
                    heavy: row.heavy === true,
                    hitThisSession: row.hitThisSession === true,
                    lastHitMinutesAgo: row.hitThisSession === true ? clamp(row.lastHitMinutesAgo, 0, Number.MAX_SAFE_INTEGER) : undefined,
                }))
                .sort((a, b) => {
                    if (a.hitThisSession !== b.hitThisSession) return a.hitThisSession ? -1 : 1;
                    const ma = a.lastHitMinutesAgo ?? Infinity;
                    const mb = b.lastHitMinutesAgo ?? Infinity;
                    if (ma !== mb) return ma - mb;
                    return (b.damagePct ?? -1) - (a.damagePct ?? -1);
                });
            farm.averageDamagePct = clamp(farm.averageDamagePct, 0, 100);
        }
        return page;
    },
};
