"use strict";

/** Bushel Plus page: this farm's loss-measurement units and which combines carry one. */

function farmRows(rows, farmKeys) {
    return rows.filter((r) => r && typeof r === "object" && typeof r.name === "string" && (farmKeys.size === 0 || farmKeys.has(String(r.farmId))));
}

module.exports = {
    key: "bushelPlus",
    arrays: ["units", "combines"],
    normalize(page) {
        const farmKeys = new Set(Object.keys(page.byFarm && typeof page.byFarm === "object" ? page.byFarm : {}));
        page.units = farmRows(page.units, farmKeys).map((u) => ({ ...u, onCombine: u.onCombine === true, attached: u.attached === true }));
        page.combines = farmRows(page.combines, farmKeys)
            .map((c) => ({ ...c, equipped: c.equipped === true }))
            .sort((a, b) => Number(b.equipped) - Number(a.equipped) || a.name.localeCompare(b.name));
        return page;
    },
};
