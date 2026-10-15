"use strict";

const { runCompanionPage, runCompanionPagesCycle } = require("./helpers/companion-page-lua.cjs");

const FILE = "EnhancedLoanSystemCollector.lua";

const LOAN_CLASS = `
    local Loan = {}
    Loan.__index = Loan
    function Loan:calculateAnnuity()
        local q = (1 + self.interest / 100) ^ self.duration
        return self.amount * ((q * (self.interest / 100)) / (q - 1)) / 12
    end
    local function loan(t) return setmetatable(t, Loan) end
`;

function setup(extra = "") {
    return `
        ${LOAN_CLASS}
        _G.g_modIsLoaded = { FS25_EnhancedLoanSystem = true }
        _G.g_farmManager = { getFarms = function() return {
            { farmId = 0, money = 0 },
            { farmId = 1, money = 250000 },
            { farmId = 2, money = 10000 },
        } end }
        _G.g_currentMission = { getMoney = function(_, fid) return fid == 1 and 250000 or 10000 end }
        _G.FS25_EnhancedLoanSystem = {
            ELS_loanManagerProperties = { minLoanInterest = 1.0, maxLoanInterest = 10.0, loanInterestSteps = 0.1 },
            g_els_loanManager = {
                loanManagerProperties = {
                    loanInterest = 3.5, dynamicLoanInterest = true, maxLoanDuration = 20,
                    vehicleMortgagePercentage = 0.5, farmlandMortgagePercentage = 0.6,
                    multipleSpecialRedemptionsAllowed = false, specialRedemptionPercentageForAnnuityLoans = 0.05,
                },
                loans = {
                    [1] = {
                        loan({ farmId = 1, amount = 120000, interest = 3.5, duration = 10, restDuration = 100,
                               restAmount = 100000, paidOff = false, specialRedemptionDone = true }),
                        loan({ farmId = 1, amount = 50000, interest = 4.0, duration = 5, restDuration = 0,
                               restAmount = 0, paidOff = true }),
                    },
                },
                calculateVehicleAmount = function(_, fid) return fid == 1 and 400000 or 0 end,
                calculateFarmlandAmount = function(_, fid) return fid == 1 and 300000 or 0 end,
            },
        }
        ${extra}
    `;
}

describe("companion page: Enhanced Loan System (Lua)", () => {
    test("not detected -> no page", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("reads bank settings, open loans, schedule and borrowing capacity per farm", () => {
        const page = runCompanionPage(FILE, setup(), { farmId: 1 });
        expect(page).toMatchObject({ key: "enhancedLoanSystem", detected: true, readState: "ok", modName: "FS25_EnhancedLoanSystem" });
        expect(page.settings).toMatchObject({
            loanInterest: 3.5, dynamicInterest: true, minInterest: 1, maxInterest: 10, maxDurationYears: 20,
            vehicleMortgage: 0.5, farmlandMortgage: 0.6, multipleSpecialRedemptions: false, specialRedemptionShare: 0.05,
        });
        const farm1 = page.byFarm["1"];
        expect(farm1.loanCount).toBe(1);
        expect(farm1.debt).toBe(100000);
        expect(farm1.paidOffCount).toBe(1);
        expect(farm1.paidOffTotal).toBe(50000);
        const loan = farm1.loans[0];
        // 120000 * (1.035^10 * 0.035) / (1.035^10 - 1) / 12
        expect(loan.monthlyAnnuity).toBeCloseTo(1202.41, 1);
        expect(loan.monthlyInterest).toBeCloseTo(291.67, 1);
        expect(loan.monthlyRepayment).toBeCloseTo(loan.monthlyAnnuity - loan.monthlyInterest, 1);
        expect(loan.remainingCost).toBeGreaterThan(100000);
        expect(loan.remainingInterest).toBeCloseTo(loan.remainingCost - 100000, 1);
        expect(loan.specialRedemptionDone).toBe(true);
        // money 250k + 400k*0.5 + 300k*0.6 - 2*100k debt
        expect(farm1.borrowingCapacity).toBe(430000);
        expect(farm1.vehicleCollateral).toBe(200000);
        expect(farm1.farmlandCollateral).toBe(180000);
        // A real farm without an ELS record is debt free, not missing; spectator farm 0 is skipped.
        // Empty Lua tables encode as {}; the merge module turns them back into arrays.
        expect(page.byFarm["2"]).toMatchObject({ loanCount: 0, debt: 0 });
        expect(Object.keys(page.byFarm["2"].loans || {})).toHaveLength(0);
        expect(page.byFarm["0"]).toBeUndefined();
    });

    test("manager without loans table -> settings-only", () => {
        const page = runCompanionPage(FILE, setup("FS25_EnhancedLoanSystem.g_els_loanManager.loans = nil"), { farmId: 1 });
        expect(page.readState).toBe("settings-only");
        expect(page.settings.loanInterest).toBe(3.5);
    });

    test("manager missing -> detection-only", () => {
        const page = runCompanionPage(FILE, setup("FS25_EnhancedLoanSystem.g_els_loanManager = nil"), { farmId: 1 });
        expect(page).toMatchObject({ detected: true, readState: "detection-only" });
    });

    test("ModHub folder name is detected and the registry cycle exports the page", () => {
        const payload = runCompanionPagesCycle([FILE], setup(`
            _G.g_modIsLoaded = { FS25_314906_Enhanced_Loan_System = true }
            _G.FS25_314906_Enhanced_Loan_System = FS25_EnhancedLoanSystem
            _G.FS25_EnhancedLoanSystem = nil
        `), { farmId: 1 });
        expect(payload.enabled).toBe(true);
        expect(payload.pages.enhancedLoanSystem.modName).toBe("FS25_314906_Enhanced_Loan_System");
        expect(payload.pages.enhancedLoanSystem.byFarm["1"].debt).toBe(100000);
    });
});
