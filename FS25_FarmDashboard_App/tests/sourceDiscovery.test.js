"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { encodeEnvelope } = require("../exportEnvelope");
const exportIngress = require("../exportIngress");
const { writeStrictPair } = require("../replicaPairContract.cjs");
const { productionFunctions, productionTs } = require("./helpers/production-source.cjs");

function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-discovery-"));
}

function listTree(dir) {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    const walk = (current) => {
        for (const name of fs.readdirSync(current)) {
            const full = path.join(current, name);
            if (fs.statSync(full).isDirectory()) walk(full);
            else out.push(full);
        }
    };
    walk(dir);
    return out.sort();
}

function routeXml(fields) {
    const body = Object.entries(fields).map(([name, value]) => `${name}="${value}"`).join(" ");
    return `<farmDashboardRoute ${body}/>`;
}

function slotXml(sequence, generation, payload, career) {
    return encodeEnvelope(payload, {
        careerId: career,
        sessionId: "session-a",
        publicationSequence: sequence,
        exportGeneration: generation,
        simulationTimeMs: 10,
    });
}

function writeAuthority(dir, careerId, payload, slotName) {
    fs.mkdirSync(path.join(dir, careerId), { recursive: true });
    fs.writeFileSync(path.join(dir, careerId, "slot-a.xml"), slotXml(1, 1, JSON.stringify(payload), careerId));
    fs.writeFileSync(path.join(dir, "active.xml"), routeXml({
        schema: "1",
        careerId,
        sessionId: "session-a",
        publicationSequence: "1",
        slot: "a",
        persistence: "saved",
        sourceSlot: slotName,
    }));
}

