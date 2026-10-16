"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { decodeEnvelope, encodeEnvelope, createFreshnessTracker, MAX_WIRE } = require("../exportEnvelope");
const { parseRoute, readExportBuffers, readExportDirectorySync, readResourcePayloadSync, selectResourceSelection, ingestWatchedSlot } = require("../exportIngress");
const { writeStrictPair } = require("../replicaPairContract.cjs");

const BOM = "\uFEFF";
const BOM_BYTES = Buffer.from([0xef, 0xbb, 0xbf]);
const DECLARATION = '<?xml version="1.0" encoding="utf-8" standalone="no"?>\r\n';

function nativeText(root) {
    return `${BOM}${DECLARATION}${root}\r\n`;
}

function envelope(sequence, generation, payload, overrides) {
    return encodeEnvelope(Buffer.from(JSON.stringify(payload), "utf8"), Object.assign({
        careerId: "career-a",
        sessionId: "session-a",
        publicationSequence: sequence,
        exportGeneration: generation,
        simulationTimeMs: 1000 * generation,
    }, overrides || {}));
}

function route(sequence, slot, overrides) {
    const fields = Object.assign({
        careerId: "career-a",
        sourceSlot: "savegame4",
        slot,
        sessionId: "session-a",
        persistence: "saved",
        schema: "1",
        publicationSequence: String(sequence),
    }, overrides || {});
    const body = Object.entries(fields).map(([name, value]) => `${name}="${value}"`).join(" ");
    return nativeText(`<farmDashboardRoute ${body}/>`);
}

function tempDir(label) {
    return fs.mkdtempSync(path.join(os.tmpdir(), `bom113-${label}-`));
}

function writeUtf8(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(text, "utf8"));
}

function variants(root) {
    const plain = `${DECLARATION}${root}\r\n`;
    return {
        stringPlain: plain,
        stringBom: `${BOM}${plain}`,
        bufferPlain: Buffer.from(plain, "utf8"),
        bufferBom: Buffer.concat([BOM_BYTES, Buffer.from(plain, "utf8")]),
    };
}

function comparable(decoded) {
    return {
        status: decoded.status,
        reason: decoded.reason,
        record: decoded.record,
        json: decoded.json,
        payload: decoded.payload ? decoded.payload.toString("base64") : null,
        gameplay: decoded.gameplay,
    };
}

function reasons(root, context) {
    return Object.values(variants(root)).map((input) => decodeEnvelope(input, context).reason);
}

