const fs = require("fs");
const path = require("path");
const {
  parseFillTypeNamesFromXml,
  parseFillTypeRecordsFromXml,
  parseFillTypeL10n,
  resolveFillTypeTitle,
  buildFillTypeIndexCatalog,
  fillCatalogGaps,
  getVanillaFillTypeCatalog,
  loadFillTypeNamesFromZip,
  loadFillTypeBundleFromZip,
  pickActiveMapFillTypeNames,
  resolveMapFillTypeCatalog,
  zipHintsFromMapIdentity,
  zipPathFromOverviewHit,
} = require("../mapFillTypes.cjs");
const { fillTypeNameAliases } = require("../fillTypeHud.cjs");

describe("mapFillTypes catalog", () => {
  test("parseFillTypeNamesFromXml reads name attributes in order", () => {
    const xml = `
      <map>
        <fillTypes>
          <fillType name="WHEAT" title="Wheat" />
          <fillType name="barley" />
          <fillType name="DRYGRASS_WINDROW" />
        </fillTypes>
      </map>`;
    expect(parseFillTypeNamesFromXml(xml)).toEqual(["WHEAT", "BARLEY", "DRYGRASS_WINDROW"]);
  });

  test("parseFillTypeRecordsFromXml reads title and hud overlay", () => {
    const xml = `
      <fillTypes>
        <fillType name="SOYBEAN2" title="$l10n_fillType_soybean2" showOnPriceTable="true">
          <image hud="multifruit/huds/hud_fill_soybean2.dds" />
        </fillType>
        <fillType name="MAIZE2" title="$l10n_fillType_maize2">
          <image hud="multifruit/huds/hud_fill_maize2.dds" />
        </fillType>
      </fillTypes>`;
    const recs = parseFillTypeRecordsFromXml(xml);
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({
      name: "SOYBEAN2",
      titleRaw: "$l10n_fillType_soybean2",
      hud: "multifruit/huds/hud_fill_soybean2.dds",
    });
  });

  test("parseFillTypeL10n reads map text nodes and giants e tags", () => {
    expect(parseFillTypeL10n('<text name="fillType_soybean2" text="American Soybean" />').fillType_soybean2).toBe(
      "American Soybean"
    );
    expect(parseFillTypeL10n('<e k="fillType_maize" v="Maize"/>').fillType_maize).toBe("Maize");
  });

  test("resolveFillTypeTitle uses l10n for $l10n_ keys", () => {
    expect(
      resolveFillTypeTitle("$l10n_fillType_soybean2", [{ fillType_soybean2: "American Soybean" }])
    ).toBe("American Soybean");
    expect(resolveFillTypeTitle("Dry Corn", [])).toBe("Dry Corn");
  });

  test("fillTypeNameAliases strips map variants", () => {
    expect(fillTypeNameAliases("SOYBEAN2")).toEqual(expect.arrayContaining(["SOYBEAN2", "SOYBEAN", "SOYBEANS"]));
    expect(fillTypeNameAliases("MAIZE2")).toEqual(expect.arrayContaining(["MAIZE2", "MAIZE", "CORN"]));
  });

  test("buildFillTypeIndexCatalog assigns UNKNOWN then vanilla then map extras", () => {
    const { catalog, nameToIndex } = buildFillTypeIndexCatalog(
      ["WHEAT", "BARLEY", "SORGHUM"],
      ["WHEAT", "LINSEED", "POPPY"]
    );
    expect(catalog["1"]).toBe("UNKNOWN");
    expect(catalog["2"]).toBe("WHEAT");
    expect(catalog["3"]).toBe("BARLEY");
    expect(catalog["4"]).toBe("SORGHUM");
    expect(catalog["5"]).toBe("LINSEED");
    expect(catalog["6"]).toBe("POPPY");
    expect(nameToIndex.LINSEED).toBe(5);
    expect(nameToIndex.WHEAT).toBe(2);
  });

  test("Montana extras are not applied to another map's indices", () => {
    expect(pickActiveMapFillTypeNames(["LINSEED"], ["RABBITMEAT"], false)).toEqual(["LINSEED"]);
    expect(pickActiveMapFillTypeNames(["LINSEED"], ["RABBITMEAT", "GOOSE"], true)).toEqual(["LINSEED"]);
    expect(pickActiveMapFillTypeNames([], ["RABBITMEAT"], true)).toEqual(["RABBITMEAT"]);
  });

  test("fillCatalogGaps does not overwrite named lua entries", () => {
    const merged = fillCatalogGaps(
      { 6: "CUSTOM_CROP", 30: "" },
      { 6: "SORGHUM", 30: "DRYGRASS_WINDROW", 190: "LINSEED" }
    );
    expect(merged["6"]).toBe("CUSTOM_CROP");
    expect(merged["30"]).toBe("DRYGRASS_WINDROW");
    expect(merged["190"]).toBe("LINSEED");
  });

  test("vanilla game XML maps sorghum and hay when the install is present", () => {
    const catalog = getVanillaFillTypeCatalog();
    if (Object.keys(catalog).length <= 1) return;
    expect(catalog["6"]).toBe("SORGHUM");
    expect(catalog["28"]).toBe("GRASS_WINDROW");
    expect(catalog["30"]).toBe("DRYGRASS_WINDROW");
  });
});

