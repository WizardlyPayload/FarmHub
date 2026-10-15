"use strict";

const { productionTs } = require("./helpers/production-source.cjs");

const profile = productionTs("NEW APP/src/lib/profile-display.ts", {
    "@/i18n/i18n": { t: (key) => key },
});
const units = productionTs("NEW APP/src/lib/fill-units.ts");
const rf = productionTs("NEW APP/src/lib/realisticFarming/economy/index.ts", {
    "@/i18n/i18n": { t: (key) => key },
    "@/lib/profile-display": profile,
});

const gbp = { effective: { money: 3 } };
const unknown = { effective: { money: 99 } };
const suffix = { effective: { money: 16 } };

describe("visible unit prices", () => {
    test("keeps a converted diesel price visible to four places", () => {
        expect(profile.formatProfileUnitPrice(100 * 3.78541 / 1000, gbp)).toBe("£0.3785");
        expect(profile.formatProfileUnitPrice(1000 * 3.78541 / 1000, gbp)).toBe("£3.7854");
        expect(profile.formatProfileMoney(Math.round(3785.41 * 100 / 1000), gbp)).toBe("£379");
    });

    test("shows a tiny positive price instead of zero and keeps a real zero", () => {
        expect(profile.formatProfileUnitPrice(0.00001, gbp)).toBe("£<0.0001");
        expect(profile.formatProfileUnitPrice(0, gbp)).toBe("£0.00");
    });

    test("labels an unknown live currency without calling it dollars", () => {
        expect(profile.formatProfileMoney(1500, unknown)).toBe("1,500 profile.unitUnavailable");
        expect(rf.formatRfDieselPrice(1.25, unknown)).toBe("1.2500 profile.unitUnavailable/L");
        expect(rf.formatRfDieselPrice(1.25, null)).toBe("1.2500/L");
        expect(rf.formatRfDieselPrice(1.25, suffix)).toBe("1.2500 грн/L");
    });

    test("changes the fill basis with the price", () => {
        const money = (amount) => profile.formatProfileUnitPrice(amount, gbp);
        const priced = units.formatFillPrice(100, "DIESEL", "imperial", null, money, null);
        expect(priced).toBe("£0.3785 / US gal");
        const litres = units.formatFillPrice(100, "DIESEL", "litres", null, money, null);
        expect(litres).toBe("£100.00");
    });
});
