#!/usr/bin/env node
// Syntax-check all mod Lua files in Lua 5.1 mode (GIANTS engine has no goto, //, bitwise ops).
// Run from FS25_FarmDashboard_App (needs luaparse): node ../tools/check-lua-syntax.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../FS25_FarmDashboard_App/package.json"
  )
);
const luaparse = require("luaparse");

const modSrc = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../FS25_FarmDashboard_Mod/src"
);

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.lua$/i.test(e.name)) out.push(p);
  }
  return out;
}

let failed = 0;
const files = walk(modSrc);
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  try {
    luaparse.parse(src, { luaVersion: "5.1" });
    console.log(`OK    ${path.relative(modSrc, f)}`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${path.relative(modSrc, f)}: ${e.message}`);
  }
}
console.log(`\n${files.length - failed}/${files.length} files parse as Lua 5.1`);
process.exit(failed > 0 ? 1 : 0);
