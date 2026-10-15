/**
 * Classify FS25 field harvest from savegame XML (fields.xml FieldState snapshot).
 *
 * Ground type HARVEST_READY is the standing-crop *texture* Giants leaves on the densmap.
 * After a combine, fruit growthState moves to the cut/harvested foliage index but the ground
 * channel often stays HARVEST_READY. Treating the ground name as "still ready" is wrong —
 * live vanilla Riverbend savegame4 field 3: WHEAT growthState=10 (wheat.xml harvested/cut)
 * with groundType=HARVEST_READY after straw was baled.
 *
 * Indices are 1-based <foliageState> order from FS25 data/foliage/*.xml.
 */

"use strict";

const VANILLA_ARABLE_STAGES = {
    WHEAT: { ready: [8], withered: [9], harvested: [10] },
    BARLEY: { ready: [8], withered: [9], harvested: [10] },
    OAT: { ready: [5], withered: [6], harvested: [7] },
    CANOLA: { ready: [9], withered: [10], harvested: [11] },
};

function fruitKey(fruitType) {
    return String(fruitType || "").trim().toUpperCase();
}

function groundLooksHarvestTexture(groundType) {
    const gt = String(groundType || "").toUpperCase();
    return gt === "HARVEST_READY" || gt === "HARVEST_READY_OTHER";
}

function isMowableForage(fruit) {
    const u = fruitKey(fruit);
    if (!u) return false;
    if (u === "GRASS" || u === "MEADOW" || u === "ALFALFA" || u === "CLOVER") return true;
    if (u.includes("CLOVER") || u.includes("MEADOW")) return true;
    if (u.includes("ALFALFA") && !u.includes("WINDROW") && !u.includes("BALE")) return true;
    return false;
}

function inList(list, gs) {
    return Array.isArray(list) && list.includes(gs);
}

/**
 * @param {{ fruitType?: string, growthState?: number|string, groundType?: string }} field
 * @returns {{ harvestReady: boolean, isHarvested: boolean, isWithered: boolean }}
 */
function classifyXmlFieldHarvest(field) {
    const fruit = fruitKey(field && field.fruitType);
    const gs = parseInt(String(field && field.growthState != null ? field.growthState : "0"), 10) || 0;
    const groundReady = groundLooksHarvestTexture(field && field.groundType);

    if (!fruit || fruit === "UNKNOWN" || gs <= 0 || isMowableForage(fruit) || fruit === "SPINACH") {
        return {
            harvestReady: fruit !== "SPINACH" ? false : groundReady && gs > 0,
            isHarvested: false,
            isWithered: false,
        };
    }

    const spec = VANILLA_ARABLE_STAGES[fruit];
    if (spec) {
        if (inList(spec.harvested, gs)) {
            return { harvestReady: false, isHarvested: true, isWithered: false };
        }
        if (inList(spec.withered, gs)) {
            return { harvestReady: false, isHarvested: false, isWithered: true };
        }
        if (inList(spec.ready, gs)) {
            return { harvestReady: true, isHarvested: false, isWithered: false };
        }
        return { harvestReady: false, isHarvested: false, isWithered: false };
    }

    // Unknown / mod fruit: leftover HARVEST_READY ground at high cut indices (wheat-like 10).
    if (groundReady && gs >= 10) {
        return { harvestReady: false, isHarvested: true, isWithered: false };
    }
    if (groundReady) {
        return { harvestReady: true, isHarvested: false, isWithered: false };
    }
    return { harvestReady: false, isHarvested: false, isWithered: false };
}

function xmlGrowthLooksHarvested(field) {
    return classifyXmlFieldHarvest(field).isHarvested === true;
}

module.exports = {
    VANILLA_ARABLE_STAGES,
    classifyXmlFieldHarvest,
    xmlGrowthLooksHarvested,
    groundLooksHarvestTexture,
};
