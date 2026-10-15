"use strict";

module.exports = {
    key: "dynamicMarket",
    arrays: ["groups", "groups.*.curve", "pressure", "favorites"],
    normalize(page) {
        if (Array.isArray(page.pressure)) {
            page.pressure.sort((a, b) => (Number(b.percent) || 0) - (Number(a.percent) || 0));
        }
        return page;
    },
};
