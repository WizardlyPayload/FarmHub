"use strict";

const { mergeFields } = require("../dataMerger");

test("live cultivated ground and empty crop replace stale XML meadow", () => {
  const [field] = mergeFields(
    [{ id: 42, farmlandId: 42, groundType: "NONE", stateName: "Meadow", fruitType: "MEADOW", fruitTypeIndex: 25, growthState: 4 }],
    [{ id: 42, farmlandId: 42, groundType: 3, groundTypeName: "CULTIVATED", stateName: "Cultivated", fruitType: "empty", fruitTypeIndex: 0, growthState: 0, harvestReady: false }],
  );
  expect(field).toMatchObject({
    groundType: "CULTIVATED",
    groundTypeName: "CULTIVATED",
    stateName: "Cultivated",
    fruitType: "empty",
    fruitTypeIndex: 0,
    growthState: 0,
  });
});

test("a standing live crop is retained even if the ground name is prepared", () => {
  const [field] = mergeFields(
    [{ id: 7, farmlandId: 7, groundType: "SOWN", fruitType: "WHEAT", fruitTypeIndex: 8, growthState: 3 }],
    [{ id: 7, farmlandId: 7, groundType: 3, groundTypeName: "CULTIVATED", fruitType: "WHEAT", fruitTypeIndex: 8, growthState: 3 }],
  );
  expect(field.fruitType).toBe("WHEAT");
  expect(field.growthState).toBe(3);
});

test("Realistic Weather menu ID and parcel charge survive a live field/XML merge", () => {
  const xml = [{ id: 2, farmlandId: 2, ownerFarmId: 1, name: "Field 2" }];
  const live = [{
    id: 29,
    farmlandId: 2,
    ownerFarmId: 1,
    name: "Field 2",
    realisticWeatherIrrigationMenu: { active: true, fieldId: 2 },
    realisticWeatherIrrigation: { active: true, parcelId: 2, pendingNextDay: 4.82 },
  }];
  const [on] = mergeFields(xml, live);
  expect(on.realisticWeatherIrrigationMenu).toEqual({ active: true, fieldId: 2 });
  expect(on.realisticWeatherIrrigation).toEqual({ active: true, parcelId: 2, pendingNextDay: 4.82 });

  const [off] = mergeFields(xml, [{ ...live[0], realisticWeatherIrrigationMenu: null,
    realisticWeatherIrrigation: { active: false, parcelId: 2, pendingNextDay: 28.85 } }]);
  expect(off.realisticWeatherIrrigationMenu).toBeNull();
  expect(off.realisticWeatherIrrigation).toEqual({ active: false, parcelId: 2, pendingNextDay: 28.85 });
});
