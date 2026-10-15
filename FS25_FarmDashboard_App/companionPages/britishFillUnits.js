"use strict";

/** British Fill Units page: runtime version, hook flags and how sample fill types are displayed. */

const SHOWN_AS = new Set(["mass", "litres", "length"]);
const HOOKS = ["storeCapacity", "quantityHud", "pricesFrame", "priceMoney", "textFormatting"];

module.exports = {
    key: "britishFillUnits",
    arrays: ["samples"],
    normalize(page) {
        page.samples = page.samples
            .filter((row) => row && typeof row.fillType === "string")
            .map((row) => ({
                ...row,
                shownAs: SHOWN_AS.has(row.shownAs) ? row.shownAs : undefined,
                tonnesPer1000L: Number.isFinite(row.tonnesPer1000L) && row.tonnesPer1000L > 0 ? row.tonnesPer1000L : undefined,
            }));
        if (page.hooks && typeof page.hooks === "object") {
            const hooks = {};
            for (const key of HOOKS) hooks[key] = page.hooks[key] === true;
            page.hooks = hooks;
        }
        if (page.catalog && typeof page.catalog === "object") {
            for (const key of ["mass", "litres", "length"]) {
                const n = page.catalog[key];
                page.catalog[key] = Number.isFinite(n) && n >= 0 ? n : 0;
            }
        }
        return page;
    },
};
