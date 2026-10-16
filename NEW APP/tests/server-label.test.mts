import assert from "node:assert/strict";
import {
  formatServerLabel,
  formatUniqueServerLabels,
  isSaveSlotId,
  stripSaveSlotSuffix,
} from "../src/lib/server-label.ts";

assert.equal(isSaveSlotId("savegame18"), true);
assert.equal(isSaveSlotId("Demo Montana - RF + companions"), false);
assert.equal(
  stripSaveSlotSuffix("Demo Montana - PF + companions — Montana Map (savegame18)"),
  "Demo Montana - PF + companions — Montana Map",
);

assert.equal(
  formatServerLabel({
    savegameName: "Demo Montana - RF + companions",
    mapTitle: "Montana Map, Multifruit 4x",
  }),
  "Demo Montana - RF + companions — Montana Map, Multifruit 4x",
);

// Bug class: lua put saveSlot into savegameName — must not win over career/config name.
assert.equal(
  formatServerLabel({
    name: "Demo Montana - RF + companions — Montana Map, Multifruit 4x (savegame19)",
    savegameName: "savegame19",
    mapTitle: "Montana Map, Multifruit 4x",
    localSubFolder: "savegame19",
  }),
  "Demo Montana - RF + companions — Montana Map, Multifruit 4x",
);

assert.equal(
  formatServerLabel({
    savegameName: "savegame18",
    mapTitle: "Montana Map, Multifruit 4x",
    localSubFolder: "savegame18",
  }),
  "Montana Map, Multifruit 4x (savegame18)",
);

assert.equal(
  formatServerLabel({
    savegameName: "Demo Riverbend - Base",
    mapTitle: "Riverbend Springs",
  }),
  "Demo Riverbend - Base — Riverbend Springs",
);

assert.equal(formatServerLabel({ name: "My Farm" }), "My Farm");

assert.deepEqual(
  formatUniqueServerLabels([
    { id: "srv_old", name: "Witcombe Park Farm", localSubFolder: "savegame6" },
    { id: "mp_live", name: "Witcombe Park Farm", localSubFolder: "savegame1" },
    { id: "unique", name: "Riverbend", localSubFolder: "savegame2" },
  ]),
  ["Witcombe Park Farm — savegame6", "Witcombe Park Farm — savegame1", "Riverbend"],
);
assert.deepEqual(
  formatUniqueServerLabels([
    { id: "source_a", name: "Witcombe", localSubFolder: "savegame1" },
    { id: "source_b", name: "Witcombe", localSubFolder: "savegame1" },
  ]),
  ["Witcombe — savegame1 (source_a)", "Witcombe — savegame1 (source_b)"],
);

console.log("server-label ok");
