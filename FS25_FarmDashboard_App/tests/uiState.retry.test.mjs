import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindUiStateRetry } from "../web/assests/js/modules/uiState.js";

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeRetryButton() {
  const listeners = [];
  return {
    dataset: {},
    addEventListener(type, fn) {
      listeners.push({ type, fn });
    },
    click() {
      for (const { type, fn } of listeners) {
        if (type === "click") fn({ preventDefault() {} });
      }
    },
  };
}

function makeRoot(buttons) {
  return {
    querySelectorAll(sel) {
      assert.equal(sel, ".fd-uistate-retry");
      return buttons;
    },
  };
}

test("bindUiStateRetry invokes onRetry when .fd-uistate-retry is clicked", () => {
  const clicks = [];
  const btn = makeRetryButton();
  bindUiStateRetry(makeRoot([btn]), () => clicks.push("retry"));
  btn.click();
  assert.deepEqual(clicks, ["retry"]);
});

test("bindUiStateRetry does not double-bind the same button", () => {
  const clicks = [];
  const btn = makeRetryButton();
  const root = makeRoot([btn]);
  bindUiStateRetry(root, () => clicks.push("first"));
  bindUiStateRetry(root, () => clicks.push("second"));
  btn.click();
  assert.deepEqual(clicks, ["first"]);
});

test("bindUiStateRetry is a no-op without a root or callback", () => {
  assert.equal(bindUiStateRetry(null, () => {}), undefined);
  assert.equal(bindUiStateRetry(makeRoot([]), null), undefined);
});

test("showFieldsApiError binds retry to a fresh /api/fields fetch", () => {
  const fieldsSrc = fs.readFileSync(
    path.join(appRoot, "web/assests/js/modules/fields.js"),
    "utf8"
  );
  assert.match(fieldsSrc, /function showFieldsApiError\(/);
  assert.match(fieldsSrc, /showRetry:\s*true/);
  assert.match(
    fieldsSrc,
    /bindUiStateRetry\(\s*el,\s*\(\)\s*=>\s*\{[\s\S]*lastFieldsPayloadKey\s*=\s*null[\s\S]*loadFieldsData\(\)/
  );
});
