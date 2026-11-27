import test from "node:test";
import assert from "node:assert/strict";
globalThis.window = { fetch: async () => ({}), WebSocket: function WebSocket() {} };
const { displayMarketPrices, formatCropName } = await import("../web/assests/js/modules/economy.js");

function renderMarket(marketData) {
  const node = { innerHTML: "" };
  const previousDocument = globalThis.document;
  const previousLog = console.log;
  globalThis.document = { getElementById: (id) => id === "market-prices" ? node : null };
  console.log = () => {};
  try {
    displayMarketPrices.call({ formatCropName }, marketData);
  } finally {
    globalThis.document = previousDocument;
    console.log = previousLog;
  }
  return node.innerHTML;
}

test("classic Economy keeps a base reference apart from a lower real buyer quote", () => {
  const html = renderMarket({
    crops: { WHEAT: {
      avgPrice: 900, locations: [
        { name: "Market Base Prices", price: 1000 },
        { name: "Grain Buyer", price: 800 },
      ],
    } },
    sellPoints: [
      { name: "Market Base Prices", prices: { WHEAT: { price: 1000 } } },
      { name: "Grain Buyer", prices: { WHEAT: { price: 800 } } },
    ],
  });
  assert.match(html, /Grain Buyer/);
  assert.match(html, /Market Base Prices/);
  assert.doesNotMatch(html, /Poor Market!/);
  assert.doesNotMatch(html, /market-location-item[^>]*data-location-name="market base prices"/);
  assert.match(html, /market-location-item[^>]*data-location-name="grain buyer"/);
});

test("classic Economy identifies a reference-only crop without a verified buyer", () => {
  const html = renderMarket({
    crops: { WHEAT: { avgPrice: 1000, locations: [{ name: "Market Base Prices", price: 1000 }] } },
    sellPoints: [{ name: "Market Base Prices", prices: { WHEAT: { price: 1000 } } }],
  });
  assert.match(html, /No selling point available/);
  assert.doesNotMatch(html, /market-location-item/);
});

test("classic location status compares actual buyers, without a base reference or lone-buyer warning", () => {
  const html = renderMarket({
    crops: { WHEAT: { avgPrice: 1333, locations: [
      { name: "Market Base Prices", price: 2000 },
      { name: "Low Buyer", price: 800 },
      { name: "High Buyer", price: 1200 },
    ] } },
    sellPoints: [
      { name: "Market Base Prices", prices: { WHEAT: { price: 2000, multiplier: 1 } } },
      { name: "Low Buyer", prices: { WHEAT: { price: 800, multiplier: 1 } } },
      { name: "High Buyer", prices: { WHEAT: { price: 1200, multiplier: 1 } } },
    ],
  });
  assert.equal((html.match(/bi-arrow-up/g) || []).length, 1);
  assert.equal((html.match(/bi-arrow-down/g) || []).length, 1);

  const lone = renderMarket({
    crops: { WHEAT: { avgPrice: 1400, locations: [
      { name: "Market Base Prices", price: 2000 },
      { name: "Only Buyer", price: 800 },
    ] } },
    sellPoints: [{ name: "Only Buyer", prices: { WHEAT: { price: 800, multiplier: 1 } } }],
  });
  assert.doesNotMatch(lone, /bi-arrow-(up|down)/);
});
