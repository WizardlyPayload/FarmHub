/**
 * @jest-environment node
 */
"use strict";

// 104: pending first-run discovery stays inside the physical profile that owns it, and only a complete
// careerSavegame document can name a pending career. Fixtures use real Windows directory junctions.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const exportIngress = require("../exportIngress");
const { encodeEnvelope } = require("../exportEnvelope");
const { productionFunctions } = require("./helpers/production-source.cjs");

const IDENTITY_FIELDS = ["careerId", "sessionId", "exportGeneration", "publicationSequence", "generation", "ready", "identity"];

// Fixtures live in one freshly created run root directly under the physical temp directory. When
// FARMDASH_104_STAGE is set, the temp directory must also sit strictly inside that real stage folder;
// otherwise nothing is created. Fixtures are left in place: no cleanup, so no link is ever followed.
let ownedRunRoot = null;

function physical(p) {
    const real = fs.realpathSync.native(p);
    return process.platform === "win32" ? real.toLowerCase() : real;
}

function strictlyInside(child, parent) {
    const rel = path.relative(parent, child);
    return rel !== "" && rel.split(path.sep)[0] !== ".." && !path.isAbsolute(rel);
}

function runRoot() {
    if (ownedRunRoot) return ownedRunRoot;
    const realTmp = fs.realpathSync.native(os.tmpdir());
    const tmp = physical(realTmp);
    const stage = process.env.FARMDASH_104_STAGE;
    if (stage !== undefined) {
        const stat = fs.lstatSync(stage, { throwIfNoEntry: false });
        if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`FARMDASH_104_STAGE is not a real directory: ${stage}`);
        if (!strictlyInside(tmp, physical(stage))) throw new Error(`temp directory ${tmp} is not inside FARMDASH_104_STAGE ${stage}`);
    }
    const root = fs.mkdtempSync(path.join(realTmp, "farmdash-104-run-"));
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.readdirSync(root).length || path.dirname(physical(root)) !== tmp) {
        throw new Error(`fresh run root is not an empty real directory under ${tmp}: ${root}`);
    }
    ownedRunRoot = root;
    return root;
}

function tempRoot() {
    const run = runRoot();
    const root = fs.mkdtempSync(path.join(run, "case-"));
    if (fs.lstatSync(root).isSymbolicLink() || !strictlyInside(physical(root), physical(run))) throw new Error(`fixture escaped its run root: ${root}`);
    return root;
}

function careerXml(name, map = "Review Map") {
    return `<?xml version="1.0" encoding="utf-8" standalone="no"?>\n<careerSavegame revision="2" valid="true"><settings><savegameName>${name}</savegameName><mapTitle>${map}</mapTitle></settings></careerSavegame>`;
}

function writeCareer(profile, xml, slot = "savegame1") {
    const dir = path.join(profile, slot);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "careerSavegame.xml"), xml);
}

function junction(target, link) {
    fs.symlinkSync(target, link, "junction");
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
}

function inventory(root) {
    const rows = [];
    const visit = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            const rel = path.relative(root, full);
            if (entry.isSymbolicLink()) rows.push([rel, "link", fs.readlinkSync(full)]);
            else if (entry.isDirectory()) { rows.push([rel, "dir"]); visit(full); }
            else rows.push([rel, crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex")]);
        }
    };
    visit(root);
    return rows.sort((a, b) => a[0].localeCompare(b[0]));
}

function trackedFs(mutations) {
    const writes = ["writeFile", "appendFile", "rename", "unlink", "rm", "rmdir", "mkdir", "mkdtemp", "copyFile", "symlink", "link", "truncate", "open"];
    return new Proxy(fs, {
        get(target, prop, receiver) {
            if (prop === "promises") {
                return new Proxy(target.promises, {
                    get(promiseTarget, promiseProp) {
                        const value = promiseTarget[promiseProp];
                        if (typeof value !== "function") return value;
                        if (writes.includes(String(promiseProp))) {
                            return (...args) => { mutations.push(String(promiseProp)); return value.apply(promiseTarget, args); };
                        }
                        return value.bind(promiseTarget);
                    },
                });
            }
            const value = Reflect.get(target, prop, receiver);
            if (typeof value !== "function") return value;
            if (writes.some((name) => String(prop) === name + "Sync")) {
                return (...args) => { mutations.push(String(prop)); return value.apply(target, args); };
            }
            return value.bind(target);
        },
    });
}

