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

describe("realisticFarmFinanceLoans credit facilities", () => {
    test("shows selected-farm facility utilisation without presenting it as loan principal", () => {
        const ui = loadCompanionPage("realisticFarmFinanceLoans");
        const host = ui.renderPage(payload("realisticFarmFinanceLoans", {
            readState: "ok", coverage: "complete",
            rows: [], assetRows: [], tenancyRows: [],
            facilityRows: [
                { farmId: 1, id: 19, kind: "REVOLVING", creditLimit: 12000, used: 8000, available: 4000, overLimit: 0, arrears: 0 },
                { farmId: 2, id: 20, kind: "OVERDRAFT", creditLimit: 999999, used: 900000, available: 99999, arrears: 0 },
            ],
            byFarm: { "1": { loanCount: 0, arrearsCount: 0, otherProductCount: 0, facilityCount: 1,
                assetRegisterAvailable: true, assetFinanceCount: 0, assetArrearsCount: 0,
                tenancyRegisterAvailable: true, tenancyCount: 0, tenancyArrearsCount: 0 } },
        }, "1.2.0.0"), { farmId: 1 });
        expect(text(host, '[data-stat="facilities"]')).toContain("1");
        expect(text(host, '[data-row="19"]')).toContain("8,000");
        expect(text(host, '[data-row="19"]')).toContain("4,000");
        expect(host.textContent).toContain("Overdraft usage is the current bank-account debit");
        expect(host.textContent).not.toContain("999,999");
        expect(host.textContent).not.toContain("No current supported obligation");
    });
});

describe("realisticFarmFinanceLoans insurance", () => {
    test("separates due premiums, approved claims and paid money for the selected farm", () => {
        const ui = loadCompanionPage("realisticFarmFinanceLoans");
        const host = ui.renderPage(payload("realisticFarmFinanceLoans", {
            readState: "ok", coverage: "complete",
            rows: [], facilityRows: [], assetRows: [], tenancyRows: [],
            insurancePolicyRows: [
                { farmId: 1, id: 51, vehicle: "MF 8570", cover: "COMPREHENSIVE", status: "ACTIVE", endPeriod: 25, premiumDue: 120.13, autoRenew: true },
                { farmId: 2, id: 52, vehicle: "Other farm", cover: "FULL", status: "ACTIVE", premiumDue: 900000 },
            ],
            insuranceClaimRows: [
                { farmId: 1, id: 61, subject: "MF 8570", status: "APPROVED", amountClaimed: 1000, approvedAmount: 800, paidAmount: 0 },
                { farmId: 2, id: 62, subject: "Other farm", status: "PAID", amountClaimed: 900000, approvedAmount: 900000, paidAmount: 900000 },
            ],
            openAnimalLossRows: [
                { farmId: 1, id: 81, animal: "Daisy", animalType: "COW", reason: "ILLNESS", periodsLeft: 1 },
                { farmId: 2, id: 82, animal: "Other farm", reason: "UNKNOWN", periodsLeft: 1 },
            ],
            eligibleVeterinaryExpenseRows: [
                { farmId: 1, id: 91, animal: "Daisy", diseases: "Mastitis", treatmentCost: 250.13, periodsLeft: 2 },
                { farmId: 2, id: 92, animal: "Other farm", diseases: "Unknown", treatmentCost: 900000, periodsLeft: 1 },
            ],
            byFarm: { "1": { loanCount: 0, arrearsCount: 0, otherProductCount: 0, facilityCount: 0,
                assetRegisterAvailable: true, assetFinanceCount: 0, assetArrearsCount: 0,
                tenancyRegisterAvailable: true, tenancyCount: 0, tenancyArrearsCount: 0,
                insurancePolicyRegisterAvailable: true, insurancePolicyCount: 1, insurancePremiumDueCount: 1,
                insuranceClaimRegisterAvailable: true, insuranceClaimCount: 1,
                animalLossRegisterComplete: true, openAnimalLossCount: 1,
                veterinaryExpenseRegisterComplete: true, eligibleVeterinaryExpenseCount: 1 } },
        }, "1.2.0.0"), { farmId: 1 });
        expect(text(host, '[data-stat="insurancePolicies"]')).toContain("1");
        expect(text(host, '[data-stat="insuranceClaims"]')).toContain("1");
        expect(host.textContent).toContain("Premium due");
        expect(text(host, '[data-row="policy-51"]')).toContain("120");
        expect(host.textContent).toContain("Claimed");
        expect(host.textContent).toContain("Approved");
        expect(host.textContent).toContain("Paid");
        expect(host.textContent).toContain("800");
        expect(host.textContent).not.toContain("900,000");
        expect(text(host, '[data-stat="openAnimalLosses"]')).toContain("1");
        expect(text(host, '[data-row="loss-81"]')).toContain("Daisy");
        expect(text(host, '[data-row="loss-81"]')).toContain("1");
        expect(host.textContent).not.toContain("Other farm");
        expect(host.textContent).toContain("does not guarantee approval or payment");
        expect(text(host, '[data-stat="veterinaryExpenses"]')).toContain("1");
        expect(text(host, '[data-row="vet-91"]')).toContain("Mastitis");
        expect(text(host, '[data-row="vet-91"]')).toContain("250");
        expect(host.textContent).toContain("not an approved or paid claim");
        expect(host.textContent).not.toContain("No supported farm finance record");
    });
});

describe("realisticFarmFinanceLoans applications", () => {
    test("shows a live offer separately from current debt and hides another farm's application", () => {
        const ui = loadCompanionPage("realisticFarmFinanceLoans");
        const host = ui.renderPage(payload("realisticFarmFinanceLoans", {
            readState: "ok", coverage: "complete",
            rows: [], facilityRows: [], assetRows: [], tenancyRows: [], insurancePolicyRows: [], insuranceClaimRows: [],
            applicationRows: [
                { farmId: 1, id: 71, product: "TERM", status: "OFFERED", requestedAmount: 12000, offeredAmount: 10000, offerHoursLeft: 4 },
                { farmId: 2, id: 73, product: "TERM", status: "OFFERED", requestedAmount: 900000, offeredAmount: 900000, offerHoursLeft: 1 },
            ],
            byFarm: { "1": { loanCount: 0, arrearsCount: 0, otherProductCount: 0, facilityCount: 0,
                assetRegisterAvailable: true, assetFinanceCount: 0, assetArrearsCount: 0,
                tenancyRegisterAvailable: true, tenancyCount: 0, tenancyArrearsCount: 0,
                applicationRegisterAvailable: true, applicationCount: 1, applicationOfferCount: 1,
                insurancePolicyRegisterAvailable: true, insurancePolicyCount: 0, insurancePremiumDueCount: 0,
                insuranceClaimRegisterAvailable: true, insuranceClaimCount: 0 } },
        }, "1.2.0.0"), { farmId: 1 });
        expect(text(host, '[data-stat="applications"]')).toContain("1");
        expect(text(host, '[data-stat="offers"]')).toContain("1");
        expect(text(host, '[data-row="application-71"]')).toContain("12,000");
        expect(text(host, '[data-row="application-71"]')).toContain("10,000");
        expect(text(host, '[data-row="application-71"]')).toContain("4");
        expect(host.textContent).not.toContain("900,000");
        expect(host.textContent).toContain("not a paid advance");
    });
});
