"use strict";

/** Smart Crop Control page: keep-chance grid per crop category and field size, plus NPC fields on the map. */

const BANDS = ["0_3", "3_8", "8_20", "20_30", "30_plus"];
const CATEGORIES = ["root", "vegetable", "special"];

function chance(value) {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
}

function counts(value) {
    const src = value && typeof value === "object" ? value : {};
    return Object.fromEntries(CATEGORIES.map((c) => [c, Math.max(0, Number.isFinite(src[c]) ? src[c] : 0)]));
}

module.exports = {
    key: "smartCropControl",
    arrays: ["bands", "fields", "crops.root", "crops.vegetable", "crops.special"],
    normalize(page) {
        const src = page.chances && typeof page.chances === "object" ? page.chances : {};
        page.chances = Object.fromEntries(
            CATEGORIES.map((c) => {
                const row = Array.isArray(src[c]) ? src[c] : src[c] && typeof src[c] === "object" ? Object.values(src[c]) : [];
                return [c, BANDS.map((_, i) => chance(row[i]))];
            }),
        );
        page.bands = page.bands
            .filter((b) => b && typeof b === "object" && BANDS.includes(b.band))
            .map((b) => ({ ...b, growing: counts(b.growing), planned: counts(b.planned) }))
            .sort((a, b) => BANDS.indexOf(a.band) - BANDS.indexOf(b.band));
        page.fields = page.fields.filter((f) => f && typeof f === "object" && CATEGORIES.includes(f.category) && BANDS.includes(f.band));
        for (const c of CATEGORIES) {
            if (page.crops && typeof page.crops === "object") {
                page.crops[c] = page.crops[c].filter((row) => row && typeof row === "object" && typeof row.crop === "string");
            }
        }
        return page;
    },
};
