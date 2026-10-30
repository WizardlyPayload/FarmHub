"use strict";

const { parseCareerSavegame, parsePlaceablesXml } = require("../xmlCollector");
const { mergeData } = require("../dataMerger");

const placeablesXml = `<?xml version="1.0"?>
<placeables>
  <placeable uniqueId="preplaced_bakery_9110d7de511c929e2cf101b72b5310af" farmId="1">
    <productionPoint>
      <production id="bananaCake" isEnabled="true"/>
      <production id="bread" isEnabled="false"/>
      <storage farmId="1"><node fillType="BANANABOX" fillLevel="125.5"/></storage>
    </productionPoint>
  </placeable>
  <placeable uniqueId="preplaced_others_9110d7de511c929e2cf101b72b5310af" farmId="0">
    <productionPoint><production id="other" isEnabled="true"/></productionPoint>
  </placeable>
</placeables>`;

test("nested FS25 career settings retain the player save and DLC map names", () => {
  const parsed = parseCareerSavegame(`<?xml version="1.0"?>
    <careerSavegame><settings><savegameName>My game save</savegameName>
    <mapId>pdlc_beansAndAlpacasPack.beansAndAlpacasMap</mapId>
    <mapTitle>Catuaí</mapTitle><saveDate>2026-10-28</saveDate>
    </settings></careerSavegame>`);
  expect(parsed).toMatchObject({
    savegameName: "My game save",
    mapTitle: "Catuaí",
    mapId: "pdlc_beansAndAlpacasPack.beansAndAlpacasMap",
    saveDate: "2026-10-28",
  });
});

test("saved production sites remain visible when live export has no completed production collector", () => {
  const placeables = parsePlaceablesXml(placeablesXml);
  const xml = { placeables, career: { mapTitle: "Catuaí" } };
  const fromXml = mergeData(null, xml);
  const fromIncompleteExport = mergeData({ production: {}, fields: [] }, xml);
  for (const merged of [fromXml, fromIncompleteExport]) {
    expect(merged.production.source).toBe("savegame_xml");
    expect(merged.production.chains).toHaveLength(1);
    expect(merged.production.chains[0]).toMatchObject({
      ownerFarmId: 1,
      source: "savegame_xml",
      storageFillLevels: { BANANABOX: 125.5 },
      productions: [{ name: "banana Cake", isActive: true }, { name: "bread", isActive: false }],
    });
  }
  const live = { chains: [{ id: "live", ownerFarmId: 1 }] };
  expect(mergeData({ production: live, fields: [] }, xml).production).toBe(live);
});