/** Runs the production scanner over explicit profile/dashboard roots and proves the scan wrote nothing. */
async function scan(root, profiles, dashRoots = profiles.map((p) => path.join(p, "modSettings", "FS25_FarmDashboard"))) {
    const before = inventory(root);
    const mutations = [];
    const api = productionFunctions("FS25_FarmDashboard_App/main.js", [
        "sameResolvedDirectory",
        "looksLikeSaveSlotId",
        "profileRootForDashboard",
        "discoveryLabel",
        "scanLocalSaves",
    ], {
        fs: trackedFs(mutations),
        exportIngress,
        ingressOrchestration: require("../ingressOrchestration"),
        replicaRegistration: require("../replicaRegistration"),
        getFs25DocumentsRoot: () => profiles[0],
        getElectronDocumentsPath: () => null,
        collectFs25DocumentRoots: () => profiles,
        collectFarmDashboardModSettingsRoots: () => dashRoots,
        pathExists: async (file) => {
            try { await fs.promises.access(file); return true; } catch (error) { if (error && error.code === "ENOENT") return false; throw error; }
        },
        readFileUtf8WithRetryAsync: async (file) => fs.readFileSync(file, "utf8"),
        console: { log() {}, warn() {}, error() {} },
    });
    const result = await api.scanLocalSaves();
    expect(mutations).toEqual([]);
    expect(inventory(root)).toEqual(before);
    return result;
}

function pendingRows(result) {
    return result.saves.filter((row) => row.awaitingFirstExport === true);
}

function expectNoInventedIdentity(row) {
    for (const field of IDENTITY_FIELDS) expect(row).not.toHaveProperty(field);
    expect(row.id).toMatch(/^srv_\d+$/);
}

