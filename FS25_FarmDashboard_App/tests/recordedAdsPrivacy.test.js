/** @jest-environment jsdom */
"use strict";

const { productionTs } = require("./helpers/production-source.cjs");
const demo = productionTs("NEW APP/src/platform/demo-source.ts");

test("recorded vehicle keeps ADS readings but omits player inspection notes", () => {
    const projected = demo.publicPayload({
        dataSource: "recorded-demo",
        activeFarmId: 1,
        vehicles: [{
            id: 12,
            name: "Tractor",
            ownerFarmId: 1,
            ads: {
                enabled: true,
                condition: 0.72,
                serviceLevel: 0.64,
                inspectionNotes: "C:/Users/private/farm notes",
            },
        }],
    });
    expect(projected.ok).toBe(true);
    expect(projected.payload.vehicles[0].ads).toMatchObject({ enabled: true, condition: 0.72, serviceLevel: 0.64 });
    expect(JSON.stringify(projected.payload)).not.toContain("inspectionNotes");
    expect(JSON.stringify(projected.payload)).not.toContain("private");
});
