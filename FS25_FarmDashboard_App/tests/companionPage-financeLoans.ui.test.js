/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");

function payload(key, page, version = "1.0.0.0") {
    return {
        companionMods: { mods: [{ id: key, detected: true, version }] },
        companionPages: page === null ? { pages: {} } : { pages: { [key]: { key, detected: true, ...page } } },
    };
}

const text = (host, sel) => (host.querySelector(sel) || { textContent: "" }).textContent;

afterEach(() => {
    document.body.innerHTML = "";
});

describe("enhancedLoanSystem page", () => {
    test("shows debt, monthly payment, open loans, collateral and bank settings", () => {
        const ui = loadCompanionPage("enhancedLoanSystem");
        const host = ui.renderPage(payload("enhancedLoanSystem", {
            readState: "ok",
            settings: { loanInterest: 3.5, dynamicInterest: false, minInterest: 1, maxInterest: 10, maxDurationYears: 30,
                vehicleMortgage: 0.5, farmlandMortgage: 0.8, specialRedemptionShare: 0.05, multipleSpecialRedemptions: false },
            byFarm: { "1": {
                money: 50000, loanCount: 1, debt: 100000, borrowed: 120000, monthlyAnnuity: 1202.41, monthlyInterest: 291.67,
                monthlyRepayment: 910.74, remainingCost: 115000, remainingInterest: 15000, vehicleValue: 200000, farmlandValue: 300000,
                vehicleCollateral: 100000, farmlandCollateral: 240000, borrowingCapacity: 190000, paidOffCount: 1, paidOffTotal: 20000,
                loans: [{ amount: 120000, restAmount: 100000, interest: 3.5, durationYears: 10, restMonths: 100, monthlyAnnuity: 1202.41,
                    monthlyInterest: 291.67, monthlyRepayment: 910.74, remainingInterest: 15000, specialRedemptionDone: false }],
                paidOff: [{ amount: 20000, interest: 4, durationYears: 5 }],
            } },
        }), { farmId: 1 });
        expect(text(host, '[data-stat="debt"]')).toContain("100,000");
        expect(text(host, '[data-stat="debt"]')).toContain("1 open loans");
        expect(text(host, '[data-stat="monthly"]')).toContain("1,202");
        expect(text(host, '[data-stat="capacity"]')).toContain("190,000");
        const loanRow = host.querySelector('[data-row="0"]');
        expect(loanRow.textContent).toContain("3.50%");
        expect(loanRow.textContent).toContain("8 y 4 mo");
        expect(text(host, '[data-kv="vehicleCollateral"]')).toContain("Counts as collateral (50%)");
        expect(text(host, '[data-kv="maxDuration"]')).toContain("30 years");
        expect(text(host, '[data-row="paid-0"]')).toContain("20,000");
    });

    test("detected but no reading yet shows the waiting notice and no numbers", () => {
        const ui = loadCompanionPage("enhancedLoanSystem");
        const host = ui.renderPage(payload("enhancedLoanSystem", null), { farmId: 1 });
        expect(host.querySelector(".fd-mod-page__notice.is-waiting")).not.toBeNull();
        expect(host.querySelector('[data-stat="debt"]')).toBeNull();
        expect(host.textContent).toContain("Loans appear once the mod's loan list is readable.");
    });
});

describe("iNeedALoan page", () => {
    test("shows balance warning, credit headroom, popup toggles and hooks", () => {
        const ui = loadCompanionPage("iNeedALoan");
        const host = ui.renderPage(payload("iNeedALoan", {
            readState: "ok", bankInterestRate: 0.04,
            settings: { lowBalanceBuffer: false, loanStep: 5000, bufferAmount: 5000, lowBalanceThreshold: 10000 },
            popups: [{ key: "shopBuy", title: "Popup Vehicle Purchase", enabled: true }, { key: "farmland", title: "Popup Farmland Purchase", enabled: false }],
            hooks: { shop: true, construction: true, farmland: false },
            pendingRequests: 0,
            byFarm: { "1": { balance: 8000, loan: 200000, dailyInterest: 22, loanMax: 500000, headroom: 300000, headroomSteps: 60, lowBalance: true } },
        }), { farmId: 1 });
        expect(host.querySelector('[data-stat="balance"]').className).toContain("is-warn");
        expect(text(host, '[data-stat="balance"]')).toContain("Below the 10,000 warning level");
        expect(text(host, '[data-stat="headroom"]')).toContain("60 steps of 5,000");
        expect(text(host, '[data-stat="rate"]')).toContain("4.0%");
        expect(host.textContent).toContain("200,000 of 500,000 borrowed");
        expect(host.querySelector('[data-row="farmland"]').className).toContain("is-warn");
        expect(text(host, '[data-kv="farmland"]')).toContain("No");
        expect(text(host, '[data-kv="shop"]')).toContain("Yes");
    });
});

describe("automaticLoanRepay page", () => {
    test("shows the projected repayment and the kept-back cash", () => {
        const ui = loadCompanionPage("automaticLoanRepay");
        const host = ui.renderPage(payload("automaticLoanRepay", {
            readState: "ok",
            settings: { minimumBalance: 25000, repaymentHour: 3, loanStep: 5000, defaultMinimumBalance: 25000, defaultRepaymentHour: 3,
                minimumBalanceOptions: [10000, 25000] },
            schedule: { runArmed: true, currentHour: 22, hoursUntilRun: 5, periodChanges: 4 },
            byFarm: { "1": { balance: 67000, loan: 30000, dailyInterest: 3, nextRepayment: 30000, loanAfter: 0, balanceAfter: 37000, spareAboveMinimum: 42000 } },
        }), { farmId: 1 });
        expect(text(host, '[data-stat="next"]')).toContain("30,000");
        expect(text(host, '[data-stat="next"]')).toContain("At 03:00");
        expect(text(host, '[data-stat="loanAfter"]')).toContain("Balance afterwards 37,000");
        expect(text(host, '[data-kv="until"]')).toContain("5 h");
        expect(host.textContent).toContain("Kept-back choices: 10,000, 25,000");
    });

    test("explains when cash is short of one repayment step", () => {
        const ui = loadCompanionPage("automaticLoanRepay");
        const host = ui.renderPage(payload("automaticLoanRepay", {
            readState: "ok",
            settings: { minimumBalance: 25000, repaymentHour: 3, loanStep: 5000 },
            schedule: { runArmed: false },
            byFarm: { "1": { balance: 28000, loan: 100000, nextRepayment: 0, loanAfter: 100000, shortOfStep: 2000 } },
        }), { farmId: 1 });
        expect(text(host, '[data-stat="next"]')).toContain("Already ran this month");
        expect(host.textContent).toContain("2,000 more cash is needed");
    });
});
