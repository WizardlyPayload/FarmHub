"use strict";

/**
 * Additive section contract, version 1.
 * Owning functions: coverageOf, originalSampleTime, fleetMeasuredAt.
 * Producer sample time is FieldDataCollector.holdSoilSample (inherited mission g_time).
 * A later successful sample gets a new stamp. A failed read keeps the previous stamp.
 * Fleet time is VehicleDataCollector measuredAt from the same g_time. dataMerger copies
 * soilSampledAt and do not replace it with lastUpdated or mergeComputedAt.
 * A missing coverage value stays "unknown". Legacy payloads stay readable.
 * B06 disk retention is a later tranche.
 */
const SECTION_CONTRACT_VERSION = 1;

function coverageOf(section) {
    if (!section || typeof section !== "object") return "unknown";
    if (section.enabled === false) return "disabled";
    if (section.readState === "failed") return "failed";
    if (section.readState === "pending" || section.readState === "partial") return "partial";
    if (section.coverage === "complete" || section.coverage === "partial" || section.coverage === "unknown") {
        return section.coverage;
    }
    if (section.readState === "ok") return "unknown";
    return "unknown";
}

function originalSampleTime(field) {
    if (!field || typeof field !== "object" || field.soilSampledAt == null || field.soilSampledAt === "") return null;
    const at = Number(field.soilSampledAt);
    return Number.isFinite(at) ? at : null;
}

function fleetMeasuredAt(vehicle) {
    if (!vehicle || typeof vehicle !== "object" || vehicle.measuredAt == null || vehicle.measuredAt === "") return null;
    const at = Number(vehicle.measuredAt);
    return Number.isFinite(at) ? at : null;
}

module.exports = {
    SECTION_CONTRACT_VERSION,
    coverageOf,
    originalSampleTime,
    fleetMeasuredAt,
};
