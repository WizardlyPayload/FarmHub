import test from "node:test";
import assert from "node:assert/strict";
import { buildCropRotationTableHTML } from "../web/assests/js/modules/redTape.js";

test("buildCropRotationTableHTML renders harvest history rows oldest to newest", () => {
  const html = buildCropRotationTableHTML([
    {
      farmlandId: 12,
      crops: ["Barley", "Wheat", "Canola", "", "Oats"],
    },
  ]);
  assert.match(html, /Barley/);
  assert.match(html, /Oats/);
  assert.match(html, /<td>Canola<\/td>/);
});

test("buildCropRotationTableHTML shows empty message when no rows", () => {
  const html = buildCropRotationTableHTML([]);
  assert.match(html, /redtape\.noCropRotation/);
});
