"use strict";

const { parseFieldsXml } = require("../xmlCollector");

describe("production field XML soil placeholders", () => {
    test("nested fields do not turn vanilla lime or missing PF samples into measured nitrogen", () => {
        const xml = `<?xml version="1.0" encoding="utf-8"?>
<fields>
  <fieldStates>
    <field id="7" fruitType="WHEAT" growthState="4" limeLevel="0" sprayLevel="1"/>
    <field id="8" fruitType="BARLEY" growthState="2" limeLevel="1" sprayLevel="0"/>
  </fieldStates>
</fields>`;
        const rows = parseFieldsXml(xml, null, null, null, null);
        expect(rows.map((row) => row.id)).toEqual([7, 8]);
        expect(rows[0].nitrogenLevel).toBeNull();
        expect(rows[0].phValue).toBeNull();
        expect(rows[0].targetNitrogen).toBeNull();
        expect(rows[0].limeLevel).toBe(0);
        expect(rows[0].fertilizationLevel).toBe(1);
        expect(rows[0].suggestions.some((item) => item.action === "Spread lime")).toBe(true);
        expect(rows[0].suggestions.some((item) => String(item.action).includes("pH"))).toBe(false);
        expect(rows[1].nitrogenLevel).toBeNull();
        expect(rows[1].fertilizationLevel).toBe(0);
    });
});
