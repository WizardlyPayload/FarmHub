"use strict";

const fs = require("fs");
const path = require("path");
const { decodeEnvelope } = require("./exportEnvelope");

const SELECTION_SCHEMA = "1";
const SELECTION_ROOT = "farmDashboardReplicaSelection";
const SELECTION_ATTRS = [
    "selectionSchema",
    "replicaRevision",
    "sourceId",
    "sourceSlot",
    "connectionEpoch",
    "replica",
    "slot",
    "schema",
    "careerId",
    "sessionId",
    "publicationSequence",
    "exportGeneration",
    "simulationTimeMs",
    "encoding",
    "bytes",
    "crc",
];
const REVISION_MAX = 2147483647;

function renderSelection(fields) {
    const body = SELECTION_ATTRS.map((name) => `${name}="${fields[name]}"`).join(" ");
    return `<${SELECTION_ROOT} ${body}/>`;
}

function writeStrictPair(dir, envelopeXml, options) {
    const opts = options || {};
    const letter = opts.slot === "b" ? "b" : "a";
    const decoded = decodeEnvelope(envelopeXml, {});
    if (!decoded || decoded.status !== "valid" || !decoded.record) {
        throw new Error("fixture-envelope");
    }
    const record = decoded.record;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `slot-${letter}.xml`), envelopeXml);
    const revision = opts.replicaRevision == null ? 1 : opts.replicaRevision;
    fs.writeFileSync(path.join(dir, `selection-${letter}.xml`), renderSelection({
        selectionSchema: SELECTION_SCHEMA,
        replicaRevision: String(revision),
        sourceId: opts.sourceId,
        sourceSlot: opts.sourceSlot,
        connectionEpoch: String(opts.connectionEpoch == null ? "1" : opts.connectionEpoch),
        replica: "true",
        slot: letter,
        schema: "2",
        careerId: record.careerId,
        sessionId: record.sessionId,
        publicationSequence: String(record.publicationSequence),
        exportGeneration: String(record.exportGeneration),
        simulationTimeMs: String(record.simulationTimeMs),
        encoding: "base64",
        bytes: String(record.bytes),
        crc: String(record.crc),
    }));
    return decoded;
}

module.exports = {
    SELECTION_SCHEMA,
    SELECTION_ROOT,
    SELECTION_ATTRS,
    REVISION_MAX,
    renderSelection,
    writeStrictPair,
};
