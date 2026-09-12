/** Product rule: Fertilizer Depot dashboard stock prefers hall bins over the 50k shop book. */
function pickDepotStock(hallRows, shopRows) {
  if (Array.isArray(hallRows) && hallRows.length > 0) {
    return { source: "hall", rows: hallRows };
  }
  return { source: "shopBook", rows: shopRows || [] };
}

describe("Fertilizer Depot hall vs shop book", () => {
  test("dumped hall litres win over an empty walk-in book", () => {
    const hall = [{ fillType: "UREA", liters: 12000, capacity: 100000 }];
    const shop = [{ fillType: "UREA", liters: 0, capacity: 50000 }];
    const picked = pickDepotStock(hall, shop);
    expect(picked.source).toBe("hall");
    expect(picked.rows[0].liters).toBe(12000);
    expect(picked.rows[0].capacity).toBe(100000);
  });

  test("shop book is only used when the hall does not answer", () => {
    const shop = [{ fillType: "FERTILIZER", liters: 800, capacity: 50000 }];
    expect(pickDepotStock(null, shop).source).toBe("shopBook");
    expect(pickDepotStock([], shop).source).toBe("shopBook");
  });
});
