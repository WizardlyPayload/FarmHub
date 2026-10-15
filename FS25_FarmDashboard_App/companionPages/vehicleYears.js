"use strict";

/** Vehicle Years page: model year per vehicle (oldest first), decade counts and shop coverage. */

const DECADES = ["pre1950", "1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s", "2030s"];

function year(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 1800 && value <= 2200 ? value : undefined;
}

module.exports = {
    key: "vehicleYears",
    arrays: ["byFarm.*.vehicles", "byFarm.*.byDecade"],
    normalize(page) {
        for (const farm of Object.values(page.byFarm || {})) {
            if (!farm || typeof farm !== "object") continue;
            farm.vehicles = farm.vehicles
                .filter((row) => row && typeof row === "object")
                .map((row) => {
                    const y = year(row.year);
                    return { ...row, year: y, decade: y !== undefined && DECADES.includes(row.decade) ? row.decade : undefined };
                })
                .sort((a, b) => (a.year ?? 99999) - (b.year ?? 99999));
            farm.byDecade = farm.byDecade
                .filter((row) => row && DECADES.includes(row.decade) && Number.isFinite(row.count) && row.count > 0)
                .sort((a, b) => DECADES.indexOf(a.decade) - DECADES.indexOf(b.decade));
            for (const key of ["oldestYear", "newestYear", "averageYear"]) farm[key] = year(farm[key]);
        }
        return page;
    },
};