const temps = [];
afterAll(() => {
    for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

describe("113 native XML BOM at the shared envelope boundary", () => {
    test("1: Buffer and utf8 string, with and without one leading BOM, decode identically", () => {
        const payload = { fields: [{ id: 1, name: "Feld Ä" }], vehicles: [{ id: 7 }], note: "snowman \u2603" };
        for (const root of [envelope(3, 2, payload), envelope(5, 0, {})]) {
            const decoded = Object.values(variants(root)).map((input) => comparable(decodeEnvelope(input, { careerId: "career-a" })));
            expect(decoded[0].status).toBe("valid");
            for (const item of decoded) expect(item).toEqual(decoded[0]);
            const bare = comparable(decodeEnvelope(`${BOM}${root}`, { careerId: "career-a" }));
            expect(bare).toEqual(comparable(decodeEnvelope(root, { careerId: "career-a" })));
            expect(bare).toEqual(comparable(decodeEnvelope(Buffer.concat([BOM_BYTES, Buffer.from(root, "utf8")]), { careerId: "career-a" })));
        }
        const first = decodeEnvelope(nativeText(envelope(3, 2, payload)), { careerId: "career-a" });
        expect(first.reason).toBe("live-candidate");
        expect(first.json).toEqual(payload);
        expect(first.record).toMatchObject({ publicationSequence: 3, exportGeneration: 2, sessionId: "session-a" });
    });

    test("2 + 4: readExportDirectorySync reads on-disk native files and advances two generations", () => {
        const dir = tempDir("dir");
        temps.push(dir);
        const tracker = createFreshnessTracker({ now: () => 1000, staleAfterMs: 60000 });
        const options = { sourceId: "bom113-local", configuredSlot: "savegame4", tracker };
        writeUtf8(path.join(dir, "career-a", "slot-a.xml"), nativeText(envelope(1, 1, { vehicles: [{ id: 1 }] })));
        writeUtf8(path.join(dir, "active.xml"), route(1, "a"));
        expect(fs.readFileSync(path.join(dir, "active.xml"))[0]).toBe(0xef);
        expect(fs.readFileSync(path.join(dir, "career-a", "slot-a.xml"), "utf8").charCodeAt(0)).toBe(0xfeff);
        const first = readExportDirectorySync(dir, options);
        expect(first).toMatchObject({ status: "valid", reason: "selected", freshness: "unconfirmed" });
        expect(first.identity).toMatchObject({ careerId: "career-a", sessionId: "session-a", publicationSequence: 1, exportGeneration: 1, configuredSlot: "savegame4" });
        expect(first.payload.vehicles[0].id).toBe(1);

        writeUtf8(path.join(dir, "career-a", "slot-b.xml"), nativeText(envelope(2, 2, { vehicles: [{ id: 2 }] })));
        writeUtf8(path.join(dir, "active.xml"), route(2, "b"));
        const second = readExportDirectorySync(dir, options);
        expect(second).toMatchObject({ status: "valid", reason: "selected", freshness: "live" });
        expect(second.identity).toMatchObject({ publicationSequence: 2, exportGeneration: 2 });
        expect(second.payload.vehicles[0].id).toBe(2);

        const watched = ingestWatchedSlot(dir, options);
        expect(watched.status).toBe("valid");
        expect(watched.identity.publicationSequence).toBe(2);
    });

    test("4: stale, wrong career, session or sequence are still rejected through native on-disk files", () => {
        const dir = tempDir("reject");
        temps.push(dir);
        const options = () => ({ sourceId: "bom113-reject", tracker: createFreshnessTracker({ now: () => 1, staleAfterMs: 60000 }) });
        const slotFile = path.join(dir, "career-a", "slot-a.xml");
        writeUtf8(slotFile, nativeText(envelope(2, 2, { vehicles: [] })));

        writeUtf8(path.join(dir, "active.xml"), route(3, "a"));
        expect(readExportDirectorySync(dir, options())).toMatchObject({ status: "conflict", reason: "route-mismatch" });
        writeUtf8(path.join(dir, "active.xml"), route(2, "a", { sessionId: "session-b" }));
        expect(readExportDirectorySync(dir, options())).toMatchObject({ status: "conflict", reason: "route-mismatch" });
        writeUtf8(path.join(dir, "active.xml"), route(2, "a"));
        writeUtf8(slotFile, nativeText(envelope(2, 2, { vehicles: [] }, { careerId: "career-b" })));
        expect(readExportDirectorySync(dir, options())).toMatchObject({ status: "unavailable", reason: "career" });
        writeUtf8(slotFile, nativeText(envelope(2, 0, { vehicles: [] })));
        expect(readExportDirectorySync(dir, options()).status).toBe("unavailable");
        writeUtf8(path.join(dir, "active.xml"), route(2, "a", { sourceSlot: "savegame9" }));
        expect(readExportDirectorySync(dir, Object.assign(options(), { configuredSlot: "savegame4" }))).toMatchObject({ status: "conflict", reason: "source-slot" });

        const tracker = createFreshnessTracker({ now: () => 1, staleAfterMs: 60000 });
        const newer = readExportBuffers({ routeXml: route(4, "a"), slotXml: nativeText(envelope(4, 4, { n: 4 })), sourceId: "bom113-seq", tracker });
        expect(newer.status).toBe("valid");
        const older = readExportBuffers({ routeXml: route(3, "a"), slotXml: nativeText(envelope(3, 3, { n: 3 })), sourceId: "bom113-seq", tracker });
        expect(older.freshness).not.toBe("live");
        expect(tracker.classify("bom113-seq", "career-a")).toBe("unconfirmed");
    });

    test("4: checksum, base64, duplicate attributes, DTD, entity and malformed input keep their rejection", () => {
        const good = envelope(1, 1, { a: 1 });
        const context = { careerId: "career-a" };
        const same = (root, reason) => expect(reasons(root, context)).toEqual([reason, reason, reason, reason]);
        same(good.replace(/crc="\d+"/, 'crc="1"'), "checksum");
        same(good.replace(/payload="([^"]*)"/, (m, p) => `payload="${p.slice(0, -4)}!!!!"`), "checksum");
        same(good.replace(/payload="([^"]*)"/, (m, p) => `payload="${p}A"`), "checksum");
        same(good.replace('schema="2"', 'schema="2" schema="2"'), "duplicate-attribute");
        same(good.replace('encoding="base64"', 'encoding="hex"'), "unsupported");
        same(good.replace('publicationSequence="1"', 'publicationSequence="01"'), "bad-counter");
        same(envelope(1, 1, { a: 1 }, { sessionId: "bad/session" }), "identity");
        expect(reasons(good, { careerId: "career-z" })).toEqual(["career", "career", "career", "career"]);
        same(`<!DOCTYPE farmDashboardExport [<!ENTITY x "y">]>${good}`, "dtd");
        same(good.replace('careerId="career-a"', 'careerId="career&amp;a"'), "entity");
        same(`${good}<extra/>`, "multiple-roots");

        const native = nativeText(good);
        const malformed = [
            `${BOM}${native}`,
            `garbage${native}`,
            ` ${native}`,
            native.replace("?>\r\n", `?>\r\n${BOM}`),
            native.replace('careerId="career-a"', `careerId="career-a${BOM}"`),
            native.replace(/payload="([^"]*)"/, (m, p) => `payload="${BOM}${p}"`),
            native.replace("/>", ">"),
        ];
        for (const text of malformed) {
            const fromString = decodeEnvelope(text, context);
            const fromBuffer = decodeEnvelope(Buffer.from(text, "utf8"), context);
            expect(fromString.status).not.toBe("valid");
            expect(fromBuffer.status).toBe(fromString.status);
            expect(fromBuffer.reason).toBe(fromString.reason);
        }
        expect(decodeEnvelope(Buffer.concat([BOM_BYTES, Buffer.from([0xff, 0xfe, 0x3c])])).reason).toBe("utf8");
    });

    test("4: the wire cap is measured before BOM normalisation", () => {
        const root = envelope(1, 1, { a: 1 });
        const rootBytes = Buffer.byteLength(root, "utf8");
        const context = { careerId: "career-a" };
        const withoutBom = `${root}${" ".repeat(MAX_WIRE - 2 - rootBytes)}`;
        const overByBom = `${BOM}${withoutBom}`;
        expect(Buffer.byteLength(withoutBom, "utf8")).toBe(MAX_WIRE - 2);
        expect(Buffer.byteLength(overByBom, "utf8")).toBe(MAX_WIRE + 1);
        expect(decodeEnvelope(withoutBom, context).status).toBe("valid");
        expect(decodeEnvelope(overByBom, context).reason).toBe("wire-limit");
        expect(decodeEnvelope(Buffer.from(overByBom, "utf8"), context).reason).toBe("wire-limit");
        const atCap = `${BOM}${root}${" ".repeat(MAX_WIRE - 3 - rootBytes)}`;
        expect(Buffer.byteLength(atCap, "utf8")).toBe(MAX_WIRE);
        expect(decodeEnvelope(atCap, context).status).toBe("valid");
        expect(decodeEnvelope(Buffer.from(atCap, "utf8"), context).status).toBe("valid");
        expect(decodeEnvelope(`${BOM}${" ".repeat(MAX_WIRE - 2)}`).reason).toBe("wire-limit");
    });

    test("route parsing is unchanged for the native declaration", () => {
        expect(parseRoute(route(7, "b"))).toEqual({ careerId: "career-a", sessionId: "session-a", publicationSequence: 7, slot: "b", persistence: "saved", sourceSlot: "savegame4" });
        expect(parseRoute(route(7, "b").replace('schema="1"', 'schema="1" schema="1"'))).toBeNull();
        expect(parseRoute(route(7, "b").replace('careerId="career-a"', 'careerId="career&amp;a"'))).toBeNull();
        expect(parseRoute(route(7, "b").replace('slot="b"', 'slot="c"'))).toBeNull();
    });

    test("5: resource-envelope string reader accepts native files and keeps identity checks", () => {
        const dir = tempDir("res");
        temps.push(dir);
        writeUtf8(path.join(dir, "active.xml"), route(3, "a"));
        const pens = path.join(dir, "career-a", "resources", "dirtyPens");
        writeUtf8(path.join(pens, "slot-a.xml"), nativeText(envelope(3, 0, { pens: [1, 2] })));
        writeUtf8(path.join(pens, "slot-b.xml"), nativeText(envelope(2, 0, { pens: [9] })));
        expect(readResourcePayloadSync(dir, "career-a", "dirtyPens")).toEqual({ pens: [1, 2] });
        expect(readResourcePayloadSync(dir, "career-a", "dirtyPens", null, { sessionId: "session-b" })).toBeNull();
        expect(readResourcePayloadSync(dir, "career-b", "dirtyPens")).toBeNull();
        expect(readResourcePayloadSync(dir, "career-a", "../dirtyPens")).toBeNull();
        const detail = path.join(dir, "career-a", "resources", "penDetail", "pen-1");
        writeUtf8(path.join(detail, "slot-b.xml"), nativeText(envelope(4, 0, { pen: "pen-1" })));
        expect(readResourcePayloadSync(dir, "career-a", "penDetail", "pen-1")).toEqual({ pen: "pen-1" });
        expect(readResourcePayloadSync(dir, "career-a", "penDetail", "..")).toBeNull();

        const docs = [nativeText(envelope(5, 0, { v: 5 })), nativeText(envelope(5, 0, { v: 6 }))];
        expect(selectResourceSelection(docs, { careerId: "career-a", sessionId: "session-a" }).status).toBe("conflict");
        const tampered = nativeText(envelope(6, 0, { v: 6 })).replace(/crc="\d+"/, 'crc="1"');
        expect(selectResourceSelection([tampered], { careerId: "career-a", sessionId: "session-a" }).status).toBe("invalid");
    });

    test("5: replica pair reader accepts a native slot envelope and keeps selection and identity checks", () => {
        const dir = tempDir("replica");
        temps.push(dir);
        const native = nativeText(envelope(2, 2, { vehicles: [{ id: 5 }] }));
        writeStrictPair(dir, native, { slot: "a", sourceId: "host-1", sourceSlot: "savegame4" });
        expect(fs.readFileSync(path.join(dir, "slot-a.xml"), "utf8").charCodeAt(0)).toBe(0xfeff);
        const tracker = createFreshnessTracker({ now: () => 1, staleAfterMs: 60000 });
        const replica = ingestWatchedSlot(dir, { sourceId: "host-1", configuredSlot: "savegame4", tracker });
        expect(replica).toMatchObject({ status: "replica", replica: true, authoritative: false, reason: "selected" });
        expect(replica.identity).toMatchObject({ sourceId: "host-1", careerId: "career-a", publicationSequence: 2, exportGeneration: 2 });
        expect(replica.payload.vehicles[0].id).toBe(5);
        expect(ingestWatchedSlot(dir, { sourceId: "host-2", tracker }).status).toBe("unavailable");
        expect(ingestWatchedSlot(dir, { configuredSlot: "savegame9", tracker }).status).toBe("unavailable");

        const other = nativeText(envelope(2, 2, { vehicles: [{ id: 6 }] }));
        writeUtf8(path.join(dir, "slot-a.xml"), other);
        expect(ingestWatchedSlot(dir, { sourceId: "host-1", tracker })).toMatchObject({ status: "unavailable", reason: "invalid" });

        const legacy = tempDir("replica-legacy");
        temps.push(legacy);
        writeUtf8(path.join(legacy, "selected.xml"), native);
        writeUtf8(path.join(legacy, "replicaContext.xml"), '<farmDashboardReplicaContext sourceId="host-1" sourceSlot="savegame4" connectionEpoch="1" replica="true"/>');
        expect(ingestWatchedSlot(legacy, { tracker }).reason).toBe("legacy-unconfirmed");
        const preview = ingestWatchedSlot(legacy, { explicitLegacy: true, tracker });
        expect(preview).toMatchObject({ status: "replica", reason: "legacy-preview", authoritative: false });
        expect(preview.payload.vehicles[0].id).toBe(5);
    });
});
