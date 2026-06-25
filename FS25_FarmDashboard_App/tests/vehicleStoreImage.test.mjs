// Authoritative store-image matching: the mod exports the FS25 store image basename
// (storeItem.imageFilename -> "store_t7"); the app must resolve it to the shipped PNG
// EXACTLY, with no fuzzy guessing, and fall back gracefully when ambiguous/unknown.
import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {
  fetch: async () => ({ ok: false, json: async () => ({}) }),
  location: { pathname: "/" },
};

const vehicles = await import("../web/assests/js/modules/vehicles.js");

function primeWith(items, modExtract) {
  vehicles.primeShopImageFilenames({ items: items || [], modExtract: modExtract || [] });
}

test("extractStoreLeafToken pulls the store_/icon_ basename token", () => {
  assert.equal(vehicles.extractStoreLeafToken("vehicles__store_t7.png"), "store_t7");
  assert.equal(vehicles.extractStoreLeafToken("handTools__store_ms261.png"), "store_ms261");
  assert.equal(vehicles.extractStoreLeafToken("FS25_44202__store_CL_tipper.png"), "store_cl_tipper");
  assert.equal(vehicles.extractStoreLeafToken("FS25_x__icon_foo.png"), "icon_foo");
  // Nested-zip mod keys contain "__" themselves; the leaf is after the LAST "__".
  assert.equal(
    vehicles.extractStoreLeafToken("subfolder__FS25_Mod__store_t7.png"),
    "store_t7"
  );
  // Display-name exports have no store_/icon_ token.
  assert.equal(vehicles.extractStoreLeafToken("FS25_4940__John Deere 4940 Self-Propelled Sprayer.png"), null);
  assert.equal(vehicles.extractStoreLeafToken("notapng.txt"), null);
});

test("unique curated store basename resolves to the exact curated PNG", () => {
  primeWith(["vehicles__store_t7.png", "handTools__store_ms261.png"], []);
  assert.equal(
    vehicles.resolveStoreImageExact("store_t7"),
    "/assests/img/items/vehicles__store_t7.png"
  );
  // Mod exports the basename with the original extension/case — normalize and still match.
  assert.equal(
    vehicles.resolveStoreImageExact("STORE_MS261.dds"),
    "/assests/img/items/handTools__store_ms261.png"
  );
});

test("curated wins over a mod file with the same basename", () => {
  primeWith(["vehicles__store_tipper.png"], ["FS25_Pack__store_tipper.png"]);
  assert.equal(
    vehicles.resolveStoreImageExact("store_tipper"),
    "/assests/img/items/vehicles__store_tipper.png"
  );
});

test("a unique mod-only basename resolves to the mod PNG", () => {
  primeWith([], ["FS25_Cowshed__store_cowshed1970s.png"]);
  assert.equal(
    vehicles.resolveStoreImageExact("store_cowshed1970s"),
    "/assests/img/items_mod_extract/FS25_Cowshed__store_cowshed1970s.png"
  );
});

test("ambiguous basename (2+ curated) returns null so fuzzy matching can decide", () => {
  primeWith(
    ["vehicles__store_tipper.png", "trailers__store_tipper.png"],
    []
  );
  assert.equal(vehicles.resolveStoreImageExact("store_tipper"), null);
});

test("unknown basename and empty hint return null", () => {
  primeWith(["vehicles__store_t7.png"], []);
  assert.equal(vehicles.resolveStoreImageExact("store_doesnotexist"), null);
  assert.equal(vehicles.resolveStoreImageExact(""), null);
  assert.equal(vehicles.resolveStoreImageExact(null), null);
});

test("deriveStoreImageHint maps config XML basename to curated store icon", () => {
  primeWith(["vehicles__store_t7.png"], []);
  assert.equal(
    vehicles.deriveStoreImageHint({ configFileName: "data/vehicles/newHolland/t7.xml" }),
    "store_t7"
  );
});

test("getLocalVehicleImage prefers the authoritative store image over fuzzy name match", () => {
  primeWith(["vehicles__store_t7.png", "vehicles__store_t6.png"], []);
  const ctx = {
    vehicleImageCacheCurated: null,
    vehicleImageCacheCuratedBuilt: false,
    vehicleImageCacheMod: null,
    vehicleImageCacheModBuilt: false,
    findVehicleImageDynamic: vehicles.findVehicleImageDynamic,
  };
  const img = vehicles.getLocalVehicleImage.call(ctx, "T7.260", "New Holland", "tractor", {
    storeImage: "store_t7",
  });
  assert.equal(img, "/assests/img/items/vehicles__store_t7.png");
});
