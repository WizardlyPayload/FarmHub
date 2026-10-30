"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("../../NEW APP/node_modules/typescript");

const file = path.resolve(__dirname, "../../NEW APP/src/lib/companionMods/catalog.ts");
const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(js, { module: moduleRef, exports: moduleRef.exports });
const { COMPANION_CATALOG, companionSupport } = moduleRef.exports;
process.stdout.write(JSON.stringify(COMPANION_CATALOG.map((entry) => ({
  ...entry,
  support: companionSupport(entry),
})), null, 2));
