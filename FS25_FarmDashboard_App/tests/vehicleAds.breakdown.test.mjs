import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {
  fetch: async () => ({ ok: false, json: async () => ({}) }),
  location: { pathname: "/" },
};

const {
  getAdsBreakdownParts,
  countActiveAdsBreakdowns,
  buildAdsVehiclePanelHtml,
} = await import("../web/assests/js/modules/vehicleAds.js");

test("falls back to breakdown id list when breakdownParts missing", () => {
  const vehicle = {
    ads: {
      enabled: true,
      breakdownCount: 2,
      breakdowns: ["cvt_chain", "valve_train"],
    },
  };
  const parts = getAdsBreakdownParts(vehicle);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].id, "cvt_chain");
});

test("breakdown panel lists part rows when breakdownParts exported", () => {
  const vehicle = {
    ads: {
      enabled: true,
      condition: 0.72,
      serviceLevel: 0.4,
      breakdownCount: 2,
      breakdownParts: [
        {
          id: "valve_train",
          partKey: "ads_breakdowns_part_valve_train",
          stageSeverityKey: "ads_breakdowns_severity_major",
          stage: 3,
          isActive: true,
          isVisible: true,
          repairPrice: 0,
        },
        {
          id: "cvt_chain",
          partKey: "ads_breakdowns_part_cvt_chain",
          stageSeverityKey: "ads_breakdowns_severity_minor",
          stage: 1,
          isActive: true,
          isVisible: true,
          repairPrice: 1250,
        },
      ],
      inspection: {},
    },
  };
  assert.equal(countActiveAdsBreakdowns(vehicle), 2);
  const html = buildAdsVehiclePanelHtml(vehicle);
  assert.match(html, /ads-breakdown-table/);
  assert.match(html, /valve train|valve_train/i);
  assert.match(html, /cvt chain|cvt_chain/i);
  assert.match(html, /ads-breakdown-table[\s\S]*<th[^>]*>[\s\S]*Stage[\s\S]*<th[^>]*>[\s\S]*Price/);
  assert.match(html, /1,250|1250/);
});
