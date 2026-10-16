"use strict";

/** Production Watcher page: FarmHub applies the mod's alert thresholds to native production points. */

const INPUT_ALERTS = new Set(["low", "missing"]);
const OUTPUT_ALERTS = new Set(["nearlyFull", "full"]);
const ROLES = new Set(["input", "output"]);

function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function farmKeys(page) {
    return page.byFarm && typeof page.byFarm === "object" ? new Set(Object.keys(page.byFarm)) : new Set();
}

function normalizeStorageRow(row) {
    if (!row || typeof row !== "object" || !ROLES.has(row.role)) return null;
    const percent = num(row.percent);
    return { ...row, percent: percent === undefined ? undefined : Math.max(0, Math.min(100, percent)) };
}

module.exports = {
    key: "productionWatcher",
    arrays: ["points", "points.*.storage"],
    normalize(page) {
        const farms = farmKeys(page);
        page.points = page.points
            .filter((point) => point && typeof point === "object")
            .filter((point) => farms.size === 0 || farms.has(String(point.farmId)))
            .map((point) => ({
                ...point,
                inputAlert: INPUT_ALERTS.has(point.inputAlert) ? point.inputAlert : undefined,
                outputAlert: OUTPUT_ALERTS.has(point.outputAlert) ? point.outputAlert : undefined,
                watched: point.watched === true,
                storage: point.storage.map(normalizeStorageRow).filter(Boolean),
            }));
        page.alertsReadable = false;
        return page;
    },
};
