"use strict";

module.exports = {
    key: "baleBatchTracker",
    arrays: ["groups", "storageRows"],
    normalize(page) {
        page.groups = page.groups.filter((group) => group && typeof group === "object"
            && ["fermenting", "ready", "other"].includes(group.state)
            && Number.isFinite(group.count) && group.count >= 0);
        page.storageRows = page.storageRows.filter((row) => row && typeof row === "object"
            && ["fermenting", "ready", "other"].includes(row.state)
            && Number.isFinite(row.count) && row.count >= 0);
        return page;
    },
};
