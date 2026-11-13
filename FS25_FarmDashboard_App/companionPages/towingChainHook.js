"use strict";

module.exports = {
    key: "towingChainHook",
    arrays: ["rows"],
    normalize(page) {
        page.rows = page.rows.filter((row) => row && typeof row === "object"
            && row.kind !== undefined && (row.kind === "tow" || row.kind === "hook")
            && typeof row.chainId === "string" && typeof row.targetId === "string"
            && Number.isInteger(row.farmId) && row.farmId > 0);
        return page;
    },
};
