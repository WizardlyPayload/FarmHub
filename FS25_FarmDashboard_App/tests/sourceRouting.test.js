"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { productionFunctions } = require("./helpers/production-source.cjs");
const livestockDetail = require("../livestockDetail");
const safeFsIdentity = require("../safeFsIdentity.cjs");
const fileCommit = require("../fileCommit.cjs");
const { isExplicitReplicaXmlSource } = require("../xmlCollector");

function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-source-routing-"));
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
    return out;
}

function authority(mapTitle) {
    return {
        active: true,
        mergedData: { mapTitle, fields: [{ id: 1 }] },
        exportIdentity: {
            careerId: "career-a",
            sessionId: "session-a",
            sourceSlot: "savegame3",
            authoritative: true,
        },
    };
}

describe("source routing and server list labels", () => {
    const servers = [];
    const listConfig = [];
    const serverStates = {};
    const preferenceWrites = [];
    const careerReads = [];
    let documentsRoot = "";
    const api = productionFunctions("FS25_FarmDashboard_App/main.js", [
        "looksLikeSaveSlotId",
        "peekCareerSaveLabels",
        "sameResolvedDirectory",
        "usesDefaultCareerProfile",
        "labelText",
        "projectConfiguredServerRow",
        "explicitRequestServerId",
        "requestSourceEligible",
        "getDataForServer",
        "resolveServerIdForRequest",
        "requestLivestockDetail",
        "handleLivestockPenRequest",
        "configuredServerList",
    ], {
        serverStates,
        boundSources: { snapshot: () => null },
        getServersFromStore: () => servers,
        getFs25DocumentsRoot: () => documentsRoot,
        livestockDetailModule: livestockDetail,
        safeFsIdentity,
        isExplicitReplicaXmlSource,
        fs: {
            existsSync: (file) => fs.existsSync(file),
            readFileSync: (file, encoding) => {
                careerReads.push(path.resolve(file));
                return fs.readFileSync(file, encoding);
            },
        },
        store: {
            get: (key) => (key === "config" ? { servers: listConfig } : undefined),
            set: (...args) => preferenceWrites.push(args),
        },
    });

    function reset() {
        for (const key of Object.keys(serverStates)) delete serverStates[key];
        servers.length = 0;
        listConfig.length = 0;
        preferenceWrites.length = 0;
        careerReads.length = 0;
    }

    function localServer(id, root, extra = {}) {
        return {
            id,
            name: id,
            mode: "local",
            enabled: true,
            localPath: root,
            localSubFolder: "savegame3",
            legacyJson: false,
            ...extra,
        };
    }

    test("explicit invalid sources do not write and an omitted source uses the eligible one", async () => {
        const rootA = tempDir();
        const rootB = tempDir();
        fs.mkdirSync(path.join(rootA, "savegame3"), { recursive: true });
        fs.mkdirSync(path.join(rootB, "savegame3"), { recursive: true });
        documentsRoot = rootA;
        reset();
        servers.push(localServer("source-a", rootA), localServer("source-b", rootB));
        serverStates["source-a"] = authority("MAP-A");
        serverStates["source-b"] = authority("MAP-B");

        const valid = await api.handleLivestockPenRequest({ params: { id: "42" }, query: { serverId: "source-a" } });
        expect(valid).toEqual({ status: 200, body: { ok: true } });
        expect(listTree(rootA).map((file) => path.basename(file))).toEqual(["requests.json"]);
        expect(listTree(rootB)).toEqual([]);
        const written = JSON.parse(fs.readFileSync(path.join(rootA, "savegame3", "requests.json"), "utf8"));
        expect(written.pens).toEqual([expect.objectContaining({ id: 42 })]);
        expect(preferenceWrites).toEqual([]);

        const unknownRoot = tempDir();
        fs.mkdirSync(path.join(unknownRoot, "savegame3"), { recursive: true });
        reset();
        servers.push(localServer("source-a", unknownRoot));
        serverStates["source-a"] = authority("MAP-A");
        const unknown = await api.handleLivestockPenRequest({ params: { id: "42" }, query: { serverId: "removed-source" } });
        expect(unknown).toEqual({ status: 200, body: { ok: false } });
        expect(api.resolveServerIdForRequest({ query: { serverId: "removed-source" } })).toBeNull();
        expect(api.getDataForServer({ query: { serverId: "removed-source" } })).toBeNull();
        expect(listTree(unknownRoot)).toEqual([]);
        expect(preferenceWrites).toEqual([]);

        const blank = await api.handleLivestockPenRequest({ params: { id: "42" }, query: { serverId: "   " } });
        expect(blank.body.ok).toBe(false);
        expect(listTree(unknownRoot)).toEqual([]);

        const stoppedRoot = tempDir();
        const liveRoot = tempDir();
        fs.mkdirSync(path.join(stoppedRoot, "savegame3"), { recursive: true });
        fs.mkdirSync(path.join(liveRoot, "savegame3"), { recursive: true });
        reset();
        servers.push(localServer("source-a", stoppedRoot), localServer("source-b", liveRoot));
        serverStates["source-a"] = { ...authority("MAP-A"), active: false };
        serverStates["source-b"] = authority("MAP-B");
        const stopped = await api.handleLivestockPenRequest({ params: { id: "42" }, query: { serverId: "source-a" } });
        expect(stopped.body.ok).toBe(false);
        expect(api.getDataForServer({ query: { serverId: "source-a" } })).toBeNull();
        expect(listTree(stoppedRoot)).toEqual([]);
        expect(listTree(liveRoot)).toEqual([]);

        const omitted = await api.handleLivestockPenRequest({ params: { id: "42" }, query: {} });
        expect(omitted.body.ok).toBe(true);
        expect(api.resolveServerIdForRequest({ query: {} })).toBe("source-b");
        expect(api.getDataForServer({ query: {} }).mapTitle).toBe("MAP-B");
        expect(listTree(stoppedRoot)).toEqual([]);
        expect(listTree(liveRoot).map((file) => path.basename(file))).toEqual(["requests.json"]);

        reset();
        servers.push(localServer("source-a", stoppedRoot, { enabled: false }), localServer("source-b", liveRoot));
        serverStates["source-a"] = authority("MAP-A");
        serverStates["source-b"] = { active: true, mergedData: null, exportIdentity: { careerId: "career-b" } };
        const disabled = await api.handleLivestockPenRequest({ params: { id: "42" }, query: { serverId: "source-a" } });
        expect(disabled.body.ok).toBe(false);
        expect(listTree(stoppedRoot)).toEqual([]);

        reset();
        const replicaRoot = tempDir();
        servers.push({
            id: "replica-source",
            name: "replica-source",
            mode: "local",
            enabled: true,
            localPath: replicaRoot,
            localSubFolder: "savegame3",
            replicaRemoteSlot: "savegame9",
            legacyJson: false,
        });
        serverStates["replica-source"] = {
            active: true,
            ingressKind: "replica",
            exportIdentity: { careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame3", replica: true },
        };
        fs.mkdirSync(path.join(replicaRoot, "savegame3"), { recursive: true });
        const replica = await api.handleLivestockPenRequest({ params: { id: "42" }, query: { serverId: "replica-source" } });
        expect(replica.body.ok).toBe(false);
        expect(listTree(replicaRoot)).toEqual([]);

        reset();
        const legacyRoot = tempDir();
        fs.mkdirSync(path.join(legacyRoot, "savegame3"), { recursive: true });
        servers.push(localServer("legacy-source", legacyRoot, { legacyJson: true }));
        serverStates["legacy-source"] = { active: true };
        const legacy = await api.handleLivestockPenRequest({ params: { id: "42" }, query: { serverId: "legacy-source" } });
        expect(legacy.body.ok).toBe(true);
        expect(listTree(legacyRoot)).toHaveLength(1);

        const badId = await api.handleLivestockPenRequest({ params: { id: "nope" }, query: { serverId: "legacy-source" } });
        expect(badId.status).toBe(400);
        expect(listTree(legacyRoot)).toHaveLength(1);
        expect(preferenceWrites).toEqual([]);
    });

    test("server list labels stay on the row that owns them", () => {
        const profile = tempDir();
        const slot = path.join(profile, "savegame3");
        fs.mkdirSync(slot, { recursive: true });
        fs.writeFileSync(path.join(slot, "careerSavegame.xml"), [
            "<careerSavegame>",
            "<savegameName>DEFAULT-LOCAL-CAREER</savegameName>",
            "<mapTitle>DEFAULT-LOCAL-MAP</mapTitle>",
            "</careerSavegame>",
        ].join(""));
        documentsRoot = profile;
        const dashboard = path.join(profile, "modSettings", "FS25_FarmDashboard");
        const careerFile = path.resolve(path.join(slot, "careerSavegame.xml"));
        reset();

        const defaultRow = api.projectConfiguredServerRow(
            { id: "default-local", name: "default-local", mode: "local", localSubFolder: "savegame3" },
            null
        );
        expect(defaultRow.savegameName).toBe("DEFAULT-LOCAL-CAREER");
        expect(defaultRow.mapTitle).toBe("DEFAULT-LOCAL-MAP");
        expect(careerReads).toEqual([careerFile]);

        careerReads.length = 0;
        const explicitDefault = api.projectConfiguredServerRow(
            { id: "default-path", name: "default-path", mode: "local", localSubFolder: "savegame3", localPath: dashboard },
            null
        );
        expect(explicitDefault.savegameName).toBe("DEFAULT-LOCAL-CAREER");
        expect(explicitDefault.mapTitle).toBe("DEFAULT-LOCAL-MAP");
        expect(careerReads).toEqual([careerFile]);

        careerReads.length = 0;
        const ftpRow = api.projectConfiguredServerRow(
            { id: "ftp", name: "ftp", mode: "ftp", localSubFolder: "savegame3" },
            null
        );
        expect(ftpRow.savegameName).toBeNull();
        expect(ftpRow.mapTitle).toBeNull();
        expect(careerReads).toEqual([]);

        const customRow = api.projectConfiguredServerRow(
            { id: "custom-local", name: "custom-local", mode: "local", localSubFolder: "savegame3", localPath: tempDir() },
            null
        );
        expect(customRow.savegameName).toBeNull();
        expect(customRow.mapTitle).toBeNull();
        expect(careerReads).toEqual([]);

        const replicaRow = api.projectConfiguredServerRow(
            { id: "replica", name: "replica", mode: "local", localSubFolder: "savegame3", replicaRemoteSlot: "savegame9" },
            { mergedData: { savegameName: "REPLICA-FARM", mapTitle: "REPLICA-MAP" } }
        );
        expect(replicaRow.savegameName).toBe("REPLICA-FARM");
        expect(replicaRow.mapTitle).toBe("REPLICA-MAP");
        expect(careerReads).toEqual([]);

        const authorityRow = api.projectConfiguredServerRow(
            { id: "authority", name: "authority", mode: "local", localSubFolder: "savegame3" },
            { exportIdentity: { replica: true, careerId: "career-a" }, configWarning: null }
        );
        expect(authorityRow.savegameName).toBe("DEFAULT-LOCAL-CAREER");
        expect(authorityRow.mapTitle).toBe("DEFAULT-LOCAL-MAP");
        expect(authorityRow.id).toBe("authority");
        expect(authorityRow.name).toBe("authority");

        careerReads.length = 0;
        const readyRow = api.projectConfiguredServerRow(
            { id: "ready", name: "ready", mode: "local", localSubFolder: "savegame3" },
            { mergedData: { savegameName: "OWN-FARM", mapTitle: "OWN-MAP" } }
        );
        expect(readyRow.savegameName).toBe("OWN-FARM");
        expect(readyRow.mapTitle).toBe("OWN-MAP");
        expect(careerReads).toEqual([]);
    });

    test("malformed explicit server ids do not write or borrow another source", async () => {
        const root = tempDir();
        fs.mkdirSync(path.join(root, "savegame3"), { recursive: true });
        documentsRoot = root;
        const writes = [];
        const original = fileCommit.writeJsonAtomicSync;
        fileCommit.writeJsonAtomicSync = function (destination, document) {
            writes.push(destination);
            return original.call(fileCommit, destination, document);
        };
        try {
            reset();
            servers.push(localServer("source-a", root));
            serverStates["source-a"] = authority("MAP-A");
            const shapes = [
                { serverId: null },
                { serverId: undefined },
                { serverId: ["source-a"] },
                { serverId: { id: "source-a" } },
                { serverId: true },
            ];
            for (const query of shapes) {
                writes.length = 0;
                const handled = await api.handleLivestockPenRequest({ params: { id: "42" }, query });
                expect(handled).toEqual({ status: 200, body: { ok: false } });
                expect(api.resolveServerIdForRequest({ query })).toBeNull();
                expect(api.getDataForServer({ query })).toBeNull();
                expect(writes).toEqual([]);
                expect(listTree(root)).toEqual([]);
                expect(preferenceWrites).toEqual([]);
            }
            writes.length = 0;
            const omitted = await api.handleLivestockPenRequest({ params: { id: "42" }, query: {} });
            expect(omitted.body.ok).toBe(true);
            expect(writes).toHaveLength(1);
            expect(listTree(root)).toHaveLength(1);
            writes.length = 0;
            const named = await api.handleLivestockPenRequest({ params: { id: "42" }, query: { serverId: "source-a" } });
            expect(named.body.ok).toBe(true);
            expect(writes).toHaveLength(1);
        } finally {
            fileCommit.writeJsonAtomicSync = original;
        }
    });

    test("a selected replica row does not read the default career file", () => {
        const profile = tempDir();
        const slot = path.join(profile, "savegame3");
        fs.mkdirSync(slot, { recursive: true });
        fs.writeFileSync(path.join(slot, "careerSavegame.xml"), "<careerSavegame><savegameName>DEFAULT-LOCAL-CAREER</savegameName><mapTitle>DEFAULT-LOCAL-MAP</mapTitle></careerSavegame>");
        documentsRoot = profile;
        reset();
        listConfig.push(
            { id: "SELECTED-REPLICA", name: "SELECTED-REPLICA", mode: "local", localSubFolder: "savegame3" },
            { id: "AUTHORITY-INCIDENTAL-REPLICA-METADATA", name: "AUTHORITY-INCIDENTAL-REPLICA-METADATA", mode: "local", localSubFolder: "savegame3" },
            { id: "CONFIG-REPLICA", name: "CONFIG-REPLICA", mode: "local", localSubFolder: "savegame3", replicaRemoteSlot: "savegame9" },
            { id: "REGISTRATION-REPLICA", name: "REGISTRATION-REPLICA", mode: "local", localSubFolder: "savegame3", replicaRegistration: { remoteSlot: "savegame9" } },
            { id: "SOURCEKEY-REPLICA", name: "SOURCEKEY-REPLICA", mode: "local", localSubFolder: "savegame3", sourceKey: "replica:profile:source" }
        );
        serverStates["SELECTED-REPLICA"] = { ingressKind: "replica" };
        serverStates["AUTHORITY-INCIDENTAL-REPLICA-METADATA"] = { exportIdentity: { replica: true, careerId: "career-a" } };
        const rows = api.configuredServerList();
        const selected = rows.find((row) => row.id === "SELECTED-REPLICA");
        expect(selected.savegameName).toBeNull();
        expect(selected.mapTitle).toBeNull();
        expect(careerReads.some((file) => file.includes("SELECTED-REPLICA"))).toBe(false);
        expect(careerReads).toEqual([path.resolve(path.join(slot, "careerSavegame.xml"))]);
        const authority = rows.find((row) => row.id === "AUTHORITY-INCIDENTAL-REPLICA-METADATA");
        expect(authority.savegameName).toBe("DEFAULT-LOCAL-CAREER");
        expect(authority.mapTitle).toBe("DEFAULT-LOCAL-MAP");
        const configured = rows.find((row) => row.id === "CONFIG-REPLICA");
        expect(configured.savegameName).toBeNull();
        expect(configured.mapTitle).toBeNull();
        const registered = rows.find((row) => row.id === "REGISTRATION-REPLICA");
        expect(registered.savegameName).toBeNull();
        expect(registered.mapTitle).toBeNull();
        const keyed = rows.find((row) => row.id === "SOURCEKEY-REPLICA");
        expect(keyed.savegameName).toBeNull();
        expect(keyed.mapTitle).toBeNull();
        expect(careerReads).toEqual([path.resolve(path.join(slot, "careerSavegame.xml"))]);
    });
});