describe("104 pending discovery keeps dashboard ancestry inside the owning profile", () => {
    test("junction fixtures are created in a freshly owned run root inside the temp directory (and inside FARMDASH_104_STAGE when set)", () => {
        const tmp = physical(os.tmpdir());
        const run = runRoot();
        expect(fs.lstatSync(run).isSymbolicLink()).toBe(false);
        expect(path.basename(run)).toMatch(/^farmdash-104-run-/);
        expect(path.dirname(physical(run))).toBe(tmp);
        const root = tempRoot();
        expect(strictlyInside(physical(root), physical(run))).toBe(true);
        expect(fs.readdirSync(root)).toEqual([]);
        const stage = process.env.FARMDASH_104_STAGE;
        expect(stage === undefined || strictlyInside(tmp, physical(stage))).toBe(true);
    });

    test.each([
        ["dashboard root is a junction, slot absent", "dash", false],
        ["dashboard root is a junction, empty slot in the target", "dash", true],
        ["modSettings is a junction, slot absent", "modSettings", false],
        ["modSettings is a junction, empty slot in the target", "modSettings", true],
    ])("%s: no pending row", async (_label, kind, withSlot) => {
        const root = tempRoot();
        const profile = path.join(root, "profile");
        writeCareer(profile, careerXml("Junction Farm"));
        const foreign = path.join(root, "foreign");
        fs.mkdirSync(foreign);
        const dash = path.join(profile, "modSettings", "FS25_FarmDashboard");
        if (kind === "dash") {
            fs.mkdirSync(path.dirname(dash));
            if (withSlot) fs.mkdirSync(path.join(foreign, "savegame1"));
            junction(foreign, dash);
        } else {
            fs.mkdirSync(path.join(foreign, "FS25_FarmDashboard"));
            if (withSlot) fs.mkdirSync(path.join(foreign, "FS25_FarmDashboard", "savegame1"));
            junction(foreign, path.dirname(dash));
        }
        expect(fs.realpathSync(dash).toLowerCase().startsWith(fs.realpathSync(profile).toLowerCase() + path.sep)).toBe(false);
        const result = await scan(root, [profile]);
        expect(result.saves).toEqual([]);
    });

    test("a junction that stays inside the same profile is still refused as dashboard ancestry", async () => {
        const root = tempRoot();
        const profile = path.join(root, "profile");
        writeCareer(profile, careerXml("Inner Link Farm"));
        const inner = path.join(profile, "elsewhere");
        fs.mkdirSync(path.join(inner, "FS25_FarmDashboard"), { recursive: true });
        junction(inner, path.join(profile, "modSettings"));
        expect((await scan(root, [profile])).saves).toEqual([]);
    });

    test("a redirected profile root still offers its career under the lexical path, never relabelled", async () => {
        const root = tempRoot();
        const real = path.join(root, "real-documents", "FarmingSimulator2025");
        writeCareer(real, careerXml("Redirected Farm"));
        const profile = path.join(root, "redirected-profile");
        junction(real, profile);
        const dash = path.join(profile, "modSettings", "FS25_FarmDashboard");
        const result = await scan(root, [profile]);
        const rows = pendingRows(result);
        expect(rows).toHaveLength(1);
        expect(rows[0].localPath).toBe(dash);
        expect(rows[0].localSubFolder).toBe("savegame1");
        expect(rows[0].name).toBe("Redirected Farm — Review Map");
        expectNoInventedIdentity(rows[0]);
    });

    test("a redirected profile with real modSettings and an empty slot still offers its career", async () => {
        const root = tempRoot();
        const real = path.join(root, "real-documents", "FarmingSimulator2025");
        writeCareer(real, careerXml("Redirected Slot Farm"));
        fs.mkdirSync(path.join(real, "modSettings", "FS25_FarmDashboard", "savegame1"), { recursive: true });
        const profile = path.join(root, "redirected-profile");
        junction(real, profile);
        const rows = pendingRows(await scan(root, [profile]));
        expect(rows.map((row) => [row.localPath, row.localSubFolder])).toEqual([[path.join(profile, "modSettings", "FS25_FarmDashboard"), "savegame1"]]);
    });

    test("a redirected Documents parent above the profile still offers its career", async () => {
        const root = tempRoot();
        const realDocs = path.join(root, "real-docs");
        writeCareer(path.join(realDocs, "My Games", "FarmingSimulator2025"), careerXml("Parent Redirect Farm"));
        const docs = path.join(root, "Documents");
        junction(realDocs, docs);
        const profile = path.join(docs, "My Games", "FarmingSimulator2025");
        const rows = pendingRows(await scan(root, [profile]));
        expect(rows).toHaveLength(1);
        expect(rows[0].localPath).toBe(path.join(profile, "modSettings", "FS25_FarmDashboard"));
    });

    test("a redirected profile whose modSettings escapes elsewhere is refused", async () => {
        const root = tempRoot();
        const real = path.join(root, "real-documents", "FarmingSimulator2025");
        writeCareer(real, careerXml("Escaping Farm"));
        const foreign = path.join(root, "foreign");
        fs.mkdirSync(path.join(foreign, "FS25_FarmDashboard"), { recursive: true });
        junction(foreign, path.join(real, "modSettings"));
        const profile = path.join(root, "redirected-profile");
        junction(real, profile);
        expect((await scan(root, [profile])).saves).toEqual([]);
    });

    test("a refused profile does not hide a healthy profile", async () => {
        const root = tempRoot();
        const bad = path.join(root, "bad-profile");
        const good = path.join(root, "good-profile");
        writeCareer(bad, careerXml("Bad Farm"));
        writeCareer(good, careerXml("Good Farm"));
        const foreign = path.join(root, "foreign");
        fs.mkdirSync(foreign);
        fs.mkdirSync(path.join(bad, "modSettings"));
        junction(foreign, path.join(bad, "modSettings", "FS25_FarmDashboard"));
        const rows = pendingRows(await scan(root, [bad, good]));
        expect(rows.map((row) => row.savegameName)).toEqual(["Good Farm"]);
        expect(rows[0].localPath).toBe(path.join(good, "modSettings", "FS25_FarmDashboard"));
    });

    test("a plain file where modSettings should be is refused", async () => {
        const root = tempRoot();
        const profile = path.join(root, "profile");
        writeCareer(profile, careerXml("File Farm"));
        fs.writeFileSync(path.join(profile, "modSettings"), "not a directory");
        expect((await scan(root, [profile])).saves).toEqual([]);
    });

    test("committed exports under a normal root keep precedence with no pending marker", async () => {
        const root = tempRoot();
        const profile = path.join(root, "profile");
        writeCareer(profile, careerXml("Committed Farm"));
        writeCareer(profile, careerXml("Other Farm"), "savegame2");
        const dir = path.join(profile, "modSettings", "FS25_FarmDashboard", "savegame1");
        const careerId = "career-104";
        fs.mkdirSync(path.join(dir, careerId), { recursive: true });
        fs.writeFileSync(path.join(dir, careerId, "slot-a.xml"), encodeEnvelope(JSON.stringify({ savegameName: "Committed Farm", mapTitle: "Review Map" }), {
            careerId, sessionId: "session-104", publicationSequence: 1, exportGeneration: 1, simulationTimeMs: 10,
        }));
        fs.writeFileSync(path.join(dir, "active.xml"), `<farmDashboardRoute schema="1" careerId="${careerId}" sessionId="session-104" publicationSequence="1" slot="a" persistence="saved" sourceSlot="savegame1"/>`);
        const result = await scan(root, [profile]);
        expect(result.saves).toHaveLength(1);
        expect(result.saves[0]).not.toHaveProperty("awaitingFirstExport");
        expect(result.saves[0].savegameName).toBe("Committed Farm");
    });
});

