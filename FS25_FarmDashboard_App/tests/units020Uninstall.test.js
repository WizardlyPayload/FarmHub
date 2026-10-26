"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const helper = path.resolve(__dirname, "../build/uninstall-user-data.ps1");
const shell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

function runCase(dirs, mode, options = {}) {
    const result = spawnSync(shell, [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-File", helper,
        "-Mode", mode,
        "-Edition", "V5",
        ...(options.roamingBase ? ["-RoamingBase", options.roamingBase] : []),
        ...(options.localBase ? ["-LocalBase", options.localBase] : []),
    ], {
        env: {
            ...process.env,
            APPDATA: options.inheritedRoaming || dirs.roaming,
            LOCALAPPDATA: options.inheritedLocal || dirs.local,
            TEMP: dirs.temp,
        },
        encoding: "utf8",
    });
    return result.status;
}

describe("uninstall profile links", () => {
    test("Keep mode rejects a profile-root junction and leaves the outside sentinel", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "farmhub-uninstall-"));
        const roam = path.join(root, "Roaming");
        const profile = path.join(roam, "fs25-farm-dashboard-rf");
        const outside = path.join(root, "ProtectedOutsideProfile");
        fs.mkdirSync(path.join(root, "Local"), { recursive: true });
        fs.mkdirSync(path.join(root, "Temp"), { recursive: true });
        fs.mkdirSync(outside, { recursive: true });
        fs.mkdirSync(roam, { recursive: true });
        const link = spawnSync("cmd.exe", ["/c", "mklink", "/J", profile, outside], { encoding: "utf8" });
        expect(link.status).toBe(0);
        fs.mkdirSync(path.join(profile, "Cache"), { recursive: true });
        fs.writeFileSync(path.join(profile, "Cache", "sentinel.txt"), "keep");
        fs.writeFileSync(path.join(outside, "Cache", "sentinel.txt"), "keep");
        const code = runCase({
            roaming: roam,
            local: path.join(root, "Local"),
            temp: path.join(root, "Temp"),
        }, "Keep");
        expect(code).not.toBe(0);
        expect(fs.existsSync(path.join(outside, "Cache", "sentinel.txt"))).toBe(true);
        fs.rmSync(root, { recursive: true, force: true });
    });

    test("Keep mode rejects a junction above the profile", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "farmhub-uninstall-"));
        const outside = path.join(root, "ProtectedOutsideProfile");
        const roamLink = path.join(root, "RoamingLink");
        fs.mkdirSync(outside, { recursive: true });
        fs.mkdirSync(path.join(root, "Local"), { recursive: true });
        fs.mkdirSync(path.join(root, "Temp"), { recursive: true });
        const link = spawnSync("cmd.exe", ["/c", "mklink", "/J", roamLink, outside], { encoding: "utf8" });
        expect(link.status).toBe(0);
        const profile = path.join(roamLink, "fs25-farm-dashboard-rf");
        fs.mkdirSync(path.join(profile, "Cache"), { recursive: true });
        fs.writeFileSync(path.join(profile, "Cache", "sentinel.txt"), "keep");
        const code = runCase({
            roaming: roamLink,
            local: path.join(root, "Local"),
            temp: path.join(root, "Temp"),
        }, "Keep");
        expect(code).not.toBe(0);
        expect(fs.existsSync(path.join(outside, "fs25-farm-dashboard-rf", "Cache", "sentinel.txt"))).toBe(true);
        fs.rmSync(root, { recursive: true, force: true });
    });

    function disposableRoot() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "farmhub-uninstall-"));
        const roaming = path.join(root, "Farm Hub", "Roaming");
        const local = path.join(root, "Farm Hub", "Local");
        fs.mkdirSync(roaming, { recursive: true });
        fs.mkdirSync(local, { recursive: true });
        fs.mkdirSync(path.join(root, "Temp"), { recursive: true });
        return { root, roaming, local, temp: path.join(root, "Temp") };
    }

    function seedProfiles(dirs) {
        const v5 = path.join(dirs.roaming, "fs25-farm-dashboard-rf");
        const v4 = path.join(dirs.roaming, "fs25-farm-dashboard");
        const saves = path.join(dirs.root, "saves");
        const v5Updater = path.join(dirs.local, "fs25-farm-dashboard-rf-updater");
        const sharedUpdater = path.join(dirs.local, "fs25-farm-dashboard-updater");
        fs.mkdirSync(path.join(v5, "Cache"), { recursive: true });
        fs.mkdirSync(path.join(v5, "serverLiveCache"), { recursive: true });
        fs.mkdirSync(path.join(dirs.local, "fs25-farm-dashboard-rf", "Cache"), { recursive: true });
        fs.mkdirSync(v5Updater, { recursive: true });
        fs.mkdirSync(path.join(sharedUpdater, "pending"), { recursive: true });
        fs.mkdirSync(v4, { recursive: true });
        fs.mkdirSync(saves, { recursive: true });
        fs.writeFileSync(path.join(v5, "config.json"), "{\"keep\":true}");
        fs.writeFileSync(path.join(v5, "serverLiveCache", "snapshot.json"), "{\"snap\":1}");
        fs.writeFileSync(path.join(v5, "Cache", "sentinel.txt"), "drop");
        fs.writeFileSync(path.join(v4, "config.json"), "v4");
        fs.writeFileSync(path.join(saves, "careerSavegame.xml"), "save");
        fs.writeFileSync(path.join(v5Updater, "installer.exe"), "v5 dedicated cache");
        fs.writeFileSync(path.join(sharedUpdater, "installer.exe"), "unknown shared installer");
        fs.writeFileSync(path.join(sharedUpdater, "pending", "FS25-Farm-Dashboard-Setup-4.0.0.exe"), "v4 pending update");
        fs.writeFileSync(path.join(sharedUpdater, "pending", "update-info.json"), '{"fileName":"FS25-Farm-Dashboard-Setup-4.0.0.exe"}');
        return { v5, v4, saves, v5Updater, sharedUpdater };
    }

    test("regular Keep retains config and the offline snapshot", () => {
        const dirs = disposableRoot();
        const seeded = seedProfiles(dirs);
        const code = runCase(dirs, "Keep");
        expect(code).toBe(0);
        expect(fs.readFileSync(path.join(seeded.v5, "config.json"), "utf8")).toBe("{\"keep\":true}");
        expect(fs.readFileSync(path.join(seeded.v5, "serverLiveCache", "snapshot.json"), "utf8")).toBe("{\"snap\":1}");
        expect(fs.existsSync(path.join(seeded.v5, "Cache", "sentinel.txt"))).toBe(false);
        expect(fs.readFileSync(path.join(seeded.v4, "config.json"), "utf8")).toBe("v4");
        expect(fs.readFileSync(path.join(seeded.saves, "careerSavegame.xml"), "utf8")).toBe("save");
        expect(fs.existsSync(seeded.v5Updater)).toBe(false);
        expect(fs.readFileSync(path.join(seeded.sharedUpdater, "installer.exe"), "utf8")).toBe("unknown shared installer");
        expect(fs.readFileSync(path.join(seeded.sharedUpdater, "pending", "FS25-Farm-Dashboard-Setup-4.0.0.exe"), "utf8")).toBe("v4 pending update");
        fs.rmSync(dirs.root, { recursive: true, force: true });
    });

    test("regular Full removes only this edition", () => {
        const dirs = disposableRoot();
        const seeded = seedProfiles(dirs);
        const code = runCase(dirs, "Full");
        expect(code).toBe(0);
        expect(fs.existsSync(seeded.v5)).toBe(false);
        expect(fs.existsSync(path.join(dirs.local, "fs25-farm-dashboard-rf"))).toBe(false);
        expect(fs.readFileSync(path.join(seeded.v4, "config.json"), "utf8")).toBe("v4");
        expect(fs.readFileSync(path.join(seeded.saves, "careerSavegame.xml"), "utf8")).toBe("save");
        expect(fs.existsSync(seeded.v5Updater)).toBe(false);
        expect(fs.readFileSync(path.join(seeded.sharedUpdater, "installer.exe"), "utf8")).toBe("unknown shared installer");
        expect(fs.readFileSync(path.join(seeded.sharedUpdater, "pending", "update-info.json"), "utf8")).toContain("4.0.0");
        fs.rmSync(dirs.root, { recursive: true, force: true });
    });

    test("Full uses explicit shell folders when a packaged parent redirects environment variables", () => {
        const dirs = disposableRoot();
        const seeded = seedProfiles(dirs);
        const virtualRoaming = path.join(dirs.root, "PackagedView", "Roaming");
        const virtualLocal = path.join(dirs.root, "PackagedView", "Local");
        fs.mkdirSync(path.join(virtualRoaming, "fs25-farm-dashboard-rf"), { recursive: true });
        fs.mkdirSync(virtualLocal, { recursive: true });
        const sentinel = path.join(virtualRoaming, "fs25-farm-dashboard-rf", "other.txt");
        fs.writeFileSync(sentinel, "keep");
        const code = runCase(dirs, "Full", {
            inheritedRoaming: virtualRoaming,
            inheritedLocal: virtualLocal,
            roamingBase: dirs.roaming,
            localBase: dirs.local,
        });
        expect(code).toBe(0);
        expect(fs.existsSync(seeded.v5)).toBe(false);
        expect(fs.existsSync(seeded.v5Updater)).toBe(false);
        expect(fs.readFileSync(sentinel, "utf8")).toBe("keep");
        expect(fs.readFileSync(path.join(seeded.v4, "config.json"), "utf8")).toBe("v4");
        fs.rmSync(dirs.root, { recursive: true, force: true });
    });

    test("Keep mode rejects a linked child and leaves the outside sentinel", () => {
        const dirs = disposableRoot();
        const seeded = seedProfiles(dirs);
        const outside = path.join(dirs.root, "ProtectedChild");
        fs.mkdirSync(outside, { recursive: true });
        fs.writeFileSync(path.join(outside, "sentinel.txt"), "keep");
        fs.rmSync(path.join(seeded.v5, "Cache"), { recursive: true, force: true });
        const link = spawnSync("cmd.exe", ["/c", "mklink", "/J", path.join(seeded.v5, "Cache"), outside], { encoding: "utf8" });
        expect(link.status).toBe(0);
        const code = runCase(dirs, "Keep");
        expect(code).not.toBe(0);
        expect(fs.readFileSync(path.join(outside, "sentinel.txt"), "utf8")).toBe("keep");
        expect(fs.readFileSync(path.join(seeded.v5, "config.json"), "utf8")).toBe("{\"keep\":true}");
        expect(fs.readFileSync(path.join(seeded.v5, "serverLiveCache", "snapshot.json"), "utf8")).toBe("{\"snap\":1}");
        fs.rmSync(dirs.root, { recursive: true, force: true });
    });

    test("Full mode fails closed when a profile file stays locked", () => {
        const dirs = disposableRoot();
        const seeded = seedProfiles(dirs);
        const locked = path.join(seeded.v5, "Cache", "sentinel.txt");
        const held = spawnSync(shell, [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy", "RemoteSigned",
            "-Command",
            `$p='${locked.replace(/'/g, "''")}'; $fs=[IO.File]::Open($p,'Open','Read','None'); $env:APPDATA='${dirs.roaming.replace(/'/g, "''")}'; $env:LOCALAPPDATA='${dirs.local.replace(/'/g, "''")}'; $env:TEMP='${dirs.temp.replace(/'/g, "''")}'; & '${helper.replace(/'/g, "''")}' -Mode Full -Edition V5; $code=$LASTEXITCODE; $fs.Dispose(); exit $code`,
        ], { encoding: "utf8" });
        expect(held.status).not.toBe(0);
        expect(fs.existsSync(locked)).toBe(true);
        expect(fs.readFileSync(path.join(seeded.v4, "config.json"), "utf8")).toBe("v4");
        fs.rmSync(dirs.root, { recursive: true, force: true });
    });
});
