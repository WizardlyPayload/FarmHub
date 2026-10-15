import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(here, "..", "web", "locales");
const buildScript = path.join(localesDir, "build-translations.mjs");
const catalogPath = path.join(localesDir, "translations.json");
const servedCopy = path.join(here, "..", "..", "NEW APP", "public", "locales", "translations.json");
const CATALOG_LIMIT = 4 * 1024 * 1024;
const LANGS = [
  "en", "de", "fr", "es", "it", "pl", "nl", "pt", "sv", "da", "fi", "cs",
  "el", "hu", "ro", "bg", "hr", "sk", "sl", "et", "lv", "lt", "ga", "mt",
  "is", "nb", "uk",
];
const FIRST_RUN_EN = {
  "setup.toastNoCareerFound": "No Farming Simulator 25 career was found. Save a career in the game with the Farm Dashboard mod enabled, then select Auto-Detect again, or add the save folder below.",
  "setup.toastAwaitingFirstExportOne": "Found {{count}} saved career with no dashboard export yet. Select Launch Dashboard, then load that save in Farming Simulator 25 with the Farm Dashboard mod enabled.",
  "setup.toastAwaitingFirstExportMany": "Found {{count}} saved careers with no dashboard export yet. Select Launch Dashboard, then load one of them in Farming Simulator 25 with the Farm Dashboard mod enabled.",
  "setup.serverAwaitingFirstExport": "Waiting for the first export. Launch the dashboard, then load this save in Farming Simulator 25 with the Farm Dashboard mod enabled.",
};
const placeholders = (s) => [...String(s).matchAll(/\{\{\s*([A-Za-z_]\w*)\s*\}\}/g)].map((m) => m[1]).sort().join(",");

function buildFixture(messages) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catalog108-"));
  try {
    fs.mkdirSync(path.join(dir, "messages"));
    fs.copyFileSync(buildScript, path.join(dir, "build-translations.mjs"));
    for (const [lang, obj] of Object.entries(messages)) {
      fs.writeFileSync(path.join(dir, "messages", `${lang}.json`), JSON.stringify(obj, null, 2) + "\n", "utf8");
    }
    const run = () => {
      execFileSync(process.execPath, [path.join(dir, "build-translations.mjs")], { stdio: "pipe", timeout: 30000 });
      return fs.readFileSync(path.join(dir, "translations.json"));
    };
    return [run(), run(), fs.readdirSync(dir)];
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("build writes deterministic compact JSON and omits locale entries that equal English", () => {
  const messages = {
    en: { "b.count": "{{count}} bales – ready", "a.greet": "Hello {{name}}, {{name}}!", "c.plain": "Straw" },
    de: { "b.count": "{{count}} Ballen – bereit", "a.greet": "Grüß dich {{name}}, {{name}}!", "c.plain": "Straw" },
    uk: { "a.greet": "Привіт, {{name}}, {{name}}! ’✓" },
    el: { "c.plain": "Άχυρο \"σανό\" \\ ok" },
  };
  const [first, second, left] = buildFixture(messages);
  assert.ok(first.equals(second), "repeated builds must be byte-identical");
  assert.deepEqual(left.filter((f) => f.endsWith(".tmp")), [], "no temp files left behind");
  const text = first.toString("utf8");
  const doc = JSON.parse(text);
  assert.equal(text, JSON.stringify(doc), "output must be compact JSON");
  assert.ok(!text.includes("\n"), "no line breaks in the runtime catalog");
  assert.deepEqual(Object.keys(doc.strings), ["b.count", "a.greet", "c.plain"], "key order follows en.json");
  assert.deepEqual(Object.keys(doc.strings["a.greet"]), ["en", "de", "uk"], "locale order is fixed");
  const expected = { version: 1, strings: {} };
  for (const key of Object.keys(messages.en)) {
    const row = {};
    for (const l of LANGS) {
      const v = l === "en" ? messages.en[key] : messages[l]?.[key];
      if (l === "en" || (v != null && v !== messages.en[key])) row[l] = v;
    }
    expected.strings[key] = row;
  }
  assert.deepEqual(doc, expected, "only English plus locale values that differ from English");
  assert.equal(doc.strings["c.plain"].de, undefined, "a locale copy identical to English is not stored");
  assert.equal(doc.strings["a.greet"].uk, "Привіт, {{name}}, {{name}}! ’✓");
  assert.equal(doc.strings["c.plain"].el, "Άχυρο \"σανό\" \\ ok");
  // Runtime rule shared by every reader: row[locale] ?? row.en.
  const resolve = (key, lang) => doc.strings[key][lang] ?? doc.strings[key].en;
  for (const key of Object.keys(messages.en)) {
    for (const l of LANGS) {
      const filled = l === "en" ? messages.en[key] : messages[l]?.[key] ?? messages.en[key];
      assert.equal(resolve(key, l), filled, `${l} ${key} resolves to the same text as a fully filled row`);
    }
  }
});

test("the real runtime catalog is compact, under 4 MiB and carries the first-run keys in every locale", () => {
  const bytes = fs.readFileSync(catalogPath);
  console.log(`translations.json: ${bytes.length} bytes (limit ${CATALOG_LIMIT})`);
  assert.ok(bytes.length < CATALOG_LIMIT, `translations.json is ${bytes.length} bytes`);
  const text = bytes.toString("utf8");
  const doc = JSON.parse(text);
  assert.equal(text, JSON.stringify(doc));
  for (const [key, row] of Object.entries(doc.strings)) {
    assert.equal(typeof row.en, "string", `${key} has no English`);
    for (const lang of Object.keys(row)) {
      assert.ok(LANGS.includes(lang), `${key} unknown locale ${lang}`);
      if (lang !== "en") assert.notEqual(row[lang], row.en, `${lang} ${key} stores an English copy`);
    }
  }
  for (const [key, en] of Object.entries(FIRST_RUN_EN)) {
    const row = doc.strings[key];
    assert.ok(row, `missing ${key}`);
    assert.deepEqual(Object.keys(row), LANGS);
    assert.equal(row.en, en);
    for (const lang of LANGS) {
      assert.equal(typeof row[lang], "string");
      assert.ok(row[lang].trim().length > 0, `${lang} ${key} empty`);
      assert.equal(placeholders(row[lang]), placeholders(en), `${lang} ${key} placeholders`);
      if (lang !== "en") assert.notEqual(row[lang], en, `${lang} ${key} fell back to English`);
    }
  }
  if (fs.existsSync(servedCopy)) {
    assert.ok(fs.readFileSync(servedCopy).equals(bytes), "NEW APP served copy must match the generated catalog");
  }
});
