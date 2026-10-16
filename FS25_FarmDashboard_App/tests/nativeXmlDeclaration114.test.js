"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { encodeEnvelope } = require("../exportEnvelope");
const { ingestWatchedSlot, parseReplicaContext, parseSelectionRecord } = require("../exportIngress");
const { renderSelection, writeStrictPair } = require("../replicaPairContract.cjs");
const replicaRegistration = require("../replicaRegistration");

const BOM = "\uFEFF";
const DECL_EXISTING = '<?xml version="1.0" encoding="utf-8"?>';
const DECL_NATIVE_NO = '<?xml version="1.0" encoding="utf-8" standalone="no"?>';
const DECL_NATIVE_YES = '<?xml version="1.0" encoding="utf-8" standalone="yes"?>';
const DECL_VERSION_STANDALONE = '<?xml version="1.0" standalone="no"?>';

function nativeText(root, declaration) {
    return `${BOM}${declaration || DECL_NATIVE_NO}\r\n${root}\r\n`;
}

function shapes(root) {
    const out = { bare: root, bareBom: `${BOM}${root}` };
    const decls = {
        existing: DECL_EXISTING,
        nativeNo: DECL_NATIVE_NO,
        nativeYes: DECL_NATIVE_YES,
        versionStandalone: DECL_VERSION_STANDALONE,
    };
    for (const [name, decl] of Object.entries(decls)) {
        out[name] = `${decl}\r\n${root}\r\n`;
        out[`${name}Bom`] = `${BOM}${decl}\r\n${root}\r\n`;
    }
    return out;
}

const SELECTION_FIELDS = {
    selectionSchema: "1", replicaRevision: "3", sourceId: "source-a", sourceSlot: "savegame3",
    connectionEpoch: "2", replica: "true", slot: "a", schema: "2", careerId: "career-a",
    sessionId: "session-a", publicationSequence: "4", exportGeneration: "4",
    simulationTimeMs: "10", encoding: "base64", bytes: "2", crc: "1",
};
const SELECTION = renderSelection(SELECTION_FIELDS);
const CONTEXT = '<farmDashboardReplicaContext sourceId="source-a" sourceSlot="savegame3" connectionEpoch="2" replica="true"/>';
const REGISTRATION = [
    '<farmDashboardReplicaSources revision="3">',
    '<source sourceId="source-a" remoteSlot="savegame3" serverKey="alpha"/>',
    '<source sourceId="source-b" remoteSlot="savegame5" serverKey="bravo"/>',
    "</farmDashboardReplicaSources>",
].join("\r\n");

function envelope(sequence, extra) {
    return encodeEnvelope(`{"vehicles":[{"id":${sequence}}]}`, Object.assign({
        careerId: "career-a",
        sessionId: "session-a",
        publicationSequence: sequence,
        exportGeneration: sequence,
        simulationTimeMs: 10,
    }, extra || {}));
}

function tempDir(label) {
    return fs.mkdtempSync(path.join(os.tmpdir(), `decl114-${label}-`));
}

// Rewrites a strict pair on disk in the GIANTS saveXMLFile shape: BOM + standalone declaration + CRLF.
function nativePair(dir, xml, options, declaration) {
    const opts = Object.assign({ sourceId: "source-a", sourceSlot: "savegame3", replicaRevision: 3, slot: "a" }, options || {});
    writeStrictPair(dir, xml, opts);
    const letter = opts.slot === "b" ? "b" : "a";
    for (const name of [`slot-${letter}.xml`, `selection-${letter}.xml`]) {
        const file = path.join(dir, name);
        fs.writeFileSync(file, Buffer.from(nativeText(fs.readFileSync(file, "utf8"), declaration), "utf8"));
    }
    return opts;
}

function editSelection(dir, letter, from, to) {
    const file = path.join(dir, `selection-${letter}.xml`);
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes(from)) throw new Error("fixture edit missed " + from);
    fs.writeFileSync(file, text.replace(from, to));
}

