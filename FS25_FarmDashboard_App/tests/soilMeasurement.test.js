const { mergeFields, buildFieldLiveFingerprints } = require("../dataMerger");

describe("soil sample absence", () => {
    test("an unread Lua sample stays null instead of the XML placeholder zero", () => {
        const merged = mergeFields(
            [{ id: 3, farmlandId: 3, nitrogenLevel: 0, targetNitrogen: 0, phValue: 0, targetPh: 0 }],
            [{
                id: 3,
                farmlandId: 3,
                isPrecisionFarming: true,
                nitrogenLevel: null,
                targetNitrogen: 120,
                phValue: null,
                targetPh: 6.5,
            }],
        );
        expect(merged[0].nitrogenLevel).toBeNull();
        expect(merged[0].targetNitrogen).toBe(120);
        expect(merged[0].phValue).toBeNull();
        expect(merged[0].targetPh).toBe(6.5);
    });

    test("a measured nitrogen of zero stays zero", () => {
        const merged = mergeFields(
            [{ id: 4, farmlandId: 4, nitrogenLevel: 0, targetNitrogen: 0 }],
            [{ id: 4, farmlandId: 4, nitrogenLevel: 0, targetNitrogen: 80 }],
        );
        expect(merged[0].nitrogenLevel).toBe(0);
        expect(merged[0].targetNitrogen).toBe(80);
    });

    test("two fields on one farmland do not share a soil sample", () => {
        const merged = mergeFields(
            [
                { id: 1, farmlandId: 9, nitrogenLevel: null },
                { id: 2, farmlandId: 9, nitrogenLevel: null },
            ],
            [
                { id: 1, farmlandId: 9, nitrogenLevel: 40, soilSampledAt: 1000 },
                { id: 2, farmlandId: 9, nitrogenLevel: null, targetNitrogen: 80, soilSampledAt: 1000 },
            ],
        );
        const first = merged.find((row) => row.id === 1);
        const second = merged.find((row) => row.id === 2);
        expect(first.nitrogenLevel).toBe(40);
        expect(second.nitrogenLevel).toBeNull();
        expect(second.targetNitrogen).toBe(80);
        expect(first.soilSampledAt).toBe(1000);
    });

    test("a newer export time does not replace an older soil sample time", () => {
        const merged = mergeFields(
            [{ id: 6, farmlandId: 6, nitrogenLevel: null, soilSampledAt: 1000 }],
            [{ id: 6, farmlandId: 6, nitrogenLevel: 10, soilSampledAt: 1000 }],
        );
        expect(merged[0].soilSampledAt).toBe(1000);
        expect(merged[0].nitrogenLevel).toBe(10);
    });

    test("the live fingerprint does not turn a missing sample into zero", () => {
        const prints = buildFieldLiveFingerprints([
            { farmlandId: 5, nitrogenLevel: null, targetNitrogen: 90, phValue: 0 },
        ]);
        expect(prints[5].nitrogenLevel).toBeNull();
        expect(prints[5].targetNitrogen).toBe(90);
        expect(prints[5].phValue).toBe(0);
    });
});
