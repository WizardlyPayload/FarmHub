"use strict";

/** Courseplay page: global settings and per-vehicle job, course and progress. */

function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nonNegative(value) {
    const n = num(value);
    return n === undefined ? undefined : Math.max(0, n);
}

function normalizeCourses(courses) {
    if (!courses || typeof courses !== "object") return undefined;
    const names = Array.isArray(courses.names) ? courses.names.filter((n) => typeof n === "string") : [];
    return {
        ...courses,
        names,
        count: nonNegative(courses.count) ?? names.length,
        waypoints: nonNegative(courses.waypoints),
        workWidth: nonNegative(courses.workWidth),
    };
}

function normalizeStatus(status) {
    if (!status || typeof status !== "object") return undefined;
    const out = { ...status };
    for (const key of ["waypoint", "waypoints", "balesLeft"]) out[key] = nonNegative(out[key]);
    for (const key of ["compactionPct", "fillLeftPct"]) {
        const n = num(out[key]);
        out[key] = n === undefined ? undefined : Math.max(0, Math.min(100, n));
    }
    return out;
}

module.exports = {
    key: "courseplay",
    arrays: ["globalSettings", "byFarm.*.vehicles"],
    normalize(page) {
        page.globalSettings = page.globalSettings.filter((row) => row && typeof row.name === "string");
        for (const farm of Object.values(page.byFarm || {})) {
            if (!farm || typeof farm !== "object") continue;
            farm.vehicles = farm.vehicles
                .filter((row) => row && typeof row === "object")
                .map((row) => ({
                    ...row,
                    cpActive: row.cpActive === true,
                    otherHelper: row.otherHelper === true,
                    fieldWork: row.fieldWork === true,
                    driveToField: row.driveToField === true,
                    recording: row.recording === true,
                    courses: normalizeCourses(row.courses),
                    status: row.cpActive === true ? normalizeStatus(row.status) : undefined,
                }))
                .sort((a, b) => {
                    if (a.cpActive !== b.cpActive) return a.cpActive ? -1 : 1;
                    const ca = (a.courses?.count ?? 0) > 0;
                    const cb = (b.courses?.count ?? 0) > 0;
                    if (ca !== cb) return ca ? -1 : 1;
                    return 0;
                });
        }
        return page;
    },
};