const OPTS = { sourceId: "source-a", configuredSlot: "savegame3" };

describe("native XML declaration 114 — strict boundaries", () => {
    test("selection, context and registration parse identically for bare, existing and native declarations", () => {
        const expected = {
            selection: parseSelectionRecord(SELECTION),
            context: parseReplicaContext(CONTEXT),
            registration: replicaRegistration.parseRegistrationDocument(REGISTRATION),
        };
        expect(expected.selection).toEqual(expect.objectContaining({ sourceId: "source-a", replicaRevision: "3", slot: "a" }));
        expect(expected.context).toEqual(expect.objectContaining({ sourceId: "source-a", connectionEpoch: "2" }));
        expect(expected.registration).toEqual({
            ok: true,
            revision: 3,
            rows: [
                { sourceId: "source-a", remoteSlot: "savegame3", sessionPairing: "alpha" },
                { sourceId: "source-b", remoteSlot: "savegame5", sessionPairing: "bravo" },
            ],
        });
        const seen = [];
        for (const [name, text] of Object.entries(shapes(SELECTION))) {
            expect([name, parseSelectionRecord(text)]).toEqual([name, expected.selection]);
            seen.push(name);
        }
        for (const [name, text] of Object.entries(shapes(CONTEXT))) {
            expect([name, parseReplicaContext(text)]).toEqual([name, expected.context]);
        }
        for (const [name, text] of Object.entries(shapes(REGISTRATION))) {
            expect([name, replicaRegistration.parseRegistrationDocument(text)]).toEqual([name, expected.registration]);
        }
        expect(seen).toHaveLength(10);
    });

    test("malformed declarations and pseudo-attributes stay rejected at every boundary", () => {
        const bad = {
            unknownPseudo: '<?xml version="1.0" encoding="utf-8" standalone="no" extra="1"?>',
            unknownOnly: '<?xml version="1.0" foo="bar"?>',
            invalidStandalone: '<?xml version="1.0" encoding="utf-8" standalone="maybe"?>',
            upperStandalone: '<?xml version="1.0" encoding="utf-8" standalone="NO"?>',
            emptyStandalone: '<?xml version="1.0" encoding="utf-8" standalone=""?>',
            singleQuoted: "<?xml version=\"1.0\" encoding=\"utf-8\" standalone='no'?>",
            outOfOrder: '<?xml version="1.0" standalone="no" encoding="utf-8"?>',
            duplicateStandalone: '<?xml version="1.0" encoding="utf-8" standalone="no" standalone="no"?>',
            duplicateEncoding: '<?xml version="1.0" encoding="utf-8" encoding="utf-8"?>',
            standaloneFirst: '<?xml standalone="no" version="1.0"?>',
            adjacent: '<?xml version="1.0" encoding="utf-8"standalone="no"?>',
            missingVersion: '<?xml encoding="utf-8" standalone="no"?>',
            version11: '<?xml version="1.1" encoding="utf-8" standalone="no"?>',
            upperXml: '<?XML version="1.0" encoding="utf-8" standalone="no"?>',
            unterminated: '<?xml version="1.0" encoding="utf-8" standalone="no"',
            doubleDeclaration: `${DECL_NATIVE_NO}\r\n${DECL_NATIVE_NO}`,
            stylesheetPi: `${DECL_NATIVE_NO}\r\n<?xml-stylesheet href="x"?>`,
        };
        for (const [name, decl] of Object.entries(bad)) {
            for (const bom of ["", BOM]) {
                expect([name, bom.length, parseSelectionRecord(`${bom}${decl}\r\n${SELECTION}\r\n`)]).toEqual([name, bom.length, null]);
                expect([name, bom.length, parseReplicaContext(`${bom}${decl}\r\n${CONTEXT}\r\n`)]).toEqual([name, bom.length, null]);
                const reg = replicaRegistration.parseRegistrationDocument(`${bom}${decl}\r\n${REGISTRATION}\r\n`);
                expect([name, bom.length, reg]).toEqual([name, bom.length, { ok: false, error: "damaged" }]);
            }
        }
    });

    test("DTD, entities, comments, extra roots, duplicate root attributes, oversize and bad counters stay rejected under the native declaration", () => {
        const sel = (root) => parseSelectionRecord(nativeText(root));
        const ctx = (root) => parseReplicaContext(nativeText(root));
        const reg = (root) => replicaRegistration.parseRegistrationDocument(nativeText(root));

        expect(parseSelectionRecord(`${BOM}${DECL_NATIVE_NO}\r\n<!DOCTYPE x>\r\n${SELECTION}`)).toBeNull();
        expect(parseReplicaContext(`${BOM}${DECL_NATIVE_NO}\r\n<!DOCTYPE x [<!ENTITY e "v">]>\r\n${CONTEXT}`)).toBeNull();
        expect(sel(SELECTION.replace('sourceId="source-a"', 'sourceId="source-&amp;a"'))).toBeNull();
        expect(ctx(`<!--note-->${CONTEXT}`)).toBeNull();
        expect(sel(`${SELECTION}<junk/>`)).toBeNull();
        expect(ctx(`${CONTEXT}\r\n${CONTEXT}`)).toBeNull();
        expect(sel(SELECTION.replace(' sourceSlot="savegame3"', ' sourceSlot="savegame3" sourceSlot="savegame3"'))).toBeNull();
        expect(ctx(CONTEXT.replace(' replica="true"', ' replica="true" replica="true"'))).toBeNull();
        expect(sel(SELECTION.replace(' sourceSlot="savegame3"', ' extra="1" sourceSlot="savegame3"'))).toBeNull();
        expect(ctx(CONTEXT.replace(' replica="true"', ' standalone="no" replica="true"'))).toBeNull();
        expect(sel(SELECTION.replace('selectionSchema="1" replicaRevision="3"', 'replicaRevision="3" selectionSchema="1"'))).toBeNull();
        expect(sel(SELECTION.replace('replicaRevision="3"', 'replicaRevision="03"'))).toBeNull();
        expect(sel(SELECTION.replace('replicaRevision="3"', 'replicaRevision="0"'))).toBeNull();
        expect(sel(SELECTION.replace('replicaRevision="3"', 'replicaRevision="2147483648"'))).toBeNull();
        expect(sel(SELECTION.replace('connectionEpoch="2"', 'connectionEpoch="02"'))).toBeNull();
        expect(sel(SELECTION.replace('crc="1"', 'crc="-1"'))).toBeNull();
        expect(ctx(CONTEXT.replace('connectionEpoch="2"', 'connectionEpoch="x"'))).toBeNull();
        expect(ctx(CONTEXT.replace('sourceId="source-a"', 'sourceId="../a"'))).toBeNull();
        expect(sel(SELECTION.replace('sourceId="source-a"', 'sourceId="../a"'))).toBeNull();
        expect(sel(`${SELECTION}${" ".repeat(8192)}`)).toBeNull();
        expect(ctx(`${CONTEXT}${" ".repeat(8192)}`)).toBeNull();

        expect(reg(REGISTRATION.replace('<farmDashboardReplicaSources revision="3">', '<!DOCTYPE x>\r\n<farmDashboardReplicaSources revision="3">'))).toEqual({ ok: false, error: "damaged" });
        expect(reg(REGISTRATION.replace('serverKey="alpha"', 'serverKey="&e;"'))).toEqual({ ok: false, error: "damaged" });
        expect(reg(`${REGISTRATION}\r\n<farmDashboardReplicaSources revision="1"/>`)).toEqual({ ok: false, error: "damaged" });
        expect(reg(REGISTRATION.replace('revision="3"', 'revision="3" revision="3"'))).toEqual({ ok: false, error: "damaged" });
        expect(reg(REGISTRATION.replace('revision="3"', 'revision="03"'))).toEqual({ ok: false, error: "damaged" });
        expect(reg(REGISTRATION.replace('revision="3"', 'standalone="no" revision="3"'))).toEqual({ ok: false, error: "damaged" });
        expect(reg(`${REGISTRATION}${" ".repeat(replicaRegistration.MAX_DOCUMENT_BYTES)}`)).toEqual({ ok: false, error: "too-large" });
    });

    test("records the pre-existing BOM and whitespace tolerance of the strict element reader unchanged", () => {
        // Both boundaries remove one BOM, then String.prototype.trim also drops surrounding whitespace and U+FEFF.
        expect(parseSelectionRecord(`  \r\n${DECL_EXISTING}\r\n${SELECTION}`)).toEqual(parseSelectionRecord(SELECTION));
        expect(parseReplicaContext(`${BOM}${BOM}${DECL_EXISTING}\r\n${CONTEXT}`)).toEqual(parseReplicaContext(CONTEXT));
        expect(parseReplicaContext(`${DECL_EXISTING}${BOM}${CONTEXT}`)).toEqual(parseReplicaContext(CONTEXT));
        expect(replicaRegistration.parseRegistrationDocument(`${BOM}${BOM}${DECL_EXISTING}\r\n${REGISTRATION}`).ok).toBe(true);
        expect(parseReplicaContext(`x${DECL_EXISTING}\r\n${CONTEXT}`)).toBeNull();
        expect(replicaRegistration.parseRegistrationDocument(`x${DECL_EXISTING}\r\n${REGISTRATION}`)).toEqual({ ok: false, error: "damaged" });
    });
});

