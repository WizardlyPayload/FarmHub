"use strict";

/** Vehicle Mileage page: odometer / trip per vehicle (km), highest first. */

function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nonNegative(value) {
    const n = num(value);
    return n === undefined ? undefined : Math.max(0, n);
}

module.exports = {
    key: "vehicleMileage",
    arrays: ["byFarm.*.vehicles"],
    normalize(page) {
        if (page.useMiles !== true && page.useMiles !== false) delete page.useMiles;
        for (const farm of Object.values(page.byFarm || {})) {
            if (!farm || typeof farm !== "object") continue;
            farm.vehicles = farm.vehicles
                .filter((row) => row && typeof row === "object" && num(row.odoKm) !== undefined)
                .map((row) => ({
                    ...row,
                    odoKm: nonNegative(row.odoKm),
                    tripKm: nonNegative(row.tripKm),
                    operatingHours: nonNegative(row.operatingHours),
                    hudMode: row.hudMode === "trip" ? "trip" : "mileage",
                }))
                .sort((a, b) => b.odoKm - a.odoKm);
            for (const key of ["totalKm", "tripKm", "highestKm", "averageKm"]) farm[key] = nonNegative(farm[key]);
        }
        return page;
    },
};
