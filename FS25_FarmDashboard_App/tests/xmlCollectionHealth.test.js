const {
    buildXmlCollectionHealth,
    OPTIONAL_SAVEGAME_XML_FILES,
} = require("../xmlCollector");

describe("xml collection health", () => {
    test("fingerprint includes optional MoistureSystem and RedTape files", () => {
        expect(OPTIONAL_SAVEGAME_XML_FILES).toEqual(
            expect.arrayContaining(["MoistureSystem.xml", "RedTape.xml"])
        );
    });

    test("records duration, lag, and parse errors", () => {
        const now = 1_000_000;
        const out = buildXmlCollectionHealth({
            startedMs: now - 250,
            newestMtimeMs: now - 12_000,
            parseErrors: [{ file: "fields.xml", error: "missing_or_unreadable" }],
            nowMs: now,
        });
        expect(out.collectionDurationMs).toBe(250);
        expect(out.sourceLagSeconds).toBe(12);
        expect(out.parseErrors).toHaveLength(1);
    });
});
