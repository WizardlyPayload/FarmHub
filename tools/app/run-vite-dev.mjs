#!/usr/bin/env node
/**
 * Start NEW APP Vite dev server with FarmDash API proxy target set.
 *
 *   node tools/app/run-vite-dev.mjs            → proxy :8766 (installed release / website demo)
 *   node tools/app/run-vite-dev.mjs --isolated → proxy :8767 (npm run dev:api or dev:new-ui)
 *
 * Prefer :8767 when testing NEW merge/UI features. :8766 is the shipping classic backend.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const newAppDir = path.join(__dirname, "..", "..", "NEW APP");
const isolated = process.argv.includes("--isolated");

if (!process.env.VITE_FARMDASH_API?.trim()) {
    process.env.VITE_FARMDASH_API = isolated ? "127.0.0.1:8767" : "127.0.0.1:8766";
}

const target = process.env.VITE_FARMDASH_API;

function probeApi(hostPort) {
    return new Promise((resolve) => {
        const req = http.get(`http://${hostPort}/api/servers`, { timeout: 2000 }, (res) => {
            res.resume();
            resolve(res.statusCode != null && res.statusCode < 500);
        });
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
            req.destroy();
            resolve(false);
        });
    });
}

const ok = await probeApi(target);
console.log("");
console.log("[FarmDash] NEW APP Vite dev");
console.log(`           UI:       http://127.0.0.1:5173/`);
console.log(`           API proxy → ${target}`);
if (isolated) {
    console.log("           Mode:     repo API on :8767 (npm run dev:api / dev:new-ui)");
    console.log("           Use this when testing NEW features (invoices, mileage, merge fixes).");
} else {
    console.log("           Mode:     installed release API on :8766 (website/demo)");
    console.log("           Classic backend only — new merge/UI features need: npm run dev:ui:isolated + npm run dev:api");
    console.log("           Or one Electron with NEW UI: npm run dev:new-ui → http://127.0.0.1:8767/");
}
if (!ok) {
    console.log("");
    if (isolated) {
        console.log("           ⚠  Nothing on " + target + " — start another terminal:");
        console.log("              npm run dev:api   or   npm run dev:new-ui");
    } else {
        console.log("           ⚠  Nothing on " + target + " — start the installed Farm Dashboard first");
        console.log("              (website demo on http://127.0.0.1:8766/)");
        console.log("           For NEW UI + repo backend: npm run dev:new-ui");
        console.log("           Or: npm run dev:ui:isolated + npm run dev:api");
    }
}
console.log("");

const viteBin = path.join(newAppDir, "node_modules", "vite", "bin", "vite.js");
if (!fs.existsSync(viteBin)) {
    console.error("[FarmDash] Missing Vite. Run: cd \"NEW APP\" && npm install");
    process.exit(1);
}

const child = spawn(process.execPath, [viteBin], {
    cwd: newAppDir,
    env: process.env,
    stdio: "inherit",
});

child.on("exit", (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 0);
});
