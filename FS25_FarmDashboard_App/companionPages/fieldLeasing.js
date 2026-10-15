"use strict";

/** Field Leasing page: settings plus this farm's lease agreements (top-level `leases`, rows tagged with farmId). */

function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

module.exports = {
    key: "fieldLeasing",
    arrays: ["leases", "byFarm.*.finance.recentDays"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object" ? new Set(Object.keys(page.byFarm)) : new Set();
        page.leases = page.leases
            .filter((row) => row && typeof row === "object")
            .filter((row) => farms.size === 0 || farms.has(String(row.farmId)))
            .map((row) => ({
                ...row,
                periodsPaid: Math.max(0, num(row.periodsPaid) ?? 0),
                periodsUntilEnd: Math.max(0, num(row.periodsUntilEnd) ?? 0),
                canEnd: row.canEnd === true ? true : row.canEnd === false ? false : undefined,
            }))
            .sort((a, b) => (num(a.farmlandId) ?? 0) - (num(b.farmlandId) ?? 0));
        for (const farm of Object.values(page.byFarm || {})) {
            const days = farm && farm.finance && farm.finance.recentDays;
            if (Array.isArray(days)) farm.finance.recentDays = days.map((d) => num(d) ?? 0);
        }
        return page;
    },
};
