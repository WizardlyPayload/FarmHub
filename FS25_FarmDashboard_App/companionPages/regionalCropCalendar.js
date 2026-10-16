"use strict";

/** Regional Crop Calendar page: region preset, toggles, moisture balance and the effective crop x period calendar. */

const CALENDAR_STATES = new Set(["ok", "partial", "pending", "unavailable"]);

function periods(value) {
    if (!Array.isArray(value)) return [];
    const set = new Set(value.filter((p) => typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 12));
    return [...set].sort((a, b) => a - b);
}

function strings(value) {
    return Array.isArray(value) ? value.filter((s) => typeof s === "string" && s !== "") : [];
}

module.exports = {
    key: "regionalCropCalendar",
    arrays: [
        "crops",
        "crops.*.plantingPeriods",
        "crops.*.harvestPeriods",
        "region.signatureCrops",
        "region.unsuitableCrops",
        "region.seasons",
        "region.economy",
    ],
    normalize(page) {
        if (!CALENDAR_STATES.has(page.calendarState)) page.calendarState = "unavailable";
        const seen = new Set();
        page.crops = page.crops
            .filter((row) => row && typeof row === "object" && typeof row.crop === "string" && row.crop !== "")
            .filter((row) => (seen.has(row.crop) ? false : (seen.add(row.crop), true)))
            .map((row) => ({
                crop: row.crop,
                plantingPeriods: periods(row.plantingPeriods),
                harvestPeriods: periods(row.harvestPeriods),
                complete: row.complete === true,
                source: row.source === "map-calendar" ? "map-calendar" : "region",
            }))
            .sort((a, b) => a.crop.localeCompare(b.crop));
        if (page.blockedCrops !== undefined) page.blockedCrops = strings(Array.isArray(page.blockedCrops) ? page.blockedCrops : []);
        if (page.region && typeof page.region === "object") {
            page.region.signatureCrops = strings(page.region.signatureCrops);
            page.region.unsuitableCrops = strings(page.region.unsuitableCrops);
            page.region.seasons = page.region.seasons.filter(
                (s) => s && typeof s === "object" && Number.isInteger(s.season) && s.season >= 1 && s.season <= 4,
            );
            page.region.economy = page.region.economy.filter((e) => e && typeof e === "object" && typeof e.fillType === "string");
        }
        return page;
    },
};
