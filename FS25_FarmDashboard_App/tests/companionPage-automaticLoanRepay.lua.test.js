"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "AutomaticLoanRepayCollector.lua";

function setup(extra = "") {
    return `
        _G.g_modIsLoaded = { FS25_AutomaticLoanRepay = true }
        local function farm(t)
            function t:getLoan() return self.loan end
            return t
        end
        _G.g_farmManager = { farms = {
            farm({ farmId = 1, money = 67000, loan = 30000 }),
            farm({ farmId = 2, money = 28000, loan = 100000 }),
            farm({ farmId = 3, money = 900000, loan = 0 }),
        } }
        _G.g_currentMission = { environment = { currentHour = 22 } }
        _G.FS25_AutomaticLoanRepay = {
            AutomaticLoanRepay = {
                LOAN_STEP = 5000, DEFAULT_MINIMUM_BALANCE = 25000, DEFAULT_REPAYMENT_HOUR = 3,
                minimumBalanceValues = { 10000, 25000, 50000 },
            },
            g_automaticLoanRepay = { minimumBalance = 25000, repaymentHour = 3, pendingRunKey = "4", lastRunKey = "3", periodChangeCounter = 4 },
        }
        ${extra}
    `;
}

describe("companion page: Automatic Loan Repay (Lua)", () => {
    test("not detected -> no page", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("settings, armed run and projected repayment per farm (mod formula)", () => {
        const page = runCompanionPage(FILE, setup(), { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.settings).toMatchObject({ minimumBalance: 25000, repaymentHour: 3, loanStep: 5000, minimumBalanceOptions: [10000, 25000, 50000] });
        expect(page.schedule).toEqual({ runArmed: true, currentHour: 22, hoursUntilRun: 5, periodChanges: 4 });
        // 67000 - 25000 = 42000 spare -> 40000, capped at the 30000 loan
        expect(page.byFarm["1"]).toMatchObject({ nextRepayment: 30000, loanAfter: 0, balanceAfter: 37000, spareAboveMinimum: 42000 });
        // 3000 spare is below one 5000 step
        expect(page.byFarm["2"]).toMatchObject({ nextRepayment: 0, loanAfter: 100000, shortOfStep: 2000 });
        expect(page.byFarm["3"]).toMatchObject({ nextRepayment: 0, loan: 0 });
        expect(page.byFarm["3"].shortOfStep).toBeUndefined();
    });

    test("run already done this period -> not armed", () => {
        const page = runCompanionPage(FILE, setup(`FS25_AutomaticLoanRepay.g_automaticLoanRepay.lastRunKey = "4"`), { farmId: 1 });
        expect(page.schedule.runArmed).toBe(false);
        expect(page.schedule.hoursUntilRun).toBeUndefined();
    });

    test("manager missing -> detection-only", () => {
        const page = runCompanionPage(FILE, setup("FS25_AutomaticLoanRepay.g_automaticLoanRepay = nil"), { farmId: 1 });
        expect(page.readState).toBe("detection-only");
    });
});
