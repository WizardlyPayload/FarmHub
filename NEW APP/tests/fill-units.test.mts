import assert from "node:assert/strict";
import {
  effectiveFillUnitMode,
  fillPriceAmount,
  fillUnitsActive,
  formatFillPrice,
  formatFillQuantity,
  formatMixedFood,
  britishLabel,
} from "../src/lib/fill-units.ts";

assert.equal(fillUnitsActive({ british: true }), "british");
assert.equal(fillUnitsActive({}), "litres");
assert.equal(
  fillUnitsActive({
    imperial: { present: true, liquid: "gallons", crops: "liters", weight: "metric" },
  }),
  "imperial",
);
assert.equal(
  fillUnitsActive({
    imperial: { present: true, liquid: "liters", crops: "liters", weight: "metric" },
  }),
  "litres",
);

const british = "british" as const;
assert.equal(britishLabel("CANOLA"), "OSR");
assert.equal(formatFillQuantity(1000, "WHEAT", british, null), "780 kg");
assert.equal(formatFillQuantity(2000, "WHEAT", british, null), "1.56 t");
assert.match(formatFillQuantity(5000, "DIESEL", british, null), /L$/);

const priced = fillPriceAmount(500, "WHEAT", british, null);
assert.ok(Math.abs(priced.amount - 500 / 0.78) < 0.001);

const imperial = {
  present: true,
  liquid: "gallons" as const,
  crops: "imperial" as const,
  weight: "metric" as const,
  weightScale: "auto" as const,
};
const display = { imperial };
assert.match(
  formatFillQuantity(3785.41, "DIESEL", "imperial", null, display),
  /gal$/,
);
assert.match(
  formatFillQuantity(35239.1, "WHEAT", "imperial", null, display),
  /bu$/,
);
assert.match(
  formatFillQuantity(1000, "STRAW", "imperial", null, display),
  /(lbs|US tn)$/,
);

assert.equal(formatMixedFood([{ fill: "STRAW", liters: 10000 }], 10000, british, null), "600 kg");
assert.equal(
  effectiveFillUnitMode({ british: false, imperial: null, mods: [] }, "british"),
  "british",
);
assert.match(formatFillQuantity(3785.41, "DIESEL", "imperial", null, null), /US gal$/);
assert.equal(formatFillQuantity(0, "DIESEL", "imperial", null, null), "0 US gal");
assert.equal(formatFillQuantity(Number.NaN, "DIESEL", "imperial", null, null), "—");
const dieselPrice = fillPriceAmount(1000, "DIESEL", "imperial", null, null);
assert.ok(Math.abs(dieselPrice.amount - 3.78541) < 0.0001);
assert.equal(dieselPrice.unit, "/ US gal");
assert.match(
  formatFillPrice(1000, "DIESEL", "imperial", null, (n) => n.toFixed(2), null),
  /US gal$/,
);
assert.match(formatFillQuantity(1000, "MODDED_WIDGET", "imperial", null, null), /L$/);
assert.equal(
  effectiveFillUnitMode(
    { imperial: { present: true, settingsAvailable: true, ownsFillUnits: true, liquid: "bogus" as "liters" } },
    "british",
  ),
  "british",
);
assert.match(
  formatFillQuantity(1000, "MOD_FILL", "british", { MOD_FILL: { kg: Number.POSITIVE_INFINITY, liquid: false } }, null),
  /^1[.,\u00a0\u202f]?000 L$/,
);
console.log("fill-units ok");
