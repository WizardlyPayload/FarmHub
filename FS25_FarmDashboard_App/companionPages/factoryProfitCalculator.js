"use strict";

/** Factory Profit Calculator page: the mod's monthly projection per farm production line. */

const PRICE_SOURCES = new Set(["purchase", "peak"]);

function normalizeIo(row) {
    if (!row || typeof row !== "object") return null;
    return { ...row, priceSource: PRICE_SOURCES.has(row.priceSource) ? row.priceSource : undefined };
}

module.exports = {
    key: "factoryProfitCalculator",
    arrays: ["lines", "lines.*.inputs", "lines.*.outputs", "overrides"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object" ? new Set(Object.keys(page.byFarm)) : new Set();
        page.lines = page.lines
            .filter((line) => line && typeof line === "object")
            .filter((line) => farms.size === 0 || farms.has(String(line.farmId)))
            .map((line) => ({
                ...line,
                running: line.running === true,
                inputs: line.inputs.map(normalizeIo).filter(Boolean),
                outputs: line.outputs.map(normalizeIo).filter(Boolean),
            }));
        page.overrides = page.overrides.filter((row) => row && typeof row === "object");
        return page;
    },
};
