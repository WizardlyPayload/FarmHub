"use strict";

/** Imperial System page: the mod's five unit choices, conversion factors and bushel crops. */

const CHOICES = {
    liquid: ["liters", "gallons"],
    crops: ["liters", "imperial"],
    weight: ["metric", "imperial"],
    measure: ["metric", "imperial"],
    weightScale: ["auto", "pounds", "tons"],
};

module.exports = {
    key: "imperialSystem",
    arrays: ["bushelCrops"],
    normalize(page) {
        page.bushelCrops = page.bushelCrops.filter((name) => typeof name === "string").sort();
        if (page.settings && typeof page.settings === "object") {
            const settings = {};
            for (const [key, allowed] of Object.entries(CHOICES)) {
                if (allowed.includes(page.settings[key])) settings[key] = page.settings[key];
            }
            page.settings = settings;
        }
        if (page.factors && typeof page.factors === "object") {
            for (const [key, value] of Object.entries(page.factors)) {
                if (!(Number.isFinite(value) && value > 0)) delete page.factors[key];
            }
        }
        return page;
    },
};
