"use strict";

const { runCompanionLua } = require("./helpers/companion-page-lua.cjs");

function snapshot({ farms = [1], selected = 0, agreements = "{}", provider = true, moisture = false } = {}) {
    const farmRows = farms.map((id) => `{ id = ${id}, isPlayer = true }`).join(", ");
    const setup = `
        _G.g_modIsLoaded = { FS25_FieldLeasing = true, FS25_MoistureSystem = ${moisture} }
        _G.g_currentMission = {
            getFarmId = function() return ${selected} end,
            MoistureSystem = { currentMoisturePercent = 0.2, objectInfo = {} },
        }
        _G.FS25_FieldLeasing = ${provider ? `{ g_fieldLeasingManager = {
            priceMultiplier = 1.5, minDuration = 6, fieldLeaseAgreements = ${agreements}
        } }` : "{}"}
        _G.FS25_MoistureSystem = {
            MoistureSystem = g_currentMission.MoistureSystem,
            CropValueMap = { getQualityGrade = function() return 1 end },
        }
        local farms = { ${farmRows} }
        _G.FarmDashboardDataCollector = {
            _companionFarmScopeReady = true,
            _companionExportFarmId = CompanionModsDataCollector.helpers.resolveExportFarmId(farms),
        }
    `;
    return runCompanionLua(["FieldLeasingCollector.lua"], setup, `
        local shared = CompanionModsDataCollector:collect()
        local page = CompanionPages.collectEntry(CompanionPages.entries.fieldLeasing, 1)
        return __fdEncode({
            resolved = FarmDashboardDataCollector._companionExportFarmId,
            shared = shared.fieldLeases,
            page = page,
            moisture = shared.moistureSystem,
        })
    `);
}

describe("frozen gameplay farm scope for companion leases", () => {
    const twoLeases = `{
        [12] = { farmlandId = 12, farmId = 1, price = 120000, duration = 8 },
        [40] = { farmlandId = 40, farmId = 2, price = 90000, duration = 1 },
    }`;

    test("positive mission selection must match a snapshot player farm", () => {
        const out = snapshot({ farms: [1, 2], selected: 2, agreements: twoLeases });
        expect(out.resolved).toBe(2);
        expect(out.shared.farmId).toBe(2);
        expect(out.shared.leases).toEqual([{ farmlandId: 40, price: 90000, duration: 1 }]);
        expect(out.page.byFarm["2"].leaseCount).toBe(1);
        expect(out.page.byFarm["1"]).toBeUndefined();
        expect(out.page.leases.map((row) => row.farmlandId)).toEqual([40]);
    });

    test("sole player farm with zero leases is empty after a complete read", () => {
        const out = snapshot({ farms: [2], agreements: "{}" });
        expect(out.resolved).toBe(2);
        expect(out.shared).toMatchObject({ farmId: 2, readState: "empty", coverage: "complete" });
        expect(Object.keys(out.shared.leases)).toHaveLength(0);
        expect(out.page).toMatchObject({ readState: "ok", coverage: "complete" });
        expect(Object.keys(out.page.leases)).toHaveLength(0);
        expect(out.page.byFarm["2"].leaseCount).toBe(0);
    });

    test("sole player farm with leases is selected when mission has no selection", () => {
        const out = snapshot({ farms: [1], agreements: twoLeases });
        expect(out.resolved).toBe(1);
        expect(out.shared.readState).toBe("ok");
        expect(out.shared.leases.map((row) => row.farmlandId)).toEqual([12]);
        expect(out.page.readState).toBe("ok");
        expect(out.page.leases.map((row) => row.farmlandId)).toEqual([12]);
        expect(out.page.otherFarmLeases).toBeUndefined();
        expect(JSON.stringify(out.page)).not.toContain("90000");
    });

    test.each([0, 15])("two player farms and mission ID %i disclose no farm leases", (selected) => {
        const out = snapshot({ farms: [1, 2], selected, agreements: twoLeases, moisture: true });
        expect(out.resolved).toBeUndefined();
        expect(out.shared).toMatchObject({ readState: "unavailable", reason: "no-farm" });
        expect(out.shared.leases).toBeUndefined();
        expect(out.page).toMatchObject({ readState: "settings-only", reason: "no-farm" });
        expect(out.page.leases).toBeUndefined();
        expect(out.moisture.storedGoods).toMatchObject({ readState: "unavailable", reason: "no-farm" });
    });

    test("missing lease provider remains unavailable for both paths", () => {
        const out = snapshot({ farms: [1], provider: false });
        expect(out.shared.readState).toBe("unavailable");
        expect(out.page).toMatchObject({ readState: "unavailable", reason: "provider-unavailable" });
        expect(out.page.leases).toBeUndefined();
    });

    test("an incomplete scan with no matching leases is not empty", () => {
        const agreements = `(function()
            local list = {}
            for i = 1, 401 do list[i] = { farmlandId = i, farmId = 2, price = i } end
            return list
        end)()`;
        const out = snapshot({ farms: [1], agreements });
        expect(out.shared).toMatchObject({ readState: "partial", coverage: "truncated" });
        expect(Object.keys(out.shared.leases)).toHaveLength(0);
        expect(out.page).toMatchObject({ readState: "partial", coverage: "truncated" });
        expect(Object.keys(out.page.leases)).toHaveLength(0);
    });

    test("Moisture stored goods uses the same sole-farm resolution", () => {
        const out = snapshot({ farms: [2], agreements: "{}", moisture: true });
        expect(out.resolved).toBe(2);
        expect(out.moisture.storedGoods.farmId).toBe(2);
        expect(out.moisture.storedGoods.reason).not.toBe("no-farm");
    });
});
