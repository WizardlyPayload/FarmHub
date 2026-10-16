"use strict";

/** Soil Work Yield Bonus page: settings plus map-wide worked-area aggregates per bonus tier (no cell positions). */

const TOOLS = new Set(["discHarrow", "cultivatorShallow", "cultivatorDeep", "powerHarrow", "subsoiler", "plow"]);

function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

module.exports = {
    key: "soilWorkYieldBonus",
    arrays: ["tiers", "tiers.*.tools", "settings.tools"],
    normalize(page) {
        page.tiers = page.tiers
            .filter((t) => t && typeof t === "object" && (num(t.bonus) ?? 0) > 0)
            .map((t) => ({
                bonus: num(t.bonus),
                cells: Math.max(0, num(t.cells) ?? 0),
                areaHa: Math.max(0, num(t.areaHa) ?? 0),
                tools: t.tools.filter((tool) => TOOLS.has(tool)),
            }))
            .sort((a, b) => b.bonus - a.bonus);
        if (page.settings && typeof page.settings === "object") {
            page.settings.tools = page.settings.tools.filter((t) => t && typeof t === "object" && TOOLS.has(t.tool));
        }
        if (page.coverage !== undefined && page.coverage !== "complete") page.coverage = "sampled";
        return page;
    },
};