describe("current XML source discovery", () => {
    test("profiles, replicas, and legacy previews stay on their own ingress result", async () => {
        const root = tempDir();
        const defaultProfile = path.join(root, "default-profile");
        const otherProfile = path.join(root, "other-profile");
        const defaultDash = path.join(defaultProfile, "modSettings", "FS25_FarmDashboard");
        const otherDash = path.join(otherProfile, "modSettings", "FS25_FarmDashboard");
        const missingDash = path.join(root, "missing-profile", "modSettings", "FS25_FarmDashboard");
        fs.mkdirSync(path.join(defaultProfile, "savegame3"), { recursive: true });
        fs.writeFileSync(path.join(defaultProfile, "savegame3", "careerSavegame.xml"), "<careerSavegame><savegameName>DEFAULT-FARM</savegameName><mapTitle>DEFAULT-MAP</mapTitle></careerSavegame>");
        fs.mkdirSync(path.join(otherProfile, "savegame9"), { recursive: true });
        fs.writeFileSync(path.join(otherProfile, "savegame9", "careerSavegame.xml"), "<careerSavegame><savegameName>OTHER-MISSING</savegameName><mapTitle>OTHER-MISSING-MAP</mapTitle></careerSavegame>");

        writeAuthority(path.join(defaultDash, "savegame3"), "career-default", { savegameName: "DEFAULT-FARM", mapTitle: "DEFAULT-MAP" }, "savegame3");
        writeAuthority(path.join(defaultDash, "savegame4"), "career-empty", {}, "savegame4");
        const replicaDir = path.join(defaultDash, "replicas", "source-a");
        writeStrictPair(replicaDir, slotXml(1, 1, JSON.stringify({ savegameName: "REGISTERED-REPLICA", mapTitle: "REGISTERED-MAP" }), "career-savegame11"), {
            sourceId: "source-a",
            sourceSlot: "savegame11",
            connectionEpoch: "1",
            slot: "a",
            replicaRevision: 1,
        });
        fs.mkdirSync(path.join(defaultProfile, "savegame12"), { recursive: true });
        fs.writeFileSync(path.join(defaultProfile, "savegame12", "careerSavegame.xml"), "<careerSavegame><savegameName>UNRELATED-LOCAL-FARM</savegameName><mapTitle>UNRELATED-LOCAL-MAP</mapTitle></careerSavegame>");
        writeStrictPair(path.join(defaultDash, "replicas", "srv_123456789"), slotXml(1, 1, JSON.stringify({ savegameName: "APP-ID-REPLICA", mapTitle: "APP-ID-MAP" }), "career-app-id"), {
            sourceId: "srv_123456789",
            sourceSlot: "savegame12",
            connectionEpoch: "1",
            slot: "a",
            replicaRevision: 1,
        });
        writeStrictPair(path.join(defaultDash, "replicas", "source-empty"), slotXml(1, 1, JSON.stringify({}), "career-empty-replica"), {
            sourceId: "source-empty",
            sourceSlot: "savegame12",
            connectionEpoch: "1",
            slot: "a",
            replicaRevision: 1,
        });
        writeStrictPair(path.join(defaultDash, "savegame10"), slotXml(1, 1, JSON.stringify({ savegameName: "DIRECT-SLOT", mapTitle: "NOT-WATCHED" }), "career-savegame10"), {
            sourceId: "source-a",
            sourceSlot: "savegame10",
            connectionEpoch: "1",
            slot: "a",
            replicaRevision: 1,
        });
        const badReplica = path.join(defaultDash, "savegame7");
        fs.mkdirSync(badReplica, { recursive: true });
        fs.writeFileSync(path.join(badReplica, "slot-a.xml"), "<not-an-envelope/>");
        fs.writeFileSync(path.join(badReplica, "selection-a.xml"), "<farmDashboardReplicaSelection/>");
        fs.writeFileSync(path.join(badReplica, "data.json"), JSON.stringify({ savegameName: "UNTRUSTED-REPLICA-JSON", mapTitle: "BAD-MAP" }));
        const legacy = path.join(defaultDash, "savegame8");
        fs.mkdirSync(legacy, { recursive: true });
        fs.writeFileSync(path.join(legacy, "data.json"), JSON.stringify({ savegameName: "LEGACY-PREVIEW", mapTitle: "LEGACY-MAP" }));
        const badAuthority = path.join(defaultDash, "savegame6");
        fs.mkdirSync(badAuthority, { recursive: true });
        fs.writeFileSync(path.join(badAuthority, "active.xml"), "<farmDashboardRoute");
        fs.writeFileSync(path.join(badAuthority, "data.json"), JSON.stringify({ savegameName: "BAD-AUTHORITY", mapTitle: "BAD-MAP" }));
        writeAuthority(path.join(otherDash, "savegame3"), "career-other", { savegameName: "OTHER-FARM", mapTitle: "OTHER-MAP" }, "savegame3");
        writeAuthority(path.join(otherDash, "savegame9"), "career-missing", {}, "savegame9");

        const careerReads = [];
        const mutations = [];
        const trackedFs = new Proxy(fs, {
            get(target, prop, receiver) {
                if (prop === "promises") {
                    return new Proxy(target.promises, {
                        get(promiseTarget, promiseProp) {
                            const value = promiseTarget[promiseProp];
                            if (typeof value !== "function") return value;
                            if (["writeFile", "appendFile", "rename", "unlink", "rm", "mkdir", "copyFile"].includes(String(promiseProp))) {
                                return (...args) => {
                                    mutations.push(String(promiseProp));
                                    return value.apply(promiseTarget, args);
                                };
                            }
                            return value.bind(promiseTarget);
                        },
                    });
                }
                const value = Reflect.get(target, prop, receiver);
                if (typeof value !== "function") return value;
                if (["writeFileSync", "appendFileSync", "renameSync", "unlinkSync", "rmSync", "mkdirSync", "copyFileSync", "linkSync", "openSync"].includes(String(prop))) {
                    return (...args) => {
                        mutations.push(String(prop));
                        return value.apply(target, args);
                    };
                }
                return value.bind(target);
            },
        });
        const before = listTree(root);
        const api = productionFunctions("FS25_FarmDashboard_App/main.js", [
            "sameResolvedDirectory",
            "looksLikeSaveSlotId",
            "profileRootForDashboard",
            "discoveryLabel",
            "scanLocalSaves",
        ], {
            fs: trackedFs,
            ingressOrchestration: require("../ingressOrchestration"),
            replicaRegistration: require("../replicaRegistration"),
            getFs25DocumentsRoot: () => defaultProfile,
            exportIngress,
            getElectronDocumentsPath: () => null,
            collectFs25DocumentRoots: () => [defaultProfile, otherProfile],
            collectFarmDashboardModSettingsRoots: () => [defaultDash, otherDash, defaultDash, missingDash],
            pathExists: async (file) => {
                try {
                    await fs.promises.access(file);
                    return true;
                } catch (error) {
                    if (error && error.code === "ENOENT") return false;
                    throw error;
                }
            },
            readFileUtf8WithRetryAsync: async (file) => {
                careerReads.push(path.resolve(file));
                return fs.readFileSync(file, "utf8");
            },
        });

        const scan = await api.scanLocalSaves();
        const bySlot = (dash, slot) => scan.saves.find((row) => row.localPath === dash && row.localSubFolder === slot);
        const defaultSave = bySlot(defaultDash, "savegame3");
        const otherSave = bySlot(otherDash, "savegame3");
        const emptySave = bySlot(defaultDash, "savegame4");
        const replicaSave = scan.saves.find((row) => row.id === "source-a");
        const emptyReplica = scan.saves.find((row) => row.id === "source-empty");
        const legacySave = bySlot(defaultDash, "savegame8");
        const missingSave = bySlot(otherDash, "savegame9");

        expect(defaultSave.savegameName).toBe("DEFAULT-FARM");
        expect(defaultSave.mapTitle).toBe("DEFAULT-MAP");
        expect(defaultSave.replicaRemoteSlot).toBeUndefined();
        expect(defaultSave.legacyJson).toBeUndefined();
        expect(otherSave.savegameName).toBe("OTHER-FARM");
        expect(otherSave.mapTitle).toBe("OTHER-MAP");
        expect(emptySave.name).toBe("Unknown Map");
        expect(emptySave.savegameName).toBeNull();
        expect(emptySave.mapTitle).toBeNull();
        expect(replicaSave.savegameName).toBe("REGISTERED-REPLICA");
        expect(replicaSave.mapTitle).toBe("REGISTERED-MAP");
        expect(replicaSave.replicaRemoteSlot).toBe("savegame11");
        expect(replicaSave.localSubFolder).toBe("savegame11");
        expect(replicaSave.legacyJson).toBeUndefined();
        expect(emptyReplica.savegameName).toBeNull();
        expect(emptyReplica.mapTitle).toBeNull();
        expect(emptyReplica.name).toBe("Unknown Map");
        expect(emptyReplica.replicaRemoteSlot).toBe("savegame12");
        expect(scan.saves.some((row) => row.savegameName === "DIRECT-SLOT" || row.savegameName === "UNRELATED-LOCAL-FARM")).toBe(false);
        expect(legacySave.savegameName).toBe("LEGACY-PREVIEW");
        expect(legacySave.legacyJson).toBe(true);
        expect(legacySave.replicaRemoteSlot).toBeUndefined();
        expect(missingSave.savegameName).toBe("OTHER-MISSING");
        expect(missingSave.mapTitle).toBe("OTHER-MISSING-MAP");
        expect(scan.saves.some((row) => row.savegameName === "UNTRUSTED-REPLICA-JSON" || row.savegameName === "BAD-AUTHORITY")).toBe(false);
        expect(scan.saves.filter((row) => row.localSubFolder === "savegame3" && row.localPath === defaultDash)).toHaveLength(1);
        expect(scan.searchedRoots).toEqual([defaultDash, otherDash, defaultDash, missingDash]);
        expect(scan.missingRoots).toEqual([missingDash]);
        expect(careerReads).toEqual([path.resolve(path.join(otherProfile, "savegame9", "careerSavegame.xml"))]);
        expect(listTree(root)).toEqual(before);
        expect(mutations).toEqual([]);

        const directReplica = exportIngress.ingestWatchedSlot(replicaDir, {
            sourceId: "source-a",
            configuredSlot: "savegame11",
        });
        expect(directReplica.status).toBe("replica");
        expect(directReplica.payload.savegameName).toBe(replicaSave.savegameName);
        const directSlot = exportIngress.ingestWatchedSlot(path.join(defaultDash, "savegame10"), {
            sourceId: "source-a",
            configuredSlot: "savegame10",
        });
        expect(directSlot.status).toBe("replica");
        expect(scan.saves.some((row) => row.localSubFolder === "savegame10")).toBe(false);
        const directBad = exportIngress.ingestWatchedSlot(badReplica, { sourceId: "savegame7", configuredSlot: "savegame7" });
        expect(directBad.payload).toBeNull();
        expect(directBad.replica).toBe(true);

        const { discoveredServerFromScan, importDiscoveredSaves, discoveryFeedback } = productionTs("NEW APP/src/lib/discovered-save.ts");
        const localIngress = require("../localIngressController");
        const setupConfigMerge = require("../setupConfigMerge.cjs");
        const livestockDetail = require("../livestockDetail");
        const replicaRow = discoveredServerFromScan(replicaSave, 0);
        expect(replicaRow.id).toBe("source-a");
        expect(replicaRow.mode).toBe("local");
        expect(replicaRow.replicaRemoteSlot).toBe("savegame11");
        expect(replicaRow.legacyJson).toBeUndefined();
        expect(replicaRow.localSubFolder).toBe("savegame11");
        const imported = importDiscoveredSaves([], [replicaSave]);
        expect(imported.added).toHaveLength(0);
        expect(imported.recoveries).toEqual([{ id: "source-a", reason: "registration-recovery" }]);
        const saved = setupConfigMerge.resolveServersForSave([], [replicaRow]);
        expect(saved.servers[0].id).toBe("source-a");
        expect(saved.servers[0].replicaRemoteSlot).toBe("savegame11");
        const appReplica = scan.saves.find((row) => row.id === "srv_123456789");
        expect(appReplica.replicaRemoteSlot).toBe("savegame12");
        expect(appReplica.savegameName).toBe("APP-ID-REPLICA");
        const appImported = importDiscoveredSaves([], [appReplica], { defaultDashboardRoot: defaultDash });
        expect(appImported.added).toHaveLength(0);
        expect(appImported.recoveries).toEqual([{ id: "srv_123456789", reason: "registration-recovery" }]);
        const selected = localIngress.selectIngress(saved.servers[0], {
            basePath: saved.servers[0].localPath,
            folderName: saved.servers[0].localSubFolder,
        }, fs.existsSync);
        expect(selected.kind).toBe("replica");
        expect(selected.dir).toBe(replicaDir);
        expect(selected.configuredSlot).toBe("savegame11");
        const selectedRead = exportIngress.ingestWatchedSlot(selected.dir, {
            sourceId: saved.servers[0].id,
            configuredSlot: selected.configuredSlot,
        });
        expect(selectedRead.identity.careerId).toBe("career-savegame11");
        expect(selectedRead.identity.sessionId).toBe("session-a");
        expect(selectedRead.payload.mapTitle).toBe("REGISTERED-MAP");
        const refused = await livestockDetail.request({
            req: { params: { id: "1" }, body: {} },
            resolveServerIdForRequest: () => "source-a",
            servers: [saved.servers[0]],
            serverStates: {
                "source-a": {
                    active: true,
                    ingressKind: "replica",
                    exportIdentity: selectedRead.identity,
                },
            },
            getFs25DocumentsRoot: () => defaultProfile,
        });
        expect(refused).toBe(false);
        const legacyRow = discoveredServerFromScan(legacySave, 1);
        expect(legacyRow.legacyJson).toBe(true);
        expect(legacyRow.replicaRemoteSlot).toBeUndefined();
        const authorityRow = discoveredServerFromScan(defaultSave, 2);
        expect(discoveredServerFromScan(defaultSave, 99).id).toBe(authorityRow.id);
        expect(authorityRow.replicaRemoteSlot).toBeUndefined();
        expect(authorityRow.legacyJson).toBeUndefined();

        const existing = [{
            id: "existing-default",
            name: "Default",
            mode: "local",
            localPath: defaultDash,
            localSubFolder: "savegame3",
            ftpPass: "keep-me",
        }];
        const ftpCollision = [{
            id: "ftp-slot",
            name: "Remote",
            mode: "ftp",
            ftpHost: "files.example",
            localSubFolder: "savegame3",
        }];
        const firstImport = importDiscoveredSaves(existing, [defaultSave, otherSave]);
        expect(firstImport.added).toHaveLength(1);
        expect(firstImport.added[0].localPath).toBe(otherDash);
        expect(firstImport.added[0].localSubFolder).toBe("savegame3");
        const repeated = importDiscoveredSaves([...existing, ...firstImport.added], [defaultSave, otherSave]);
        expect(repeated.added).toHaveLength(0);
        expect(repeated.allDetected).toBe(true);
        const alias = { ...otherSave, localPath: otherDash.replace(/\\/g, "/") + "/" };
        expect(importDiscoveredSaves([...existing, ...firstImport.added], [alias]).added).toHaveLength(0);
        const ftpImport = importDiscoveredSaves(ftpCollision, [defaultSave]);
        expect(ftpImport.added).toHaveLength(1);
        expect(ftpImport.added[0].localPath).toBe(defaultDash);
        const alreadyReplica = importDiscoveredSaves([{
            id: "source-a",
            name: "Bound",
            mode: "local",
            localPath: defaultDash,
            localSubFolder: "savegame11",
            replicaRemoteSlot: "savegame11",
        }], [replicaSave]);
        expect(alreadyReplica.added).toHaveLength(0);
        const implicit = importDiscoveredSaves([{
            id: "existing-default",
            name: "Default",
            mode: "local",
            localPath: "",
            localSubFolder: "savegame3",
            ftpPass: "keep-me",
        }], [defaultSave], { defaultDashboardRoot: defaultDash });
        expect(implicit.added).toHaveLength(0);
        expect(implicit.allDetected).toBe(true);
        const unresolved = importDiscoveredSaves([{
            id: "existing-default",
            name: "Default",
            mode: "local",
            localPath: "",
            localSubFolder: "savegame3",
        }], [defaultSave], {});
        expect(unresolved.added).toHaveLength(0);
        expect(unresolved.unresolved.length).toBeGreaterThan(0);
        expect(discoveryFeedback(unresolved, true)).toBe("unresolved");
        const legacyExisting = {
            id: "legacy-existing",
            name: "Legacy",
            mode: "local",
            localPath: defaultDash,
            localSubFolder: "savegame3",
            legacyJson: true,
            ftpPass: "keep-me",
        };
        const legacyModern = importDiscoveredSaves([legacyExisting], [defaultSave], { defaultDashboardRoot: defaultDash });
        expect(legacyModern.added).toHaveLength(0);
        expect(legacyExisting.legacyJson).toBe(true);
        expect(legacyExisting.ftpPass).toBe("keep-me");
        const bound = {
            id: "source-a",
            name: "Bound",
            mode: "local",
            localPath: defaultDash,
            localSubFolder: "savegame10",
            replicaRemoteSlot: "savegame10",
            replicaRegistration: { remoteSlot: "savegame10", sessionPairing: "server-a" },
            ftpPass: "keep-me",
        };
        const conflict = importDiscoveredSaves([bound], [replicaSave], { defaultDashboardRoot: defaultDash });
        expect(conflict.added).toHaveLength(0);
        expect(conflict.conflicts).toEqual([{ id: "source-a", reason: "binding-conflict" }]);
        expect(discoveryFeedback(conflict, true)).toBe("conflict");
        expect(bound.replicaRemoteSlot).toBe("savegame10");
        expect(bound.ftpPass).toBe("keep-me");
        const pairConflict = importDiscoveredSaves([], [
            { ...replicaSave, replicaRemoteSlot: "savegame10", localSubFolder: "savegame10" },
            replicaSave,
        ], { defaultDashboardRoot: defaultDash });
        expect(pairConflict.added).toHaveLength(0);
        expect(pairConflict.recoveries).toHaveLength(2);
        const otherRoot = {
            ...replicaSave,
            localPath: otherDash,
        };
        const rootConflict = importDiscoveredSaves([], [replicaSave, otherRoot], { defaultDashboardRoot: defaultDash });
        expect(rootConflict.added).toHaveLength(0);
        expect(rootConflict.recoveries).toHaveLength(2);
        const settingsSource = fs.readFileSync(path.join(__dirname, "../../NEW APP/src/settings/SettingsModal.tsx"), "utf8");
        const setupSource = fs.readFileSync(path.join(__dirname, "../../NEW APP/src/setup/main.tsx"), "utf8");
        expect(settingsSource).toContain("discoveryFeedback(imported");
        expect(setupSource).toContain("discoveryFeedback(imported");
        expect(setupSource).toContain("<LinkServerPrompt />");
        const { SetupStatusNotice } = productionTs("NEW APP/src/setup/status-notice.tsx", {
            "@/i18n/i18n": { t: (key) => key, tOr: (_key, fallback) => fallback || _key },
            "@/lib/ux-state": { errorCopyKey: (code) => code || "", actionCopyKey: (action) => action || "" },
        });
        const noticeText = (node) => {
            if (node == null || typeof node === "boolean") return "";
            if (typeof node === "string" || typeof node === "number") return String(node);
            if (Array.isArray(node)) return node.map(noticeText).join("");
            return noticeText(node.props && node.props.children);
        };
        const provisionNotice = SetupStatusNotice({
            status: {
                lastErrorCode: "E_PROVISION_REQUIRED",
                nextAction: "open_setup",
                nextStep: "This source has no remote identity yet. Automatic FTP creation is not available, so another ready source does not configure it. Add the identity on a source that can create it, then select this source again.",
            },
        });
        expect(provisionNotice.props.role).toBe("status");
        expect(noticeText(provisionNotice)).toContain("Automatic FTP creation is not available");
        const tokenNotice = SetupStatusNotice({
            status: { lastErrorCode: "E_INVALID_TOKEN", nextAction: "open_setup", nextStep: null },
        });
        expect(noticeText(tokenNotice)).toContain("E_INVALID_TOKEN");
        expect(noticeText(tokenNotice)).not.toContain("Automatic FTP creation is not available");
    });

    test("damaged or unreadable registration blocks only that root's replicas", async () => {
        const replicaRegistration = require("../replicaRegistration");
        const { importDiscoveredSaves, discoveryFeedback } = productionTs("NEW APP/src/lib/discovered-save.ts");
        const recoveryText = "Replica registration could not be read. Those replica sources were not added, and the registration file was left unchanged.";
        function pair(dir, sourceId, slot, name) {
            writeStrictPair(dir, slotXml(1, 1, JSON.stringify({ savegameName: name, mapTitle: "MAP" }), "career-" + sourceId), {
                sourceId,
                sourceSlot: slot,
                connectionEpoch: "1",
                slot: "a",
                replicaRevision: 1,
            });
        }
        async function scan(dashList, fsImpl) {
            const api = productionFunctions("FS25_FarmDashboard_App/main.js", [
                "sameResolvedDirectory",
                "looksLikeSaveSlotId",
                "profileRootForDashboard",
                "discoveryLabel",
                "scanLocalSaves",
            ], {
                fs: fsImpl || fs,
                exportIngress,
                ingressOrchestration: require("../ingressOrchestration"),
                replicaRegistration,
                getFs25DocumentsRoot: () => null,
                getElectronDocumentsPath: () => null,
                collectFs25DocumentRoots: () => [],
                collectFarmDashboardModSettingsRoots: () => dashList,
                pathExists: async (file) => {
                    try {
                        await fs.promises.access(file);
                        return true;
                    } catch (error) {
                        if (error && error.code === "ENOENT") return false;
                        throw error;
                    }
                },
                readFileUtf8WithRetryAsync: async () => null,
            });
            return api.scanLocalSaves();
        }

        const root = tempDir();
        const damagedDash = path.join(root, "damaged", "modSettings", "FS25_FarmDashboard");
        const healthyDash = path.join(root, "healthy", "modSettings", "FS25_FarmDashboard");
        writeAuthority(path.join(damagedDash, "savegame3"), "career-local", { savegameName: "LOCAL-FARM", mapTitle: "LOCAL-MAP" }, "savegame3");
        pair(path.join(damagedDash, "replicas", "source-a"), "source-a", "savegame11", "BLOCKED-REPLICA");
        pair(path.join(healthyDash, "replicas", "source-b"), "source-b", "savegame4", "OTHER-REPLICA");
        const damagedXml = "<farmDashboardReplicaSources revision=\"1\"><broken/></farmDashboardReplicaSources>";
        const damagedPath = path.join(damagedDash, "replicaSources.xml");
        fs.writeFileSync(damagedPath, damagedXml);
        const before = fs.readFileSync(damagedPath);
        expect(replicaRegistration.parseRegistrationDocument(damagedXml).ok).toBe(false);
        const damagedScan = await scan([damagedDash, healthyDash]);
        expect(fs.readFileSync(damagedPath).equals(before)).toBe(true);
        const blocked = damagedScan.saves.find((row) => row.id === "source-a");
        const localRow = damagedScan.saves.find((row) => row.localSubFolder === "savegame3");
        const otherReplica = damagedScan.saves.find((row) => row.id === "source-b");
        expect(blocked.bindingStatus).toBe("registration-recovery");
        expect(localRow.bindingStatus).toBeUndefined();
        expect(otherReplica.bindingStatus).toBeUndefined();
        const kept = { id: "kept", name: "Kept", mode: "local", localPath: damagedDash, localSubFolder: "savegame9", ftpPass: "keep-me" };
        const damagedImport = importDiscoveredSaves([kept], damagedScan.saves, { defaultDashboardRoot: null });
        expect(damagedImport.added).toHaveLength(1);
        expect(damagedImport.added.some((row) => row.id === "source-a")).toBe(false);
        expect(damagedImport.added.some((row) => row.id === "source-b")).toBe(false);
        expect(damagedImport.added.some((row) => row.localSubFolder === "savegame3")).toBe(true);
        expect(damagedImport.recoveries).toEqual([
            { id: "source-a", reason: "registration-recovery" },
            { id: "source-b", reason: "registration-recovery" },
        ]);
        expect(damagedImport.conflicts).toEqual([]);
        expect(discoveryFeedback(damagedImport, true)).toBe("recovery");
        expect(kept).toEqual({ id: "kept", name: "Kept", mode: "local", localPath: damagedDash, localSubFolder: "savegame9", ftpPass: "keep-me" });
        expect(recoveryText).not.toMatch(/all detected|success|conflict/i);

        const matchDash = path.join(root, "match", "modSettings", "FS25_FarmDashboard");
        pair(path.join(matchDash, "replicas", "source-a"), "source-a", "savegame11", "MATCHED");
        fs.writeFileSync(path.join(matchDash, "replicaSources.xml"), replicaRegistration.renderRegistrationXml([{ sourceId: "source-a", remoteSlot: "savegame11", sessionPairing: "server-a" }], 1));
        const matchScan = await scan([matchDash]);
        const matchImport = importDiscoveredSaves([], matchScan.saves, {});
        expect(matchImport.added).toEqual([]);
        expect(matchImport.recoveries).toEqual([{ id: "source-a", reason: "registration-recovery" }]);

        const mismatchDash = path.join(root, "mismatch", "modSettings", "FS25_FarmDashboard");
        pair(path.join(mismatchDash, "replicas", "source-a"), "source-a", "savegame11", "MISMATCHED");
        fs.writeFileSync(path.join(mismatchDash, "replicaSources.xml"), replicaRegistration.renderRegistrationXml([{ sourceId: "source-a", remoteSlot: "savegame10", sessionPairing: "server-a" }], 1));
        const mismatchScan = await scan([mismatchDash]);
        const mismatchImport = importDiscoveredSaves([], mismatchScan.saves, {});
        expect(mismatchImport.added).toEqual([]);
        expect(mismatchImport.conflicts).toEqual([{ id: "source-a", reason: "registration-mismatch" }]);
        expect(discoveryFeedback(mismatchImport, true)).toBe("conflict");

        const absentDash = path.join(root, "absent", "modSettings", "FS25_FarmDashboard");
        pair(path.join(absentDash, "replicas", "source-a"), "source-a", "savegame11", "ABSENT");
        const absentScan = await scan([absentDash]);
        expect(importDiscoveredSaves([], absentScan.saves, {}).recoveries).toEqual([{ id: "source-a", reason: "registration-recovery" }]);

        const deniedDash = path.join(root, "denied", "modSettings", "FS25_FarmDashboard");
        pair(path.join(deniedDash, "replicas", "source-a"), "source-a", "savegame11", "DENIED");
        const deniedPath = path.join(deniedDash, "replicaSources.xml");
        fs.writeFileSync(deniedPath, replicaRegistration.renderRegistrationXml([{ sourceId: "source-a", remoteSlot: "savegame11", sessionPairing: "server-a" }], 1));
        const deniedBefore = fs.readFileSync(deniedPath);
        let deniedReads = 0;
        const denyingFs = new Proxy(fs, {
            get(target, prop, receiver) {
                if (prop === "promises") {
                    return new Proxy(target.promises, {
                        get(promiseTarget, promiseProp) {
                            if (promiseProp === "readFile") {
                                return async (file, encoding) => {
                                    if (String(file).endsWith(`${path.sep}replicaSources.xml`) || String(file).endsWith("/replicaSources.xml")) {
                                        deniedReads += 1;
                                        const error = new Error("denied");
                                        error.code = "EACCES";
                                        throw error;
                                    }
                                    return promiseTarget.readFile(file, encoding);
                                };
                            }
                            const value = promiseTarget[promiseProp];
                            return typeof value === "function" ? value.bind(promiseTarget) : value;
                        },
                    });
                }
                const value = Reflect.get(target, prop, receiver);
                return typeof value === "function" ? value.bind(target) : value;
            },
        });
        const deniedScan = await scan([deniedDash], denyingFs);
        expect(deniedReads).toBe(1);
        expect(fs.readFileSync(deniedPath).equals(deniedBefore)).toBe(true);
        expect(deniedScan.saves.find((row) => row.id === "source-a").bindingStatus).toBe("registration-recovery");
        const deniedImport = importDiscoveredSaves([], deniedScan.saves, {});
        expect(deniedImport.added).toEqual([]);
        expect(discoveryFeedback(deniedImport, true)).toBe("recovery");
    });
});