describe("mapFillTypes zip maps", () => {
  const modsRoot = path.join(
    process.env.USERPROFILE || "",
    "Documents",
    "My Games",
    "FarmingSimulator2025",
    "mods"
  );

  test("Witcombe maps_fillTypes.xml places LINSEED at 190", async () => {
    const zipPath = path.join(modsRoot, "FS25_Witcombe.zip");
    if (!fs.existsSync(zipPath)) return;
    const names = await loadFillTypeNamesFromZip(zipPath);
    const vanilla = Object.values(getVanillaFillTypeCatalog()).filter((n) => n !== "UNKNOWN");
    const { catalog } = buildFillTypeIndexCatalog(vanilla, names);
    expect(catalog["190"]).toBe("LINSEED");
    expect(catalog["182"]).toBe("TRITICALE");
    expect(catalog["6"]).toBe("SORGHUM");
  }, 30000);

  test("Montana Multifruit zip parses a large fill-type list", async () => {
    const mf = path.join(modsRoot, "FS25_Montana_MF.zip");
    const fourX = path.join(modsRoot, "FS25_Montana_4X.zip");
    const zipPath = fs.existsSync(mf) ? mf : fs.existsSync(fourX) ? fourX : null;
    if (!zipPath) return;
    const names = await loadFillTypeNamesFromZip(zipPath);
    expect(names.length).toBeGreaterThan(176);
    const vanilla = Object.values(getVanillaFillTypeCatalog()).filter((n) => n !== "UNKNOWN");
    const { catalog } = buildFillTypeIndexCatalog(vanilla, names);
    expect(catalog["2"]).toBe("WHEAT");
    expect(Object.keys(catalog).length).toBeGreaterThan(200);
  }, 30000);

  test("resolveMapFillTypeCatalog uses the active map identity", async () => {
    const witcombe = path.join(modsRoot, "FS25_Witcombe.zip");
    if (!fs.existsSync(witcombe)) return;
    const result = await resolveMapFillTypeCatalog({
      mapId: "FS25_Witcombe.SampleModMap",
      mapTitle: "Witcombe Park Farm",
      modsRoot,
      modsRoots: [modsRoot],
    });
    expect(result.catalog["190"]).toBe("LINSEED");
    expect(result.catalog["190"]).not.toBe("RABBITMEAT");
    expect(result.montanaActive).toBe(false);
    expect(result.montanaCount).toBe(0);
    expect(result.titlesByName.SOYBEAN2).toBeUndefined();
    expect(result.hudByName.SOYBEAN2).toBeUndefined();
  }, 60000);

  test("modSettings overview files are not treated as fill-type zip sources", () => {
    expect(
      zipPathFromOverviewHit({
        sourceKind: "file",
        sourceOrigin: "modSettings",
        sourcePath: "C:/modSettings/overview.dds",
      })
    ).toBeNull();
    expect(
      zipPathFromOverviewHit({
        sourceKind: "zip",
        zipHit: { zipPath: "C:/mods/FS25_Montana_MF.zip" },
      })
    ).toBe("C:/mods/FS25_Montana_MF.zip");
    expect(zipHintsFromMapIdentity("FS25_Montana_4X.MapMontana", "Montana Map 4x")).toEqual(
      expect.arrayContaining(["montana_4x", "montana"])
    );
  });

  test("Montana Multifruit identity uses the Montana fill-type list", async () => {
    const mf = path.join(modsRoot, "FS25_Montana_MF.zip");
    if (!fs.existsSync(mf)) return;
    const result = await resolveMapFillTypeCatalog({
      mapId: "FS25_Montana_MF.MapMontana",
      mapTitle: "Montana Map, Multifruit 4x",
      modsRoot,
      modsRoots: [modsRoot],
    });
    expect(result.montanaActive).toBe(true);
    expect(result.montanaCount).toBeGreaterThan(176);
    expect(result.catalog["178"]).toBe("ANHYDROUS");
    expect(result.catalog["190"]).toBe("RABBITMEAT");
    expect(result.catalog["6"]).toBe("SORGHUM");
    expect(result.titlesByName.SOYBEAN2).toBe("American Soybean");
    expect(result.titlesByName.MAIZE2).toBe("Dry Corn");
    expect(result.hudByName.SOYBEAN2).toMatchObject({ kind: "zip" });
  }, 60000);

  test("Montana 4X identity still uses the Multifruit zip when that is installed", async () => {
    const mf = path.join(modsRoot, "FS25_Montana_MF.zip");
    if (!fs.existsSync(mf)) return;
    const result = await resolveMapFillTypeCatalog({
      mapId: "FS25_Montana_4X.MapMontana",
      mapTitle: "Montana Map 4x",
      modsRoot,
      modsRoots: [modsRoot],
    });
    expect(result.montanaActive).toBe(true);
    expect(result.catalog["178"]).toBe("ANHYDROUS");
    expect(Object.keys(result.catalog).length).toBeGreaterThan(200);
  }, 60000);
});