describe("104 pending discovery requires a complete careerSavegame document", () => {
    test.each([
        ["whitespace only", "   \n  "],
        ["root closing tag missing", "<careerSavegame><settings><savegameName>Truncated Farm</savegameName><mapTitle>Review Map</mapTitle></settings>"],
        ["settings and root closing tags missing", "<careerSavegame><settings><savegameName>Truncated Farm</savegameName><mapTitle>Review Map</mapTitle>"],
        ["cut inside a closing tag", "<?xml version=\"1.0\"?><careerSavegame><settings><savegameName>Truncated Farm</savegameName><mapTitle>Review Map</ma"],
        ["cut inside the declaration", "<?xml version=\"1.0\" enco"],
        ["mismatched nesting", "<careerSavegame><settings><savegameName>Bad Farm</mapTitle></settings></careerSavegame>"],
        ["unrelated root", "<farmDashboard><settings><savegameName>Other Root</savegameName><mapTitle>Review Map</mapTitle></settings></farmDashboard>"],
        ["careerSavegame nested under another root", "<wrapper><careerSavegame><settings><savegameName>Nested Farm</savegameName></settings></careerSavegame></wrapper>"],
        ["two roots", "<careerSavegame><settings><savegameName>Two Farm</savegameName></settings></careerSavegame><careerSavegame/>"],
        ["trailing garbage after the root", "<careerSavegame><settings><savegameName>Tail Farm</savegameName></settings></careerSavegame><broken"],
        ["DOCTYPE with an entity", "<?xml version=\"1.0\"?><!DOCTYPE careerSavegame [<!ENTITY n \"Entity Farm\">]><careerSavegame><settings><savegameName>&n;</savegameName></settings></careerSavegame>"],
        ["closing tag appears only in a comment", "<careerSavegame><settings><savegameName>Comment Farm</savegameName><mapTitle>Review Map</mapTitle></settings><!-- </careerSavegame> -->"],
        ["well-formed but no labels", "<careerSavegame revision=\"2\"><settings/></careerSavegame>"],
    ])("%s: no pending row", async (_label, xml) => {
        const root = tempRoot();
        const profile = path.join(root, "profile");
        writeCareer(profile, xml);
        expect((await scan(root, [profile])).saves).toEqual([]);
    });

    test("an empty file is never read as a career", async () => {
        const root = tempRoot();
        const profile = path.join(root, "profile");
        writeCareer(profile, "");
        expect((await scan(root, [profile])).saves).toEqual([]);
    });

    test("a truncated career becomes visible on a later scan once the file is complete", async () => {
        const root = tempRoot();
        const profile = path.join(root, "profile");
        const full = careerXml("Growing Farm");
        writeCareer(profile, full.slice(0, full.length - "</careerSavegame>".length));
        expect((await scan(root, [profile])).saves).toEqual([]);
        fs.writeFileSync(path.join(profile, "savegame1", "careerSavegame.xml"), full);
        const rows = pendingRows(await scan(root, [profile]));
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe("Growing Farm — Review Map");
        expectNoInventedIdentity(rows[0]);
    });

    test("a complete career with a BOM, comments and attributed labels keeps its labels", async () => {
        const root = tempRoot();
        const profile = path.join(root, "profile");
        writeCareer(profile, "\uFEFF<?xml version=\"1.0\" encoding=\"utf-8\" standalone=\"no\"?>\n<!-- saved by FS25 -->\n<careerSavegame revision=\"2\" valid=\"true\">\n  <settings>\n    <savegameName lang=\"en\"> Attr Farm </savegameName>\n    <mapTitle>Hutan Pantai</mapTitle>\n  </settings>\n  <statistics><money>1000</money></statistics>\n</careerSavegame>\n");
        const rows = pendingRows(await scan(root, [profile]));
        expect(rows.map((row) => [row.savegameName, row.mapTitle])).toEqual([["Attr Farm", "Hutan Pantai"]]);
    });

    test("labels written directly under careerSavegame still name the career", async () => {
        const root = tempRoot();
        const profile = path.join(root, "profile");
        writeCareer(profile, "<careerSavegame><savegameName>Flat Farm</savegameName><mapTitle>Elmcreek</mapTitle></careerSavegame>");
        const rows = pendingRows(await scan(root, [profile]));
        expect(rows.map((row) => row.name)).toEqual(["Flat Farm — Elmcreek"]);
    });

    test("a repeated savegameName is not guessed", async () => {
        const root = tempRoot();
        const profile = path.join(root, "profile");
        writeCareer(profile, "<careerSavegame><settings><savegameName>One</savegameName><savegameName>Two</savegameName><mapTitle>Elmcreek</mapTitle></settings></careerSavegame>");
        const rows = pendingRows(await scan(root, [profile]));
        expect(rows.map((row) => [row.savegameName, row.mapTitle])).toEqual([[null, "Elmcreek"]]);
    });
});
