"use strict";

/** RealSilo page: farm silos with their compartments (top-level `silos`, each row tagged with farmId). */

function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeSlot(slot, i) {
    if (!slot || typeof slot !== "object") return null;
    const fillLevel = Math.max(0, num(slot.fillLevel) ?? 0);
    const capacity = Math.max(0, num(slot.capacity) ?? 0);
    return {
        ...slot,
        index: num(slot.index) ?? i + 1,
        fillLevel,
        capacity,
        isActive: slot.isActive === true,
        isExtension: slot.isExtension === true,
    };
}

module.exports = {
    key: "realSilo",
    arrays: ["silos", "silos.*.slots", "byFarm.*.byFillType"],
    normalize(page) {
        const farms = page.byFarm && typeof page.byFarm === "object" ? new Set(Object.keys(page.byFarm)) : new Set();
        page.silos = page.silos
            .filter((silo) => silo && typeof silo === "object")
            .filter((silo) => farms.size === 0 || farms.has(String(silo.farmId)))
            .map((silo) => ({
                ...silo,
                configured: silo.configured === true,
                slots: silo.slots.map(normalizeSlot).filter(Boolean).sort((a, b) => a.index - b.index),
            }));
        return page;
    },
};
