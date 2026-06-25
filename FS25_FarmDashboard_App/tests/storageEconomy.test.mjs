import test from "node:test";
import assert from "node:assert/strict";
import { enrichStockItem } from "../web/assests/js/modules/storage.js";

test("enrichStockItem resolves TRITICALE by fillTypeIndex from merged economy", () => {
  const economy = {
    fillTypeCatalog: { 182: "TRITICALE" },
    marketPrices: {
      crops: {
        TRITICALE: {
          fillTypeIndex: 182,
          avgXmlPrice: 233,
          maxPrice: 268,
          maxPriceMonth: "Dec",
          priceHistory: { EARLY_WINTER: 268, LATE_WINTER: 233 },
          locations: [{ name: "Market Base Prices", price: 233 }],
          bestLocation: "Market Base Prices",
        },
      },
    },
  };
  const item = enrichStockItem(
    {
      fillType: "",
      fillTypeIndex: 182,
      totalLiters: 8206,
      bestSellPrice: 0,
      bestSellStation: "Market",
      locations: [],
    },
    {},
    economy,
    economy.fillTypeCatalog
  );
  assert.equal(item.fillType, "TRITICALE");
  assert.equal(item._pricePer1000, 233);
  assert.equal(item._maxPrice, 268);
  assert.equal(item._maxPriceMonth, "Dec");
  assert.equal(item.bestSellStation, "Market Base Prices");
});

test("enrichStockItem maps hay aliases to DRYGRASS economy rows", () => {
  const economy = {
    marketPrices: {
      crops: {
        DRYGRASS: {
          avgXmlPrice: 142,
          maxPrice: 180,
          maxPriceMonth: "Jul",
          locations: [{ name: "Market Base Prices", price: 142 }],
          bestLocation: "Market Base Prices",
        },
      },
    },
  };
  const item = enrichStockItem(
    {
      fillType: "HAY",
      fillTypeIndex: 30,
      totalLiters: 5000,
      locations: [],
    },
    {},
    economy,
    {}
  );
  assert.equal(item._pricePer1000, 142);
  assert.equal(item._maxPriceMonth, "Jul");
});

test("enrichStockItem resolves sparse catalog indices from economy sell points", () => {
  const economy = {
    marketPrices: {
      crops: {
        HONEY: { fillTypeIndex: 45, avgXmlPrice: 2000 },
      },
      sellPoints: {
        market: {
          prices: {
            WATER: { fillTypeIndex: 118, price: 100 },
          },
        },
      },
    },
  };
  const honey = enrichStockItem(
    { fillType: "", fillTypeIndex: 45, totalLiters: 6, locations: [] },
    {},
    economy,
    {}
  );
  assert.equal(honey.fillType, "HONEY");

  const water = enrichStockItem(
    { fillType: "", fillTypeIndex: 118, totalLiters: 6821, locations: [] },
    {},
    economy,
    {}
  );
  assert.equal(water.fillType, "WATER");
});
