"use strict";

const { encodeEnvelope } = require("../exportEnvelope");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseRoute, readExportBuffers, readExportDirectorySync, createFreshnessTracker, readResourcePayloadSync, readReplicaIngress, ingestWatchedSlot } = require("../exportIngress");
const { writeStrictPair } = require("../replicaPairContract.cjs");

function routeXml(fields) {
    const body = Object.entries(fields).map(([name, value]) => `${name}="${value}"`).join(" ");
    return `<farmDashboardRoute ${body}/>`;
}

function slot(sequence, generation, payload, career = "career-a") {
    return encodeEnvelope(payload, {
        careerId: career,
        sessionId: "session-a",
        publicationSequence: sequence,
        exportGeneration: generation,
        simulationTimeMs: 10,
    });
}

describe("export ingress", () => {
    test("an unchanged committed slot is isolated while changed bytes still advance", () => {
        const tracker = createFreshnessTracker({ now: () => 1000, staleAfterMs: 5000 });
        const route = routeXml({
            schema: "1", careerId: "career-a", sessionId: "session-a",
            publicationSequence: "1", slot: "a", persistence: "saved", sourceSlot: "savegame3",
        });
        const slotXml = slot(1, 1, JSON.stringify({ vehicles: [{ id: 1 }] }));
        const input = { routeXml: route, slotXml, sourceId: "cached-local", configuredSlot: "savegame3", tracker };
        const first = readExportBuffers(input);
        expect(first.status).toBe("valid");
        first.payload.vehicles[0].id = 99;
        const same = readExportBuffers(input);
        expect(same.payload.vehicles[0].id).toBe(1);
        expect(same.freshness).toBe("unconfirmed");

        const next = readExportBuffers({
            ...input,
            routeXml: route.replace('publicationSequence="1"', 'publicationSequence="2"'),
            slotXml: slot(2, 2, JSON.stringify({ vehicles: [{ id: 2 }] })),
        });
        expect(next.payload.vehicles[0].id).toBe(2);
        expect(next.freshness).toBe("live");
    });

    test("modern route reads only its committed slot; explicit legacy remains available", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-ingress-io-"));
        const route = routeXml({
            schema: "1", careerId: "career-a", sessionId: "session-a",
            publicationSequence: "1", slot: "a", persistence: "saved", sourceSlot: "savegame3",
        });
        fs.mkdirSync(path.join(dir, "career-a"), { recursive: true });
        fs.writeFileSync(path.join(dir, "active.xml"), route);
        fs.writeFileSync(path.join(dir, "career-a", "slot-a.xml"), slot(1, 1, JSON.stringify({ vehicles: [{ id: 3 }] })));
        fs.writeFileSync(path.join(dir, "data.json"), JSON.stringify({ vehicles: [{ id: 99 }] }));
        const read = jest.spyOn(fs, "readFileSync");
        try {
            const modern = readExportDirectorySync(dir, { sourceId: "local", configuredSlot: "savegame3", explicitLegacy: true });
            expect(modern.status).toBe("valid");
            expect(modern.payload.vehicles[0].id).toBe(3);
            expect(read.mock.calls.some(([file]) => file === path.join(dir, "data.json"))).toBe(false);

            fs.unlinkSync(path.join(dir, "active.xml"));
            const legacy = readExportDirectorySync(dir, { sourceId: "local", explicitLegacy: true });
            expect(legacy.status).toBe("identity-unconfirmed");
            expect(legacy.payload.vehicles[0].id).toBe(99);
        } finally {
            read.mockRestore();
        }
    });

    test("local ftp mirror status and discovery share one validated read", () => {
        const tracker = createFreshnessTracker({ now: () => 1000, staleAfterMs: 5000 });
        const route = routeXml({
            schema: "1",
            careerId: "career-a",
            sessionId: "session-a",
            publicationSequence: "1",
            slot: "a",
            persistence: "saved",
            sourceSlot: "savegame3",
        });
        const channels = ["local", "ftp", "mirror", "status", "discovery"];
        const first = channels.map((sourceId) => readExportBuffers({
            routeXml: route,
            slotXml: slot(1, 1, JSON.stringify({ vehicles: [{ id: 1 }], serverInfo: { saveSlot: "savegame3" } })),
            sourceId,
            configuredSlot: "savegame3",
            tracker,
        }));
        expect(first.every((item) => item.status === "valid" && item.payload.vehicles[0].id === 1)).toBe(true);
        expect(first.every((item) => item.freshness === "unconfirmed")).toBe(true);
        const second = readExportBuffers({
            routeXml: route.replace('publicationSequence="1"', 'publicationSequence="2"'),
            slotXml: slot(2, 2, JSON.stringify({ vehicles: [{ id: 2 }] })),
            sourceId: "local",
            configuredSlot: "savegame3",
            tracker,
        });
        expect(second.freshness).toBe("live");
        expect(second.identity.exportGeneration).toBe(2);
    });

    test("a bad route keeps the same career and rejects another career's json", () => {
        const previous = {
            sourceId: "local",
            payload: { vehicles: [{ id: 1 }] },
            identity: { sourceId: "local", careerId: "career-a" },
        };
        const missing = readExportBuffers({ routeXml: "<farmDashboardRoute", sourceId: "local", previous, legacyJson: JSON.stringify({ vehicles: [{ id: 9 }] }) });
        expect(missing.status).toBe("last-known");
        expect(missing.payload.vehicles[0].id).toBe(1);
        const legacy = readExportBuffers({
            routeXml: "",
            explicitLegacy: true,
            legacyJson: JSON.stringify({ vehicles: [{ id: 3 }] }),
            sourceId: "local",
        });
        expect(legacy.status).toBe("identity-unconfirmed");
        expect(legacy.freshness).toBe("unconfirmed");
    });

    test("truncated route xml is not a successful empty payload", () => {
        const parsed = parseRoute("<farmDashboardRoute schema=\"1\"");
        expect(parsed).toBeNull();
        const result = readExportBuffers({ routeXml: "<farmDashboardRoute schema=\"1\"", sourceId: "ftp" });
        expect(result.status).toBe("unavailable");
        expect(result.payload).toBeNull();
    });

    test("I10 a persistent tracker confirms the next sequence and then goes stale", () => {
        let clock = 1000;
        const now = () => clock;
        const payload = { vehicles: [{ id: 1 }] };
        const first = readExportBuffers({
            routeXml: routeXml({
                schema: "1", careerId: "career-a", sessionId: "session-a",
                publicationSequence: "1", slot: "a", persistence: "saved", sourceSlot: "savegame3",
            }),
            slotXml: slot(1, 1, JSON.stringify(payload)),
            sourceId: "local-i10",
            configuredSlot: "savegame3",
            now,
            staleAfterMs: 1000,
        });
        expect(first.freshness).toBe("unconfirmed");
        const second = readExportBuffers({
            routeXml: routeXml({
                schema: "1", careerId: "career-a", sessionId: "session-a",
                publicationSequence: "2", slot: "a", persistence: "saved", sourceSlot: "savegame3",
            }),
            slotXml: slot(2, 2, JSON.stringify({ vehicles: [{ id: 2 }] })),
            sourceId: "local-i10",
            configuredSlot: "savegame3",
            previous: first,
            now,
            staleAfterMs: 1000,
        });
        expect(second.freshness).toBe("live");
        clock = 3000;
        const aged = readExportBuffers({
            routeXml: routeXml({
                schema: "1", careerId: "career-a", sessionId: "session-a",
                publicationSequence: "2", slot: "a", persistence: "saved", sourceSlot: "savegame3",
            }),
            slotXml: slot(2, 2, JSON.stringify({ vehicles: [{ id: 2 }] })),
            sourceId: "local-i10",
            configuredSlot: "savegame3",
            previous: second,
            now,
            staleAfterMs: 1000,
        });
        expect(aged.freshness).toBe("stale");
        const missing = readExportBuffers({
            routeXml: "",
            sourceId: "local-i10",
            configuredSlot: "savegame3",
            previous: second,
            now,
        });
        expect(missing.status).toBe("last-known");
        expect(missing.payload.vehicles[0].id).toBe(2);
    });

    test("I11 rejects trailing markup, scientific notation, and unknown fields", () => {
        const good = routeXml({
            schema: "1", careerId: "career-a", sessionId: "session-a",
            publicationSequence: "1", slot: "a", persistence: "saved", sourceSlot: "savegame3",
        });
        expect(parseRoute(good + "<unexpected/>")).toBeNull();
        expect(parseRoute(good.replace('publicationSequence="1"', 'publicationSequence="1e0"'))).toBeNull();
        expect(parseRoute(good.replace('publicationSequence="1"', 'publicationSequence="01"'))).toBeNull();
        expect(parseRoute(good.replace("/>", ' extra="1"/>'))).toBeNull();
        expect(parseRoute(good + good)).toBeNull();
    });

    test("I12 a different source slot conflicts instead of being relabeled", () => {
        const result = readExportBuffers({
            routeXml: routeXml({
                schema: "1", careerId: "career-a", sessionId: "session-a",
                publicationSequence: "1", slot: "a", persistence: "saved", sourceSlot: "savegame4",
            }),
            slotXml: slot(1, 1, JSON.stringify({ vehicles: [{ id: 1 }] })),
            sourceId: "local",
            configuredSlot: "savegame3",
        });
        expect(result.status).toBe("conflict");
        expect(result.reason).toBe("source-slot");
        expect(result.payload).toBeNull();
    });

    test("J12 a route without whitespace or with leading garbage is rejected", () => {
        const glued = `<farmDashboardRoute schema="1"careerId="career-a" sessionId="session-a" publicationSequence="1" slot="a" persistence="saved" sourceSlot="savegame3"/>`;
        const garbage = `<farmDashboardRoute garbage schema="1" careerId="career-a" sessionId="session-a" publicationSequence="1" slot="a" persistence="saved" sourceSlot="savegame3"/>`;
        expect(parseRoute(glued)).toBeNull();
        expect(parseRoute(garbage)).toBeNull();
    });

    test("J13 a different configured slot does not keep the previous payload", () => {
        const previous = readExportBuffers({
            routeXml: routeXml({
                schema: "1", careerId: "career-a", sessionId: "session-a",
                publicationSequence: "1", slot: "a", persistence: "saved", sourceSlot: "savegame3",
            }),
            slotXml: slot(1, 1, JSON.stringify({ vehicles: [{ id: 3 }] })),
            sourceId: "slot-switch",
            configuredSlot: "savegame3",
        });
        const next = readExportBuffers({
            sourceId: "slot-switch",
            configuredSlot: "savegame4",
            previous,
        });
        expect(next.status).toBe("unavailable");
        expect(next.payload).toBeNull();
    });

    test("J10 the higher resource sequence wins", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-resource-"));
        const folder = path.join(dir, "career-a", "resources", "penDetail", "1");
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, "slot-a.xml"), slot(1, 0, JSON.stringify({ animals: [{ id: 101 }] })));
        fs.writeFileSync(path.join(folder, "slot-b.xml"), slot(2, 0, JSON.stringify({ animals: [{ id: 202 }] })));
        const payload = readResourcePayloadSync(dir, "career-a", "penDetail", "1");
        expect(payload.animals[0].id).toBe(202);
    });

    test("K06 route attributes are accepted in any order", () => {
        const reversed = `<farmDashboardRoute careerId="career-a" schema="1" sessionId="session-a" publicationSequence="1" slot="a" persistence="saved" sourceSlot="savegame3"/>`;
        const parsed = parseRoute(reversed);
        expect(parsed && parsed.careerId).toBe("career-a");
        expect(parsed && parsed.publicationSequence).toBe(1);
        expect(parsed && parsed.slot).toBe("a");
    });

    test("equal resource sequences are a conflict", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-resource-tie-"));
        const folder = path.join(dir, "career-a", "resources", "penDetail", "1");
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, "slot-a.xml"), slot(2, 0, JSON.stringify({ animals: [{ id: 101 }] })));
        fs.writeFileSync(path.join(folder, "slot-b.xml"), slot(2, 0, JSON.stringify({ animals: [{ id: 202 }] })));
        expect(readResourcePayloadSync(dir, "career-a", "penDetail", "1")).toBeNull();
    });

    test("readReplicaIngress rejects a checksum that does not match the bytes", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-replica-"));
        const payload = '{"vehicles":[{"id":1}]}';
        fs.writeFileSync(path.join(dir, "data.json"), payload);
        fs.writeFileSync(path.join(dir, "export-meta.json"), JSON.stringify({
            replica: true, careerId: "career-a", sessionId: "session-a",
            publicationSequence: 1, exportGeneration: 1, sourceSlot: "savegame3", checksum: 1,
        }));
        expect(readReplicaIngress(dir)).toBeNull();
    });

    test("M05 accepts a valid UTF-8 replica whose byte checksum matches", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-replica-utf8-"));
        const payload = '{"farmName":"Müller","vehicles":[{"id":1}]}';
        const envelope = slot(1, 1, payload);
        writeStrictPair(dir, envelope, { sourceId: "source-a", sourceSlot: "savegame3", connectionEpoch: "1", slot: "a", replicaRevision: 1 });
        const result = readReplicaIngress(dir, { sourceId: "source-a", configuredSlot: "savegame3" });
        expect(result && result.payload.farmName).toBe("Müller");
        expect(result.authoritative).toBe(false);
        expect(result.replica).toBe(true);
    });

    test("a dedicated server-owned identity is accepted from a replica and a route", () => {
        const careerId = "fd-0f1e2d3c4b5a6978-1";
        const sessionId = "ses-89abcdef01234567-1";
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-replica-dedicated-"));
        const envelope = encodeEnvelope('{"vehicles":[{"id":1}]}', {
            careerId, sessionId, publicationSequence: 1, exportGeneration: 1, simulationTimeMs: 10,
        });
        writeStrictPair(dir, envelope, { sourceId: "source-a", sourceSlot: "savegame3", connectionEpoch: "1", slot: "a", replicaRevision: 1 });
        const result = readReplicaIngress(dir, { sourceId: "source-a", configuredSlot: "savegame3" });
        expect(result && result.payload.vehicles[0].id).toBe(1);
        expect(result.identity.careerId).toBe(careerId);
        expect(result.identity.sessionId).toBe(sessionId);
        const parsed = parseRoute(routeXml({
            schema: "1", careerId, sessionId, publicationSequence: "1", slot: "a", persistence: "provisional", sourceSlot: "savegame3",
        }));
        expect(parsed && parsed.careerId).toBe(careerId);
    });

    test("M06 rejects different bytes that share an additive checksum", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-replica-collide-"));
        fs.writeFileSync(path.join(dir, "data.json"), '{"vehicles":[{"id":21}]}');
        fs.writeFileSync(path.join(dir, "export-meta.json"), JSON.stringify({
            replica: true, careerId: "career-a", sessionId: "session-a",
            publicationSequence: 1, exportGeneration: 1, sourceSlot: "savegame3", checksum: 2087,
        }));
        expect(readReplicaIngress(dir)).toBeNull();
    });

    test("M07 rejects a replica without session, sequence, generation, or source", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-replica-bare-"));
        fs.writeFileSync(path.join(dir, "data.json"), '{"vehicles":[{"id":12}]}');
        fs.writeFileSync(path.join(dir, "export-meta.json"), JSON.stringify({
            replica: true, careerId: "career-a", checksum: 2087,
        }));
        expect(readReplicaIngress(dir)).toBeNull();
    });

    test("active.xml wins over a neighbouring replica meta file", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-replica-route-"));
        fs.writeFileSync(path.join(dir, "export-meta.json"), JSON.stringify({ replica: true, careerId: "career-a" }));
        fs.writeFileSync(path.join(dir, "data.json"), '{"vehicles":[{"id":21}]}');
        fs.writeFileSync(path.join(dir, "active.xml"), routeXml({
            schema: "1", careerId: "career-a", sessionId: "session-a",
            publicationSequence: "1", slot: "a", persistence: "saved", sourceSlot: "savegame3",
        }));
        const slotDir = path.join(dir, "career-a");
        fs.mkdirSync(slotDir, { recursive: true });
        fs.writeFileSync(path.join(slotDir, "slot-a.xml"), slot(1, 1, JSON.stringify({ vehicles: [{ id: 3 }] })));
        const result = ingestWatchedSlot(dir, { sourceId: "local", configuredSlot: "savegame3" });
        expect(result && result.status).not.toBe("replica");
        expect(result && result.payload && result.payload.vehicles[0].id).toBe(3);
    });

    test("N01 rejects a Unicode pair that only shares an additive checksum", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-n01-"));
        fs.writeFileSync(path.join(dir, "data.json"), '{"farmName":"Müller","animalId":21}');
        fs.writeFileSync(path.join(dir, "export-meta.json"), JSON.stringify({
            replica: true, careerId: "career-a", sessionId: "session-a",
            publicationSequence: 1, exportGeneration: 1, sourceSlot: "savegame3", checksum: 3208,
        }));
        expect(readReplicaIngress(dir)).toBeNull();
    });

    test("N02 accepts the producer CRC for accented UTF-8", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-n02-"));
        const envelope = slot(1, 1, '{"farmName":"Müller","animalId":12}');
        writeStrictPair(dir, envelope, { sourceId: "source-a", sourceSlot: "savegame3", connectionEpoch: "1", slot: "a", replicaRevision: 1 });
        const result = readReplicaIngress(dir, { sourceId: "source-a", configuredSlot: "savegame3" });
        expect(result && result.payload.animalId).toBe(12);
        expect(result.authoritative).toBe(false);
    });

    test("N03 rejects publication sequence 0", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-n03-"));
        fs.writeFileSync(path.join(dir, "data.json"), '{"farmName":"Müller","animalId":12}');
        fs.writeFileSync(path.join(dir, "export-meta.json"), JSON.stringify({
            replica: true, careerId: "career-a", sessionId: "session-a",
            publicationSequence: 0, exportGeneration: 1, sourceSlot: "savegame3", crc: "4032892041",
        }));
        expect(readReplicaIngress(dir)).toBeNull();
    });

    test("N04 rejects a replica whose source slot is not the configured slot", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-n04-"));
        fs.writeFileSync(path.join(dir, "data.json"), '{"farmName":"Müller","animalId":12}');
        fs.writeFileSync(path.join(dir, "export-meta.json"), JSON.stringify({
            replica: true, careerId: "career-a", sessionId: "session-a",
            publicationSequence: 1, exportGeneration: 1, sourceSlot: "savegame3", crc: "4032892041",
        }));
        const result = ingestWatchedSlot(dir, { sourceId: "source-b", configuredSlot: "savegame99" });
        expect(result == null || result.status === "unavailable" || result.payload == null).toBe(true);
    });
});