describe("native XML declaration 114 — on-disk replica ingest", () => {
    test("a native selection plus native slot envelope is ingested as the selected replica pair", () => {
        for (const declaration of [DECL_NATIVE_NO, DECL_NATIVE_YES]) {
            const dir = tempDir("pair");
            nativePair(dir, envelope(4), {}, declaration);
            const selectionBytes = fs.readFileSync(path.join(dir, "selection-a.xml"));
            const slotBytes = fs.readFileSync(path.join(dir, "slot-a.xml"));
            expect(selectionBytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
            expect(slotBytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
            expect(selectionBytes.toString("utf8")).toContain(`${declaration}\r\n<farmDashboardReplicaSelection `);
            expect(slotBytes.toString("utf8")).toContain(`${declaration}\r\n<farmDashboardExport `);
            const ingested = ingestWatchedSlot(dir, OPTS);
            expect(ingested.status).toBe("replica");
            expect(ingested.reason).toBe("selected");
            expect(ingested.replica).toBe(true);
            expect(ingested.authoritative).toBe(false);
            expect(ingested.legacy).toBe(false);
            expect(ingested.payload.vehicles[0].id).toBe(4);
            expect(ingested.identity).toEqual(expect.objectContaining({
                sourceId: "source-a", careerId: "career-a", sessionId: "session-a",
                publicationSequence: 4, exportGeneration: 4, sourceSlot: "savegame3",
                connectionEpoch: "1", replicaRevision: 3, replica: true, authoritative: false,
            }));
        }
    });

    test("a native pair on both letters picks the higher revision and a newer native commit advances", () => {
        const dir = tempDir("advance");
        nativePair(dir, envelope(4), { slot: "a", replicaRevision: 3 });
        nativePair(dir, envelope(5), { slot: "b", replicaRevision: 4 });
        const first = ingestWatchedSlot(dir, OPTS);
        expect(first.status).toBe("replica");
        expect(first.identity.publicationSequence).toBe(5);
        expect(first.identity.replicaRevision).toBe(4);
        nativePair(dir, envelope(6), { slot: "a", replicaRevision: 5 });
        const second = ingestWatchedSlot(dir, Object.assign({ previous: first, tracker: first.tracker }, OPTS));
        expect(second.status).toBe("replica");
        expect(second.identity.publicationSequence).toBe(6);
    });

    test("identity mismatches and partial or mixed native pairs stay unavailable or conflict", () => {
        const cases = {
            career: (dir) => editSelection(dir, "a", 'careerId="career-a"', 'careerId="career-b"'),
            session: (dir) => editSelection(dir, "a", 'sessionId="session-a"', 'sessionId="session-b"'),
            sequence: (dir) => editSelection(dir, "a", 'publicationSequence="4"', 'publicationSequence="5"'),
            generation: (dir) => editSelection(dir, "a", 'exportGeneration="4"', 'exportGeneration="5"'),
            selectionCrc: (dir) => editSelection(dir, "a", /crc="\d+"/.exec(fs.readFileSync(path.join(dir, "selection-a.xml"), "utf8"))[0], 'crc="7"'),
            selectionBytes: (dir) => editSelection(dir, "a", /bytes="\d+"/.exec(fs.readFileSync(path.join(dir, "selection-a.xml"), "utf8"))[0], 'bytes="1"'),
            letter: (dir) => editSelection(dir, "a", 'slot="a"', 'slot="b"'),
            epochNonCanonical: (dir) => editSelection(dir, "a", 'connectionEpoch="1"', 'connectionEpoch="01"'),
            revisionZero: (dir) => editSelection(dir, "a", 'replicaRevision="3"', 'replicaRevision="0"'),
            revisionNonCanonical: (dir) => editSelection(dir, "a", 'replicaRevision="3"', 'replicaRevision="03"'),
            envelopeTamper: (dir) => {
                const file = path.join(dir, "slot-a.xml");
                const text = fs.readFileSync(file, "utf8");
                const crc = /crc="(\d+)"/.exec(text)[1];
                fs.writeFileSync(file, text.replace(`crc="${crc}"`, `crc="${Number(crc) + 1}"`));
            },
            selectionWithoutSlot: (dir) => {
                fs.unlinkSync(path.join(dir, "slot-a.xml"));
                fs.writeFileSync(path.join(dir, "slot-b.xml"), nativeText(envelope(4)));
            },
            slotOnly: (dir) => fs.unlinkSync(path.join(dir, "selection-a.xml")),
            badSelectionDeclaration: (dir) => {
                const file = path.join(dir, "selection-a.xml");
                fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace('standalone="no"', 'standalone="maybe"'));
            },
        };
        for (const [name, mutate] of Object.entries(cases)) {
            const dir = tempDir(name);
            nativePair(dir, envelope(4));
            mutate(dir);
            const result = ingestWatchedSlot(dir, OPTS);
            expect([name, result.status, result.reason, result.payload, result.authoritative]).toEqual([name, "unavailable", "invalid", null, false]);
        }

        // No slot-*.xml or selected.xml at all: the directory is not treated as a replica and falls to the route reader.
        const selectionOnly = tempDir("selection-only");
        nativePair(selectionOnly, envelope(4));
        fs.unlinkSync(path.join(selectionOnly, "slot-a.xml"));
        expect(ingestWatchedSlot(selectionOnly, OPTS)).toEqual(expect.objectContaining({ status: "unavailable", reason: "route-unavailable", payload: null }));

        const wrongSource = tempDir("wrong-source");
        nativePair(wrongSource, envelope(4));
        expect(ingestWatchedSlot(wrongSource, { sourceId: "source-b", configuredSlot: "savegame3" })).toEqual(expect.objectContaining({ status: "unavailable", reason: "invalid", payload: null }));
        expect(ingestWatchedSlot(wrongSource, { sourceId: "source-a", configuredSlot: "savegame9" })).toEqual(expect.objectContaining({ status: "unavailable", reason: "invalid", payload: null }));

        const sameSequence = tempDir("same-sequence");
        nativePair(sameSequence, envelope(4), { slot: "a", replicaRevision: 3 });
        nativePair(sameSequence, envelope(4, { simulationTimeMs: 11 }), { slot: "b", replicaRevision: 4 });
        expect(ingestWatchedSlot(sameSequence, OPTS)).toEqual(expect.objectContaining({ status: "unavailable", reason: "conflict", payload: null }));

        const sameRevision = tempDir("same-revision");
        nativePair(sameRevision, envelope(4), { slot: "a", replicaRevision: 3 });
        nativePair(sameRevision, envelope(5), { slot: "b", replicaRevision: 3 });
        expect(ingestWatchedSlot(sameRevision, OPTS)).toEqual(expect.objectContaining({ status: "unavailable", reason: "conflict", payload: null }));

        const mixed = tempDir("mixed");
        nativePair(mixed, envelope(4), { slot: "a", replicaRevision: 3 });
        nativePair(mixed, envelope(5), { slot: "b", replicaRevision: 4 });
        fs.unlinkSync(path.join(mixed, "slot-b.xml"));
        const kept = ingestWatchedSlot(mixed, OPTS);
        expect(kept.status).toBe("replica");
        expect(kept.identity.publicationSequence).toBe(4);
        expect(kept.authoritative).toBe(false);
    });

    test("a native replicaContext is read through the legacy selected.xml reader, and its guards still hold", () => {
        const dir = tempDir("context");
        fs.writeFileSync(path.join(dir, "selected.xml"), nativeText(envelope(4)));
        fs.writeFileSync(path.join(dir, "replicaContext.xml"), nativeText(CONTEXT));
        expect(ingestWatchedSlot(dir, OPTS)).toEqual(expect.objectContaining({ status: "unavailable", reason: "legacy-unconfirmed", payload: null }));
        const preview = ingestWatchedSlot(dir, Object.assign({ explicitLegacy: true }, OPTS));
        expect(preview.status).toBe("replica");
        expect(preview.reason).toBe("legacy-preview");
        expect(preview.legacy).toBe(true);
        expect(preview.authoritative).toBe(false);
        expect(preview.freshness).toBe("unconfirmed");
        expect(preview.identity).toEqual(expect.objectContaining({ sourceId: "source-a", sourceSlot: "savegame3", connectionEpoch: "2", publicationSequence: 4 }));

        expect(ingestWatchedSlot(dir, { explicitLegacy: true, sourceId: "source-b", configuredSlot: "savegame3" })).toEqual({ status: "unavailable", reason: "replica-rejected", payload: null });
        expect(ingestWatchedSlot(dir, { explicitLegacy: true, sourceId: "source-a", configuredSlot: "savegame9" })).toEqual({ status: "unavailable", reason: "replica-rejected", payload: null });
        fs.writeFileSync(path.join(dir, "replicaContext.xml"), nativeText(CONTEXT).replace('standalone="no"', 'standalone="maybe"'));
        expect(ingestWatchedSlot(dir, Object.assign({ explicitLegacy: true }, OPTS))).toEqual({ status: "unavailable", reason: "replica-rejected", payload: null });
    });
});

describe("native XML declaration 114 — registration read path", () => {
    function profileWith(text) {
        const profile = tempDir("profile");
        const dir = path.join(profile, "modSettings", "FS25_FarmDashboard");
        fs.mkdirSync(dir, { recursive: true });
        if (text != null) fs.writeFileSync(path.join(dir, "replicaSources.xml"), Buffer.from(text, "utf8"));
        return { profile, dir, file: path.join(dir, "replicaSources.xml") };
    }
    const servers = [
        { id: "source-a", replicaRegistration: { remoteSlot: "savegame3", sessionPairing: "alpha" } },
        { id: "source-b", replicaRegistration: { remoteSlot: "savegame5", sessionPairing: "bravo" } },
    ];

    test("a native registration file is read by publish and advances the revision", () => {
        for (const declaration of [DECL_NATIVE_NO, DECL_NATIVE_YES]) {
            const { profile, dir, file } = profileWith(nativeText(REGISTRATION, declaration));
            const published = replicaRegistration.publishReplicaRegistration(profile, servers);
            expect(published).toEqual(expect.objectContaining({ ok: true, revision: 4, path: file }));
            expect(published.rows).toEqual([
                { sourceId: "source-a", remoteSlot: "savegame3", sessionPairing: "alpha" },
                { sourceId: "source-b", remoteSlot: "savegame5", sessionPairing: "bravo" },
            ]);
            expect(replicaRegistration.commitRegistrationPublication(published)).toEqual({ ok: true, reconciled: "committed-cleanup" });
            expect(fs.readdirSync(dir).sort()).toEqual(["replicaSources.xml"]);
            expect(replicaRegistration.parseRegistrationDocument(fs.readFileSync(file, "utf8")).revision).toBe(4);
        }
    });

    test("damaged native registration files are left byte-for-byte untouched by publish", () => {
        const damaged = {
            invalidStandalone: nativeText(REGISTRATION).replace('standalone="no"', 'standalone="maybe"'),
            unknownPseudo: nativeText(REGISTRATION).replace('standalone="no"', 'standalone="no" extra="1"'),
            duplicateId: nativeText(REGISTRATION.replace('sourceId="source-b"', 'sourceId="source-a"')),
            duplicateKey: nativeText(REGISTRATION.replace('serverKey="bravo"', 'serverKey="alpha"')),
            invalidId: nativeText(REGISTRATION.replace('sourceId="source-b"', 'sourceId="../b"')),
            invalidKey: nativeText(REGISTRATION.replace('serverKey="bravo"', 'serverKey="br avo"')),
            invalidSlot: nativeText(REGISTRATION.replace('remoteSlot="savegame5"', 'remoteSlot="save/5"')),
            tooMany: nativeText([
                '<farmDashboardReplicaSources revision="3">',
                ...Array.from({ length: replicaRegistration.MAX_ROWS + 1 }, (_, i) => `<source sourceId="s${i}" remoteSlot="savegame${i}" serverKey="k${i}"/>`),
                "</farmDashboardReplicaSources>",
            ].join("\r\n")),
        };
        const errors = {};
        for (const [name, text] of Object.entries(damaged)) {
            const { profile, dir, file } = profileWith(text);
            const before = fs.readFileSync(file);
            const published = replicaRegistration.publishReplicaRegistration(profile, servers);
            errors[name] = [published.ok, published.error];
            expect(fs.readFileSync(file)).toEqual(before);
            expect(fs.readdirSync(dir).sort()).toEqual(["replicaSources.xml"]);
            errors[`${name}Parse`] = replicaRegistration.parseRegistrationDocument(text).error;
        }
        expect(errors).toEqual({
            invalidStandalone: [false, "damaged"], invalidStandaloneParse: "damaged",
            unknownPseudo: [false, "damaged"], unknownPseudoParse: "damaged",
            duplicateId: [false, "damaged"], duplicateIdParse: "ambiguous-registration",
            duplicateKey: [false, "damaged"], duplicateKeyParse: "ambiguous-registration",
            invalidId: [false, "damaged"], invalidIdParse: "invalid-registration",
            invalidKey: [false, "damaged"], invalidKeyParse: "invalid-registration",
            invalidSlot: [false, "damaged"], invalidSlotParse: "invalid-registration",
            tooMany: [false, "damaged"], tooManyParse: "too-many",
        });
    });

    test("snapshot validation of the servers list is unchanged", () => {
        const { profile } = profileWith(null);
        expect(replicaRegistration.publishReplicaRegistration(profile, [servers[0], { id: "source-c", replicaRegistration: { remoteSlot: "savegame7", sessionPairing: "alpha" } }])).toEqual({ ok: false, error: "ambiguous-registration" });
        expect(replicaRegistration.publishReplicaRegistration(profile, [{ id: "..", replicaRegistration: { remoteSlot: "savegame3", sessionPairing: "alpha" } }])).toEqual({ ok: false, error: "invalid-registration" });
    });
});
