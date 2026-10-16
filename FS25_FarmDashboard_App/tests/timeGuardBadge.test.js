"use strict";

const { productionTs } = require("./helpers/production-source.cjs");
const { formatTimeGuardBadge } = productionTs("NEW APP/src/lib/realisticFarming/cores/index.ts");

describe("FS25 Time Guard calendar label", () => {
    const badge = (period) => formatTimeGuardBadge({
        enabled: true, period, year: 2, dayInPeriod: 1, daysPerPeriod: 1,
    }, "en-GB");

    test("maps the March-based season periods to calendar month names", () => {
        expect(badge(1)).toBe("Y2 · Mar · D1/1");
        expect(badge(7)).toBe("Y2 · Sept · D1/1");
        expect(badge(11)).toBe("Y2 · Jan · D1/1");
        expect(badge(12)).toBe("Y2 · Feb · D1/1");
    });

    test("does not mislabel an invalid period as a month", () => {
        expect(badge(13)).toBe("Y2 · P13 · D1/1");
    });
});
