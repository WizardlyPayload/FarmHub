/** @jest-environment jsdom */
"use strict";

const { productionTs } = require("./helpers/production-source.cjs");
const demo = productionTs("NEW APP/src/platform/demo-source.ts");

function candidate(id, groundType) {
    return {
        id,
        demoId: "base",
        capturedAt: "2026-10-26T00:00:00.000Z",
        gameDate: "2030-06",
        mapTitle: "Recorded demo map",
        limitations: [],
        section: "fields",
        exportGeneration: 1,
        payload: {
            dataSource: "recorded-demo",
            activeFarmId: 1,
            fields: [{ id: 1, fieldId: 1, ownerFarmId: 1, name: "Field 1", hectares: 4.2, groundType }],
        },
    };
}

test("recorded demo accepts native numeric ground type and retains path screening for text", () => {
    const native = demo.publishDemoGeneration(demo.emptyDemoLibrary(), candidate("ground-enum", 7));
    expect(native.ok).toBe(true);
    expect(native.library.generations["ground-enum"].payload.fields[0].groundType).toBe(7);

    const privateLabel = demo.publishDemoGeneration(demo.emptyDemoLibrary(), candidate("ground-private", "C:/Users/private/save"));
    expect(privateLabel.ok).toBe(false);
    expect(privateLabel.error).toBe("private-or-invalid-text");
});
