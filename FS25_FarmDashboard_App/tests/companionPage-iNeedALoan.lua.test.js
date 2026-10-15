"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "INeedALoanCollector.lua";

function setup(extra = "") {
    return `
        _G.g_modIsLoaded = { FS25_INeedALoan = true }
        _G.Farm = { LOAN_INTEREST_RATE = 0.04 }
        local Farm1 = { farmId = 1, money = 8000, loan = 200000, loanMax = 500000 }
        function Farm1:getLoan() return self.loan end
        function Farm1:calculateDailyLoanInterest() return 22 end
        function Farm1:updateMaxLoan() error("must not be called") end
        _G.g_farmManager = { getFarms = function() return { { farmId = 0 }, Farm1, { farmId = 2, money = 90000, loan = 0, loanMax = 500000 } } end }
        _G.g_currentMission = {}
        _G.FS25_INeedALoan = {
            INeedALoanShopLogger = {
                LOAN_STEP = 5000, EXTRA_BUFFER_AMOUNT = 5000, LOW_BALANCE_THRESHOLD = 10000,
                enableLowBalanceBuffer = false,
                hooksInstalled = true, constructionHooksInstalled = true, farmlandHooksInstalled = false,
                pendingLoanRequests = { [3] = {} },
                POPUP_SETTING_DEFINITIONS = {
                    { key = "shopBuy", titleFallback = "Popup Vehicle Purchase" },
                    { key = "farmland", titleFallback = "Popup Farmland Purchase" },
                },
                loanPopupSettings = { shopBuy = true, farmland = false },
            },
        }
        ${extra}
    `;
}

describe("companion page: I Need A Loan (Lua)", () => {
    test("not detected -> no page", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("settings, popup toggles, hook coverage and per-farm loan headroom", () => {
        const page = runCompanionPage(FILE, setup(), { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.bankInterestRate).toBe(0.04);
        expect(page.settings).toEqual({ lowBalanceBuffer: false, loanStep: 5000, bufferAmount: 5000, lowBalanceThreshold: 10000 });
        expect(page.popups).toEqual([
            { key: "shopBuy", title: "Popup Vehicle Purchase", enabled: true },
            { key: "farmland", title: "Popup Farmland Purchase", enabled: false },
        ]);
        expect(page.hooks).toMatchObject({ shop: true, construction: true, farmland: false });
        expect(page.pendingRequests).toBe(1);
        expect(page.byFarm["1"]).toEqual({
            balance: 8000, loan: 200000, dailyInterest: 22, loanMax: 500000, headroom: 300000, headroomSteps: 60, lowBalance: true,
        });
        expect(page.byFarm["2"]).toMatchObject({ balance: 90000, loan: 0, headroom: 500000 });
        expect(page.byFarm["2"].lowBalance).toBeUndefined();
        expect(page.byFarm["0"]).toBeUndefined();
    });

    test("logger missing -> detection-only", () => {
        const page = runCompanionPage(FILE, setup("FS25_INeedALoan.INeedALoanShopLogger = nil"), { farmId: 1 });
        expect(page.readState).toBe("detection-only");
    });
});
