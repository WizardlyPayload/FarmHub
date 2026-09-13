const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  fillTypeNameAliases,
  fillTypeNameFromHudFile,
  candidateBasenames,
  prefetchFillTypeHudCache,
  ensureFillTypeHudPng,
  writeHudPngFromBuffer,
  fileLooksLikePng,
  lookupHudSource,
  extractHudRoots,
  isLikelyHudEntry,
} = require("../fillTypeHud.cjs");

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("fillTypeHud", () => {
  test("fillTypeNameFromHudFile maps overlay filenames to fill-type names", () => {
    expect(fillTypeNameFromHudFile("hud_fill_soybean2.dds")).toBe("SOYBEAN2");
    expect(fillTypeNameFromHudFile("multifruit/huds/hud_fill_maize2.png")).toBe("MAIZE2");
    expect(fillTypeNameFromHudFile("hud_fill_grass_windrow.dds")).toBe("GRASS_WINDROW");
    expect(fillTypeNameFromHudFile("hud_fill_soyBean.dds")).toBe("SOYBEAN");
    expect(fillTypeNameFromHudFile("WHEAT.dds")).toBe("WHEAT");
  });

  test("candidateBasenames keeps underscored HUD names", () => {
    const names = candidateBasenames("GRASS_WINDROW", "");
    expect(names).toEqual(
      expect.arrayContaining(["hud_fill_grass_windrow.dds", "hud_fill_grass_windrow.png"])
    );
  });

  test("candidateBasenames adds camelCase Giants HUD names", () => {
    const names = candidateBasenames("SEED_TREATING_LIQUID", "");
    expect(names).toEqual(expect.arrayContaining(["hud_fill_seedTreatingLiquid.dds"]));
  });

  test("isLikelyHudEntry ignores ground fill-type textures", () => {
    expect(isLikelyHudEntry("map/fillTypes/wheat_diffuse.dds")).toBe(false);
    expect(isLikelyHudEntry("multifruit/huds/hud_fill_maize2.dds")).toBe(true);
  });

  test("fillTypeNameAliases strips map variants", () => {
    expect(fillTypeNameAliases("SOYBEAN2")).toEqual(
      expect.arrayContaining(["SOYBEAN2", "SOYBEAN", "SOYBEANS"])
    );
  });

  test("lookupHudSource tries map-variant aliases", () => {
    const hit = lookupHudSource("SOYBEAN2", {
      SOYBEAN: { kind: "file", path: "hud_fill_soyBean.dds" },
    });
    expect(hit.alias).toBe("SOYBEAN");
    expect(hit.source).toMatchObject({ kind: "file" });
  });

  test("lookupHudSource prefers the exact map overlay when both exist", () => {
    const hit = lookupHudSource("SOYBEAN2", {
      SOYBEAN2: { kind: "zip", zipPath: "FS25_Montana_MF.zip", entry: "hud_fill_soybean2.dds" },
      SOYBEAN: { kind: "file", path: "hud_fill_soyBean.dds" },
    });
    expect(hit.alias).toBe("SOYBEAN2");
    expect(hit.source).toMatchObject({ kind: "zip" });
  });

  test("prefetch copies file HUD sources into the PNG cache", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fd-hud-"));
    const cache = path.join(root, "cache");
    process.env.FARMDASH_FILL_TYPE_HUD_CACHE = cache;
    process.env.FARMDASH_FILL_TYPE_HUD_SKIP_GAME_ROOTS = "1";
    const src = path.join(root, "hud_fill_wheat.png");
    fs.writeFileSync(src, PNG_1x1);
    await prefetchFillTypeHudCache({
      WHEAT: { kind: "file", path: src },
    });
    const dest = path.join(cache, "WHEAT.png");
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.statSync(dest).size).toBeGreaterThan(20);
    const hit = await ensureFillTypeHudPng("WHEAT", {
      WHEAT: { kind: "file", path: src },
    });
    expect(hit).toBe(dest);
  });

  test("fillTypeNameAliases includes compact underscored names", () => {
    expect(fillTypeNameAliases("GRASS_WINDROW")).toEqual(
      expect.arrayContaining(["GRASS_WINDROW", "GRASSWINDROW"])
    );
  });

  test("ensureFillTypeHudPng converts vanilla extract wheat when present", async () => {
    delete process.env.FARMDASH_FILL_TYPE_HUD_SKIP_GAME_ROOTS;
    const roots = extractHudRoots();
    if (!roots.length) return;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fd-hud-extract-"));
    process.env.FARMDASH_FILL_TYPE_HUD_CACHE = root;
    const hit = await ensureFillTypeHudPng("WHEAT", {});
    expect(hit).toBeTruthy();
    expect(fs.existsSync(hit)).toBe(true);
    expect(fs.statSync(hit).size).toBeGreaterThan(1000);
    const magic = Buffer.alloc(8);
    const fd = fs.openSync(hit, "r");
    fs.readSync(fd, magic, 0, 8, 0);
    fs.closeSync(fd);
    expect(magic[0]).toBe(0x89);
    expect(magic[1]).toBe(0x50);
  }, 30000);

  test("fillTypeNameAliases maps dried crops onto the base fill type", () => {
    expect(fillTypeNameAliases("BARLEY_DRY")).toEqual(
      expect.arrayContaining(["BARLEY_DRY", "BARLEY"])
    );
    expect(fillTypeNameAliases("CORN_DRY")).toEqual(
      expect.arrayContaining(["CORN_DRY", "CORN", "MAIZE"])
    );
  });

  test("ensureFillTypeHudPng converts DDS bytes even when the source is named .png", async () => {
    delete process.env.FARMDASH_FILL_TYPE_HUD_SKIP_GAME_ROOTS;
    const roots = extractHudRoots();
    if (!roots.length) return;
    const wheatDds = path.join(roots[0], "hud_fill_wheat.dds");
    if (!fs.existsSync(wheatDds)) return;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fd-hud-dds-png-"));
    const cache = path.join(root, "cache");
    process.env.FARMDASH_FILL_TYPE_HUD_CACHE = cache;
    process.env.FARMDASH_FILL_TYPE_HUD_SKIP_GAME_ROOTS = "1";
    const fakePng = path.join(root, "hud_fill_custom.png");
    fs.copyFileSync(wheatDds, fakePng);
    const hit = await ensureFillTypeHudPng("CUSTOM", {
      CUSTOM: { kind: "file", path: fakePng },
    });
    expect(hit).toBeTruthy();
    const magic = Buffer.alloc(4);
    const fd = fs.openSync(hit, "r");
    fs.readSync(fd, magic, 0, 4, 0);
    fs.closeSync(fd);
    expect(magic.toString("ascii")).not.toBe("DDS ");
    expect(magic[0]).toBe(0x89);
    expect(magic[1]).toBe(0x50);
  }, 30000);

  test("writeHudPngFromBuffer commits atomically and leaves a valid PNG", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fd-hud-atomic-"));
    const dest = path.join(root, "WHEAT.png");
    await writeHudPngFromBuffer(PNG_1x1, dest);
    expect(fileLooksLikePng(dest)).toBe(true);
    const leftovers = fs.readdirSync(root).filter((name) => name.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });
});
