"use strict";

const fs = require("fs");
const path = require("path");
const {
    adler32,
    decodeEnvelope,
    encodeEnvelope,
    selectEnvelopeCandidates,
    createFreshnessTracker,
    MAX_WIRE,
} = require("../exportEnvelope");

const context = {
    careerId: "career-a",
    sessionId: "session-a",
    publicationSequence: 1,
    exportGeneration: 1,
    simulationTimeMs: "368082",
};

function envelope(payload, overrides) {
    return encodeEnvelope(Buffer.isBuffer(payload) ? payload : Buffer.from(payload), Object.assign({}, context, overrides));
}

function candidate(sequence, payload, overrides) {
    const body = Buffer.from(payload);
    const xml = envelope(body, Object.assign({ publicationSequence: sequence }, overrides));
    const decoded = decodeEnvelope(xml, { careerId: "career-a" });
    return {
        presence: "present",
        status: decoded.status,
        record: decoded.record,
        payload: decoded.payload,
    };
}

describe("export envelope consumer", () => {
    test("F01 empty codec is not gameplay json", () => {
        const decoded = decodeEnvelope(envelope(Buffer.alloc(0), { exportGeneration: 1 }), { careerId: "career-a" });
        expect(decoded.status).toBe("valid");
        expect(decoded.reason).toBe("empty-payload");
        expect(decoded.gameplay).toBe(false);
        expect(decoded.payload.length).toBe(0);
    });

    test("F01 special unicode and large bytes round trip", () => {
        const special = Buffer.from('{"note":"say \\"hi\\" & <tag>\\u0001 é"}', "utf8");
        const decoded = decodeEnvelope(envelope(special), { careerId: "career-a" });
        expect(decoded.status).toBe("valid");
        expect(decoded.payload.equals(special)).toBe(true);
        expect(decoded.json.note).toContain("é");
        const pad = "Q".repeat((2 * 1024 * 1024) + 64);
        const large = Buffer.from(`{"q":"${pad}"}`, "utf8");
        const largeDecoded = decodeEnvelope(envelope(large, { publicationSequence: 4, exportGeneration: 2 }), { careerId: "career-a" });
        expect(largeDecoded.status).toBe("valid");
        expect(largeDecoded.payload.length).toBe(large.length);
        expect(largeDecoded.payload.equals(large)).toBe(true);
    });

    test("F01 native schema 1 specimen stays readable and keeps the zero tick", () => {
        const file = path.join(__dirname, "fixtures/export-envelope/schema1-slot-b.xml");
        const xml = fs.readFileSync(file);
        const decoded = decodeEnvelope(xml, { allowDiagnosticSchema1: true });
        expect(decoded.status).toBe("diagnostic");
        expect(decoded.record.simulationTimeMs).toBe("0");
        expect(decoded.payload.length).toBe(17);
    });

    test("F02 rejects unsafe envelopes", () => {
        expect(decodeEnvelope("<!DOCTYPE farmDashboardExport [<!ENTITY x 'y'>]><farmDashboardExport/>").reason).toBe("dtd");
        expect(decodeEnvelope('<farmDashboardExport schema="2" schema="2"/>').reason).toBe("duplicate-attribute");
        expect(decodeEnvelope(Buffer.from([0xff, 0xfe, 0x3c])).reason).toBe("utf8");
        expect(decodeEnvelope(`${envelope('{"a":1}')}<extra/>`).reason).toBe("multiple-roots");
        const polluted = envelope('{"__proto__":{"admin":true}}');
        expect(decodeEnvelope(polluted).reason).toBe("prototype-pollution");
        expect(decodeEnvelope(envelope("not-json")).reason).toBe("json");
        expect(decodeEnvelope(envelope('""')).reason).toBe("json");
        const tampered = envelope('{"a":1}').replace(/crc="\d+"/, 'crc="1"');
        expect(decodeEnvelope(tampered).reason).toBe("checksum");
        expect(decodeEnvelope(envelope('{"a":1}').replace('encoding="base64"', 'encoding="hex"')).reason).toBe("unsupported");
        const badPad = envelope('{"a":1}').replace(/payload="[^"]+"/, 'payload="QQ==QQ=="');
        expect(decodeEnvelope(badPad).status).toBe("corrupt");
        expect(decodeEnvelope(Buffer.alloc(MAX_WIRE + 1)).reason).toBe("wire-limit");
    });

    test("F03 selects sequence career and conflict", () => {
        const first = candidate(1, '{"n":1}');
        const second = candidate(2, '{"n":2}', { sessionId: "session-b" });
        const third = candidate(3, '{"n":3}', { sessionId: "session-b" });
        const picked = selectEnvelopeCandidates([first, second, third], { careerId: "career-a" });
        expect(picked.selected.record.publicationSequence).toBe(3);
        const restarted = candidate(4, '{"n":4}', { sessionId: "session-c" });
        expect(selectEnvelopeCandidates([third, restarted], { careerId: "career-a" }).selected.record.sessionId).toBe("session-c");
        const other = candidate(9, '{"n":9}', { careerId: "career-b" });
        expect(selectEnvelopeCandidates([other], { careerId: "career-a" }).status).toBe("absent");
        expect(selectEnvelopeCandidates([first], {}).status).toBe("identity-unconfirmed");
        const twin = candidate(2, '{"n":2}', { sessionId: "session-b" });
        expect(selectEnvelopeCandidates([second, twin], { careerId: "career-a" }).status).toBe("redundant");
        const clash = candidate(2, '{"n":"other"}', { sessionId: "session-b" });
        const conflict = selectEnvelopeCandidates([second, clash], { careerId: "career-a", lastAccepted: { keep: true } });
        expect(conflict.status).toBe("conflict");
        expect(conflict.retained.keep).toBe(true);
        expect(selectEnvelopeCandidates([], { careerId: "career-a", legacyCompatible: true, legacyJson: { ok: 1 }, exportGeneration: 1 }).status).toBe("legacy");
        expect(selectEnvelopeCandidates([], { careerId: "career-a", legacyCompatible: true, legacyJson: { ok: 1 }, exportGeneration: 0 }).status).toBe("startup");
    });

    test("F07 freshness is scoped and does not refresh on the same sequence", () => {
        let clock = 0;
        const tracker = createFreshnessTracker({ now: () => clock, staleAfterMs: 10 });
        expect(tracker.observe({ sourceId: "local", careerId: "career-a", publicationSequence: 3, exportGeneration: 2 })).toBe("unconfirmed");
        expect(tracker.classify("local", "career-a")).toBe("unconfirmed");
        clock = 5;
        expect(tracker.observe({ sourceId: "local", careerId: "career-a", publicationSequence: 4, exportGeneration: 2 })).toBe("live");
        clock = 9;
        tracker.observe({ sourceId: "local", careerId: "career-a", publicationSequence: 4, exportGeneration: 2 });
        expect(tracker.classify("local", "career-a")).toBe("live");
        clock = 20;
        tracker.observe({ sourceId: "local", careerId: "career-a", publicationSequence: 4, exportGeneration: 2 });
        tracker.observe({ sourceId: "local", careerId: "career-a", publicationSequence: 2, exportGeneration: 2 });
        tracker.observe({ sourceId: "local", careerId: "career-a", publicationSequence: 4, exportGeneration: 2, corrupt: true });
        expect(tracker.classify("local", "career-a")).toBe("stale");
        expect(tracker.observe({ sourceId: "local", careerId: "career-a", publicationSequence: 1, exportGeneration: 0 })).toBe("startup");
        expect(tracker.classify("ftp", "career-a")).toBe("absent");
        tracker.observe({ sourceId: "ftp", careerId: "career-b", publicationSequence: 1, exportGeneration: 1 });
        expect(tracker.classify("ftp", "career-b")).toBe("unconfirmed");
        expect(tracker.classify("local", "career-a")).toBe("stale");
        tracker.forget("local");
        expect(tracker.classify("local", "career-a")).toBe("absent");
        expect(tracker.classify("ftp", "career-b")).toBe("unconfirmed");
    });

    test("checksum matches the Lua Adler initial value", () => {
        expect(adler32(Buffer.alloc(0))).toBe("1");
        expect(adler32(Buffer.from("CLOCK"))).toBe(String(adler32(Buffer.from("CLOCK"))));
    });

    test("C01 equal sequence with a different session is conflict", () => {
        const left = candidate(2, '{"n":"same"}', { sessionId: "session-a" });
        const right = candidate(2, '{"n":"same"}', { sessionId: "session-b" });
        expect(selectEnvelopeCandidates([left, right], { careerId: "career-a" }).status).toBe("conflict");
    });

    test("C02 a later sequence wins over identical older copies", () => {
        const older = candidate(1, '{"n":"old"}');
        const twin = candidate(1, '{"n":"old"}');
        const next = candidate(3, '{"n":"new"}');
        const selected = selectEnvelopeCandidates([older, twin, next], { careerId: "career-a" });
        expect(selected.status).toBe("valid");
        expect(selected.selected.record.publicationSequence).toBe(3);
    });

    test("C03 empty gameplay bytes are not selected", () => {
        const decoded = decodeEnvelope(envelope(Buffer.alloc(0), { exportGeneration: 1 }), { careerId: "career-a" });
        const selected = selectEnvelopeCandidates([Object.assign({ presence: "present" }, decoded)], { careerId: "career-a" });
        expect(selected.status).toBe("invalid");
    });

    test("C04 C05 C06 and C09 XML shapes", () => {
        const xml = envelope('{"n":1}');
        expect(decodeEnvelope(`garbage${xml}`, { careerId: "career-a" }).status).toBe("corrupt");
        expect(decodeEnvelope(xml.replace("/>", ">"), { careerId: "career-a" }).status).toBe("corrupt");
        const mixed = xml.replace('careerId="career-a"', `careerId="career-a" careerId='career-b'`);
        expect(decodeEnvelope(mixed, { careerId: "career-a" }).status).toBe("corrupt");
        const explicit = xml.replace("/>", "></farmDashboardExport>");
        expect(decodeEnvelope(explicit, { careerId: "career-a" }).status).toBe("valid");
    });

    test("C07 and C08 unreadable and unknown do not become absent or legacy", () => {
        expect(selectEnvelopeCandidates([{ presence: "unreadable" }], { careerId: "career-a" }).status).toBe("unreadable");
        expect(selectEnvelopeCandidates(
            [{ presence: "unknown" }],
            { careerId: "career-a", legacyCompatible: true, legacyJson: { ok: 1 } },
        ).status).toBe("unknown");
    });

    test("X01 canonical tick has no trailing fraction", () => {
        const xml = encodeEnvelope(Buffer.from('{"n":1}'), Object.assign({}, context, { simulationTimeMs: "2147483648" }));
        const decoded = decodeEnvelope(xml, { careerId: "career-a" });
        expect(decoded.status).toBe("valid");
        expect(decoded.record.simulationTimeMs).toBe("2147483648");
        expect(decoded.record.simulationTimeMs.endsWith(".0")).toBe(false);
        for (const tick of ["2147483647", "2147483648", "999999999999999", "unknown"]) {
            const document = encodeEnvelope(Buffer.from('{"n":1}'), Object.assign({}, context, { simulationTimeMs: tick }));
            expect(decodeEnvelope(document, { careerId: "career-a" }).record.simulationTimeMs).toBe(tick);
        }
        expect(decodeEnvelope(encodeEnvelope(Buffer.from('{"n":1}'), Object.assign({}, context, { simulationTimeMs: "2147483648.0" })), { careerId: "career-a" }).status).toBe("corrupt");
        expect(decodeEnvelope(encodeEnvelope(Buffer.from('{"n":1}'), Object.assign({}, context, { simulationTimeMs: "1000000000000000" })), { careerId: "career-a" }).status).toBe("corrupt");
    });

    test("schema 1 specimen stays diagnostic", () => {
        const xml = fs.readFileSync(path.join(__dirname, "fixtures/export-envelope/schema1-slot-b.xml"));
        const decoded = decodeEnvelope(xml, { allowDiagnosticSchema1: true });
        expect(decoded.status).toBe("diagnostic");
        expect(decoded.record.schema).toBe(1);
        expect(decoded.record.bytes).toBe(17);
    });
});
