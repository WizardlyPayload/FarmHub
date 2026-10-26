"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");
const mockFtp = { files: new Map(), paths: [], targets: [], closed: 0, opened: 0, rejectStream: false, beforeDownload: null };
jest.mock("basic-ftp", () => ({
    Client: class {
        constructor() { this.ftp = { verbose: false }; mockFtp.opened += 1; }
        async access() {}
        async downloadTo(local, remote) {
            if (typeof mockFtp.beforeDownload === "function") await mockFtp.beforeDownload(remote);
            mockFtp.paths.push(remote);
            mockFtp.targets.push(local && typeof local.write === "function" ? "stream" : "path");
            if (mockFtp.rejectStream && local && typeof local.write === "function") {
                throw new Error("transfer failed before any bytes");
            }
            const body = mockFtp.files.get(remote);
            if (!body) throw new Error("missing");
            if (typeof mockFtp.beforeWrite === "function") mockFtp.beforeWrite(remote);
            if (local && typeof local.write === "function") {
                await new Promise((resolve, reject) => {
                    local.on("error", reject);
                    local.end(Buffer.from(body), resolve);
                });
                return;
            }
            require("fs").writeFileSync(local, body);
        }
        close() { mockFtp.closed += 1; }
    },
}));
const { encodeEnvelope } = require("../exportEnvelope");
const { readResourcePayloadSync } = require("../exportIngress");
const livestockDetail = require("../livestockDetail");

function tempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-resource-"));
}

function envelope(payload, sequence, sessionId, careerId) {
    return encodeEnvelope(JSON.stringify(payload), {
        careerId: careerId || "career-a",
        sessionId,
        publicationSequence: sequence,
        exportGeneration: 0,
        simulationTimeMs: 10,
    });
}

function routeXml(sessionId) {
    return `<farmDashboardRoute schema="1" careerId="career-a" sessionId="${sessionId}" publicationSequence="10" slot="a" persistence="saved" sourceSlot="savegame3"/>`;
}

function localServer(root, extra) {
    return Object.assign({
        id: "r1",
        mode: "local",
        localPath: root,
        localSubFolder: "savegame3",
        legacyJson: false,
    }, extra || {});
}

function readLocal(root, id, state) {
    return livestockDetail.read({
        req: { params: { id } },
        resolveServerIdForRequest: () => "r1",
        servers: [localServer(root)],
        serverStates: {
            r1: Object.assign({
                userDataPath: root,
                exportIdentity: { sourceId: "r1", careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame3" },
            }, state || {}),
        },
        getFs25DocumentsRoot: () => root,
    });
}

describe("selected XML resources", () => {
    test("R01 leftover JSON does not replace the modern index or detail", async () => {
        const root = tempDir();
        const slot = path.join(root, "savegame3");
        const pen = "cow.xml:42";
        const resourceId = livestockDetail.resourceIdForPen(pen);
        expect(resourceId).toBe("cow_2Exml_3A42");
        fs.mkdirSync(path.join(slot, "career-a", "resources", "dirtyPens"), { recursive: true });
        fs.mkdirSync(path.join(slot, "career-a", "resources", "penDetail", resourceId), { recursive: true });
        fs.writeFileSync(path.join(slot, "active.xml"), routeXml("session-a"));
        fs.writeFileSync(path.join(slot, "dirtyPens.json"), JSON.stringify({
            schemaVersion: 1, idScheme: "composite-v1", updatedAt: 999, animalMode: "base",
            pens: [{ id: "old.xml:42", ts: 999, animalCount: 1 }],
        }));
        fs.writeFileSync(path.join(slot, "career-a", "resources", "dirtyPens", "slot-a.xml"), envelope({
            schemaVersion: 1, idScheme: "composite-v1", updatedAt: 200, animalMode: "base",
            pens: [{ id: pen, ts: 200, animalCount: 1 }],
        }, 1, "session-a"));
        fs.writeFileSync(path.join(slot, "career-a", "resources", "penDetail", resourceId, "slot-a.xml"), envelope({
            schemaVersion: 1, idScheme: "composite-v1", penId: pen, placeableId: 42, generatedAt: 200, mode: "base",
            animals: [{ id: 4242, uniqueId: "4242" }],
        }, 1, "session-a"));
        const result = await readLocal(root, "42");
        expect(result.penKey).toBe(pen);
        expect(result.dirtyAt).toBe(200);
        expect(result.detail.animals[0].id).toBe(4242);
    });

    test("R02 an older session with a higher sequence does not win", async () => {
        const root = tempDir();
        const slot = path.join(root, "savegame3");
        const folder = path.join(slot, "career-a", "resources", "penDetail", "42");
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(slot, "active.xml"), routeXml("session-a"));
        fs.writeFileSync(path.join(folder, "slot-a.xml"), envelope({
            schemaVersion: 1, idScheme: "integer-v1", penId: "42", placeableId: 42, animals: [{ id: 101, uniqueId: "101" }],
        }, 1, "session-a"));
        fs.writeFileSync(path.join(folder, "slot-b.xml"), envelope({
            schemaVersion: 1, idScheme: "integer-v1", penId: "42", placeableId: 42, animals: [{ id: 909, uniqueId: "909" }],
        }, 9, "session-old"));
        expect(readResourcePayloadSync(slot, "career-a", "penDetail", "42").animals[0].id).toBe(101);
        const result = await readLocal(root, "42");
        expect(result.detail.animals[0].id).toBe(101);
    });

    test("R03 disabled legacy mode does not read a JSON detail", async () => {
        const root = tempDir();
        const slot = path.join(root, "savegame3", "details");
        fs.mkdirSync(slot, { recursive: true });
        fs.writeFileSync(path.join(slot, "animals_42.json"), JSON.stringify({
            schemaVersion: 1, penId: "42", animals: [{ id: 999, uniqueId: "999" }],
        }));
        const result = await readLocal(root, "42");
        expect(result).toBeNull();
    });

    test("a modern local detail and an explicit legacy detail both stay available", async () => {
        const root = tempDir();
        const slot = path.join(root, "savegame3");
        fs.mkdirSync(path.join(slot, "career-a", "resources", "penDetail", "42"), { recursive: true });
        fs.writeFileSync(path.join(slot, "active.xml"), routeXml("session-a"));
        fs.writeFileSync(path.join(slot, "career-a", "resources", "penDetail", "42", "slot-b.xml"), envelope({
            schemaVersion: 1, idScheme: "integer-v1", penId: "42", placeableId: 42, animals: [{ id: 707, uniqueId: "707" }],
        }, 1, "session-a"));
        const modern = await readLocal(root, "42");
        expect(modern.detail.animals[0].id).toBe(707);

        const legacyRoot = tempDir();
        const legacySlot = path.join(legacyRoot, "savegame3");
        fs.mkdirSync(path.join(legacySlot, "details"), { recursive: true });
        fs.writeFileSync(path.join(legacySlot, "details", "animals_42.json"), JSON.stringify({
            schemaVersion: 1, penId: "42", animals: [{ id: 42, uniqueId: "42" }],
        }));
        const legacy = await livestockDetail.read({
            req: { params: { id: "42" } },
            resolveServerIdForRequest: () => "r1",
            servers: [localServer(legacyRoot, { legacyJson: true })],
            serverStates: { r1: { userDataPath: legacyRoot } },
        });
        expect(legacy.detail.animals[0].id).toBe(42);
    });

    test("R04 and R05 fetch both XML slots and keep the current higher sequence", async () => {
        const userData = tempDir();
        const base = "fixture/modSettings/FS25_FarmDashboard/savegame3";
        mockFtp.files = new Map([
            [`${base}/career-a/resources/penDetail/42/slot-a.xml`, envelope({ schemaVersion: 1, idScheme: "integer-v1", penId: "42", placeableId: 42, animals: [{ id: 301, uniqueId: "301" }] }, 1, "session-a")],
            [`${base}/career-a/resources/penDetail/42/slot-b.xml`, envelope({ schemaVersion: 1, idScheme: "integer-v1", penId: "42", placeableId: 42, animals: [{ id: 302, uniqueId: "302" }] }, 2, "session-a")],
            [`${base}/career-a/resources/dirtyPens/slot-a.xml`, envelope({ schemaVersion: 1, idScheme: "integer-v1", updatedAt: 111, animalMode: "base", pens: [{ id: "42", ts: 111, animalCount: 1 }] }, 1, "session-a")],
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, envelope({ schemaVersion: 1, idScheme: "integer-v1", updatedAt: 222, animalMode: "base", pens: [{ id: "42", ts: 222, animalCount: 1 }] }, 2, "session-a")],
        ]);
        mockFtp.paths = [];
        mockFtp.closed = 0;
        const srv = {
            id: "r1-ftp",
            mode: "ftp",
            ftpHost: "fixture-host",
            ftpBasePath: "fixture",
            localSubFolder: "savegame3",
            legacyJson: false,
        };
        const serverStates = {
            "r1-ftp": {
                userDataPath: userData,
                lastSaveSlot: "savegame3",
                exportIdentity: { sourceId: "r1-ftp", careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame3" },
            },
        };
        try {
            const detail = await livestockDetail.read({
                req: { params: { id: "42" } },
                resolveServerIdForRequest: () => "r1-ftp",
                servers: [srv],
                serverStates,
            });
            expect(detail.detail.animals[0].id).toBe(302);
            expect(mockFtp.paths.some((item) => item.endsWith("details/animals_42.json"))).toBe(false);
            expect(mockFtp.paths).toEqual(expect.arrayContaining([
                `${base}/career-a/resources/penDetail/42/slot-a.xml`,
                `${base}/career-a/resources/penDetail/42/slot-b.xml`,
            ]));
            mockFtp.paths = [];
            const refreshed = await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates });
            const index = await livestockDetail.readDirtyIndex(srv, { userDataPath: userData, serverStates });
            expect(refreshed).toBe(true);
            expect(index.ts).toBe(222);
            expect(mockFtp.paths).toEqual([
                `${base}/career-a/resources/dirtyPens/slot-a.xml`,
                `${base}/career-a/resources/dirtyPens/slot-b.xml`,
            ]);
            expect(mockFtp.closed).toBeGreaterThan(0);
        } finally {
            mockFtp.files = new Map();
        }
    });

    test("the main poll uses the modern refresh and the watcher follows the resource directory", async () => {
        const main = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");
        const start = main.indexOf("// Modern sources refresh both resource slots");
        const end = main.indexOf("if (srv.legacyJson === true)", start);
        const userData = tempDir();
        const base = "fixture/modSettings/FS25_FarmDashboard/savegame3";
        const body = envelope({
            schemaVersion: 1, idScheme: "integer-v1", updatedAt: 222, animalMode: "base", pens: [{ id: "42", ts: 222, animalCount: 1 }],
        }, 2, "session-a");
        const paths = [];
        const context = {
            srv: { id: "r1-ftp", legacyJson: false, mode: "ftp", ftpHost: "fixture-host", ftpBasePath: "fixture", localSubFolder: "savegame3" },
            client: {
                async downloadTo(local, remote) {
                    paths.push(remote);
                    if (local && typeof local.write === "function") {
                        await new Promise((resolve, reject) => {
                            local.on("error", reject);
                            local.end(Buffer.from(body), resolve);
                        });
                        return;
                    }
                    fs.writeFileSync(local, body);
                },
            },
            userDataPath: userData,
            slotRemote: base,
            serverStates: {
                "r1-ftp": {
                    userDataPath: userData,
                    exportIdentity: { careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame3" },
                },
            },
            ftpPollGenerations: { "r1-ftp": 7 },
            gen: 7,
            livestockDetailModule: livestockDetail,
            safeDownload: async () => { throw new Error("legacy json was requested"); },
            path,
            console,
        };
        vm.createContext(context);
        await vm.runInContext(`(async () => { ${main.slice(start, end)} })()`, context);
        expect(paths).toEqual([
            `${base}/career-a/resources/dirtyPens/slot-a.xml`,
            `${base}/career-a/resources/dirtyPens/slot-b.xml`,
        ]);
        const slot = tempDir();
        fs.mkdirSync(slot, { recursive: true });
        fs.writeFileSync(path.join(slot, "active.xml"), routeXml("session-a"));
        const watchStart = main.indexOf("const dirtySlotDir = path.dirname(luaJsonPath)");
        const watched = vm.runInContext(
            main.slice(watchStart, main.indexOf("const closeIfStale", watchStart)) + "\ndirtyPensPath;",
            vm.createContext({
                luaJsonPath: path.join(slot, "data.json"),
                srv: { id: "r1", legacyJson: false },
                serverStates: {},
                livestockDetailModule: livestockDetail,
                path,
            }),
        );
        expect(watched).toBe(path.join(slot, "career-a", "resources", "dirtyPens"));
    });
});

function detailDoc(animalId, penId) {
    return {
        schemaVersion: 1,
        idScheme: "integer-v1",
        penId: String(penId),
        placeableId: Number(penId),
        generatedAt: 100,
        mode: "base",
        animals: [{ id: animalId, uniqueId: String(animalId) }],
    };
}

describe("resource binding rework", () => {
    test("R1-01 and R1-10 a disk session that disagrees with the selected identity is unavailable", async () => {
        const root = tempDir();
        const slot = path.join(root, "savegame3");
        const folder = path.join(slot, "career-a", "resources", "penDetail", "42");
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(slot, "active.xml"), routeXml("session-old"));
        fs.writeFileSync(path.join(folder, "slot-b.xml"), envelope(detailDoc(909, 42), 9, "session-old"));
        const result = await readLocal(root, "42");
        expect(result).toBeNull();

        const main = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");
        const start = main.indexOf("function getLivestockDetail");
        const end = main.indexOf("function requestLivestockDetail");
        const adapted = await vm.runInContext(`(${main.slice(start, end)})`, vm.createContext({
            livestockDetailModule: livestockDetail,
            resolveServerIdForRequest: () => "r1",
            getServersFromStore: () => [localServer(root)],
            serverStates: {
                r1: {
                    userDataPath: root,
                    exportIdentity: { careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame3" },
                },
            },
            getFs25DocumentsRoot: () => root,
        }))({ params: { id: "42" } });
        expect(adapted).toBeNull();
    });

    test("R1-02 and R1-03 reject a mismatched pen and an index stored as a detail", async () => {
        const root = tempDir();
        const slot = path.join(root, "savegame3");
        const folder = path.join(slot, "career-a", "resources", "penDetail", "42");
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(slot, "active.xml"), routeXml("session-a"));
        fs.writeFileSync(path.join(folder, "slot-a.xml"), envelope({
            schemaVersion: 1, idScheme: "integer-v1", penId: "99", placeableId: 99, animals: [{ id: 999, uniqueId: "999" }],
        }, 1, "session-a"));
        expect(await readLocal(root, "42")).toBeNull();
        fs.writeFileSync(path.join(folder, "slot-a.xml"), envelope({
            schemaVersion: 1, idScheme: "integer-v1", updatedAt: 100, animalMode: "base", pens: [{ id: "42", ts: 100, animalCount: 1 }],
        }, 1, "session-a"));
        expect(await readLocal(root, "42")).toBeNull();
    });

    test("R1-04 omitted legacy does not read leftover JSON", async () => {
        const root = tempDir();
        const slot = path.join(root, "savegame3");
        fs.mkdirSync(path.join(slot, "details"), { recursive: true });
        fs.writeFileSync(path.join(slot, "details", "animals_42.json"), JSON.stringify(detailDoc(999, 42)));
        const result = await livestockDetail.read({
            req: { params: { id: "42" } },
            resolveServerIdForRequest: () => "r1",
            servers: [localServer(root, { legacyJson: undefined })],
            serverStates: {
                r1: {
                    userDataPath: root,
                    exportIdentity: { careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame3" },
                },
            },
        });
        expect(result).toBeNull();
    });

    test("R1-05 equal sequence with a different simulation clock is a conflict", () => {
        const root = tempDir();
        const slot = path.join(root, "savegame3");
        const folder = path.join(slot, "career-a", "resources", "penDetail", "42");
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(slot, "active.xml"), routeXml("session-a"));
        const payload = JSON.stringify(detailDoc(42, 42));
        const fields = { careerId: "career-a", sessionId: "session-a", publicationSequence: 2, exportGeneration: 0 };
        fs.writeFileSync(path.join(folder, "slot-a.xml"), encodeEnvelope(payload, { ...fields, simulationTimeMs: 10 }));
        fs.writeFileSync(path.join(folder, "slot-b.xml"), encodeEnvelope(payload, { ...fields, simulationTimeMs: 999 }));
        expect(readResourcePayloadSync(slot, "career-a", "penDetail", "42", { sessionId: "session-a" })).toBeNull();
    });

    test("R1-11 an unsupported index schema is unavailable", async () => {
        const root = tempDir();
        const slot = path.join(root, "savegame3");
        fs.mkdirSync(path.join(slot, "career-a", "resources", "dirtyPens"), { recursive: true });
        fs.writeFileSync(path.join(slot, "active.xml"), routeXml("session-a"));
        fs.writeFileSync(path.join(slot, "career-a", "resources", "dirtyPens", "slot-a.xml"), envelope({
            schemaVersion: 999, idScheme: "integer-v1", updatedAt: 900, animalMode: "base", pens: [{ id: "42", ts: 900, animalCount: 1 }],
        }, 1, "session-a"));
        const index = await livestockDetail.readDirtyIndex(localServer(root), {
            userDataPath: root,
            serverStates: { r1: { exportIdentity: { careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame3" } } },
        });
        expect(index).toBeNull();
    });

    test("an empty pen and an exact duplicate pair stay valid", () => {
        const root = tempDir();
        const slot = path.join(root, "savegame3");
        const folder = path.join(slot, "career-a", "resources", "penDetail", "42");
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(slot, "active.xml"), routeXml("session-a"));
        const empty = JSON.stringify({ ...detailDoc(0, 42), animals: [] });
        fs.writeFileSync(path.join(folder, "slot-a.xml"), envelope(JSON.parse(empty), 1, "session-a"));
        fs.writeFileSync(path.join(folder, "slot-b.xml"), envelope(JSON.parse(empty), 1, "session-a"));
        const payload = readResourcePayloadSync(slot, "career-a", "penDetail", "42", { sessionId: "session-a" });
        expect(payload.animals).toEqual([]);
    });

    test("UTF-8 pen keys retain short ids and give long composite paths stable bounded ids", () => {
        expect(livestockDetail.resourceIdForPen("é")).toBe("_C3_A9");
        expect(livestockDetail.resourceIdForPen("\u0001")).toBe("_01");
        expect(livestockDetail.resourceIdForPen("cow.xml:42")).toBe("cow_2Exml_3A42");
        expect(livestockDetail.resourceIdForPen("x".repeat(65))).toBe("H_CCD0934742E77627E79456F984491465");
        expect(livestockDetail.resourceIdForPen("x".repeat(66))).not.toBe(livestockDetail.resourceIdForPen("x".repeat(65)));
        expect(livestockDetail.resourceIdForPen("C:/Users/Graham/Documents/My Games/FarmingSimulator2025/mods/FS25_cowshedPack/calfShed.xml:517"))
            .toBe("H_322E8B68FEC6857E76EE745CBBFA04C2");
        expect(livestockDetail.resourceIdForPen("")).toBeNull();
    });

    test("R1-06 a host and slot change does not keep the previous index", async () => {
        const userData = tempDir();
        const base = "fixture/modSettings/FS25_FarmDashboard/savegame3";
        const indexBody = envelope({
            schemaVersion: 1, idScheme: "integer-v1", updatedAt: 222, animalMode: "base", pens: [{ id: "42", ts: 222, animalCount: 1 }],
        }, 2, "session-a");
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-a.xml`, indexBody],
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, indexBody],
        ]);
        mockFtp.paths = [];
        mockFtp.beforeWrite = null;
        const srv = {
            id: "r1-ftp", mode: "ftp", ftpHost: "host-a", ftpBasePath: "fixture", localSubFolder: "savegame3", legacyJson: false,
        };
        const serverStates = {
            "r1-ftp": {
                userDataPath: userData,
                lastSaveSlot: "savegame3",
                exportIdentity: { careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame3" },
            },
        };
        expect(await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates })).toBe(true);
        expect((await livestockDetail.readDirtyIndex(srv, { userDataPath: userData, serverStates })).ts).toBe(222);
        const downloads = mockFtp.paths.length;
        srv.ftpHost = "host-b";
        srv.localSubFolder = "savegame4";
        serverStates["r1-ftp"].lastSaveSlot = "savegame4";
        expect(await livestockDetail.readDirtyIndex(srv, { userDataPath: userData, serverStates })).toBeNull();
        expect(mockFtp.paths.length).toBe(downloads);
    });

    test("R1-07 a corrupt download keeps the last validated index", async () => {
        const userData = tempDir();
        const base = "fixture/modSettings/FS25_FarmDashboard/savegame3";
        const indexBody = envelope({
            schemaVersion: 1, idScheme: "integer-v1", updatedAt: 222, animalMode: "base", pens: [{ id: "42", ts: 222, animalCount: 1 }],
        }, 2, "session-a");
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-a.xml`, indexBody],
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, indexBody],
        ]);
        const srv = {
            id: "r1-ftp", mode: "ftp", ftpHost: "fixture-host", ftpBasePath: "fixture", localSubFolder: "savegame3", legacyJson: false,
        };
        const serverStates = {
            "r1-ftp": {
                userDataPath: userData,
                lastSaveSlot: "savegame3",
                exportIdentity: { careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame3" },
            },
        };
        expect(await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates })).toBe(true);
        mockFtp.files.set(`${base}/career-a/resources/dirtyPens/slot-a.xml`, "broken resource");
        mockFtp.files.set(`${base}/career-a/resources/dirtyPens/slot-b.xml`, "broken resource");
        expect(await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates })).toBe(false);
        expect((await livestockDetail.readDirtyIndex(srv, { userDataPath: userData, serverStates })).ts).toBe(222);
    });

    test("R1-08 a second read reuses the validated detail", async () => {
        const userData = tempDir();
        const base = "fixture/modSettings/FS25_FarmDashboard/savegame3";
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, envelope({
                schemaVersion: 1, idScheme: "integer-v1", updatedAt: 222, animalMode: "base", pens: [{ id: "42", ts: 222, animalCount: 1 }],
            }, 2, "session-a")],
            [`${base}/career-a/resources/penDetail/42/slot-a.xml`, envelope(detailDoc(301, 42), 1, "session-a")],
            [`${base}/career-a/resources/penDetail/42/slot-b.xml`, envelope(detailDoc(302, 42), 2, "session-a")],
        ]);
        mockFtp.paths = [];
        mockFtp.beforeWrite = null;
        const srv = {
            id: "r1-ftp", mode: "ftp", ftpHost: "fixture-host", ftpBasePath: "fixture", localSubFolder: "savegame3", legacyJson: false,
        };
        const serverStates = {
            "r1-ftp": {
                userDataPath: userData,
                lastSaveSlot: "savegame3",
                exportIdentity: { careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame3" },
            },
        };
        await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates });
        mockFtp.paths = [];
        const first = await livestockDetail.read({
            req: { params: { id: "42" } },
            resolveServerIdForRequest: () => "r1-ftp",
            servers: [srv],
            serverStates,
        });
        const afterFirst = mockFtp.paths.length;
        const second = await livestockDetail.read({
            req: { params: { id: "42" } },
            resolveServerIdForRequest: () => "r1-ftp",
            servers: [srv],
            serverStates,
        });
        expect(first.detail.animals[0].id).toBe(302);
        expect(second.detail.animals[0].id).toBe(302);
        expect(second.fromCache).toBe(true);
        expect(afterFirst).toBe(2);
        expect(mockFtp.paths.length).toBe(afterFirst);
    });

    test("R1-09 a session change during the second slot discards the first document", async () => {
        const userData = tempDir();
        const base = "fixture/modSettings/FS25_FarmDashboard/savegame3";
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, envelope({
                schemaVersion: 1, idScheme: "integer-v1", updatedAt: 222, animalMode: "base", pens: [{ id: "42", ts: 222, animalCount: 1 }],
            }, 2, "session-a")],
            [`${base}/career-a/resources/penDetail/42/slot-a.xml`, envelope(detailDoc(301, 42), 1, "session-a")],
            [`${base}/career-a/resources/penDetail/42/slot-b.xml`, envelope(detailDoc(302, 42), 2, "session-a")],
        ]);
        mockFtp.beforeWrite = (remote) => {
            if (String(remote).endsWith("slot-b.xml") && String(remote).includes("penDetail")) {
                serverStates["r1-ftp"].exportIdentity.sessionId = "session-new";
            }
        };
        const srv = {
            id: "r1-ftp", mode: "ftp", ftpHost: "fixture-host", ftpBasePath: "fixture", localSubFolder: "savegame3", legacyJson: false,
        };
        const serverStates = {
            "r1-ftp": {
                userDataPath: userData,
                lastSaveSlot: "savegame3",
                exportIdentity: { careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame3" },
            },
        };
        await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates });
        const result = await livestockDetail.read({
            req: { params: { id: "42" } },
            resolveServerIdForRequest: () => "r1-ftp",
            servers: [srv],
            serverStates,
        });
        mockFtp.beforeWrite = null;
        expect(serverStates["r1-ftp"].exportIdentity.sessionId).toBe("session-new");
        expect(result).toBeNull();
    });
});

function ftpSrv(userData) {
    return {
        srv: {
            id: "r1-ftp", mode: "ftp", ftpHost: "fixture-host", ftpBasePath: "fixture", localSubFolder: "savegame3", legacyJson: false,
        },
        serverStates: {
            "r1-ftp": {
                userDataPath: userData,
                lastSaveSlot: "savegame3",
                active: true,
                ingressGeneration: 1,
                exportIdentity: { careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame3" },
            },
        },
    };
}

describe("resource recovery and ownership", () => {
    const base = "fixture/modSettings/FS25_FarmDashboard/savegame3";

    test("R2-01 a conflicting detail keeps the last validated animal", async () => {
        const userData = tempDir();
        const { srv, serverStates } = ftpSrv(userData);
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, envelope({
                schemaVersion: 1, idScheme: "integer-v1", updatedAt: 222, animalMode: "base", pens: [{ id: "42", ts: 222, animalCount: 1 }],
            }, 2, "session-a")],
            [`${base}/career-a/resources/penDetail/42/slot-a.xml`, envelope(detailDoc(301, 42), 1, "session-a")],
            [`${base}/career-a/resources/penDetail/42/slot-b.xml`, envelope(detailDoc(302, 42), 2, "session-a")],
        ]);
        mockFtp.rejectStream = false;
        await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates });
        const first = await livestockDetail.read({
            req: { params: { id: "42" } }, resolveServerIdForRequest: () => "r1-ftp", servers: [srv], serverStates,
        });
        expect(first.detail.animals[0].id).toBe(302);
        livestockDetail.bustDirtyIndexCache("r1-ftp");
        const fields = { careerId: "career-a", sessionId: "session-a", publicationSequence: 2, exportGeneration: 0 };
        mockFtp.files.set(`${base}/career-a/resources/penDetail/42/slot-a.xml`, encodeEnvelope(JSON.stringify(detailDoc(811, 42)), { ...fields, simulationTimeMs: 10 }));
        mockFtp.files.set(`${base}/career-a/resources/penDetail/42/slot-b.xml`, encodeEnvelope(JSON.stringify(detailDoc(822, 42)), { ...fields, simulationTimeMs: 10 }));
        const conflict = await livestockDetail.read({
            req: { params: { id: "42" } }, resolveServerIdForRequest: () => "r1-ftp", servers: [srv], serverStates,
        });
        expect(conflict.detail.animals[0].id).toBe(302);
        expect(conflict.fromCache).toBe(true);
        mockFtp.files = new Map();
        livestockDetail.bustDirtyIndexCache("r1-ftp");
        const offline = await livestockDetail.read({
            req: { params: { id: "42" } }, resolveServerIdForRequest: () => "r1-ftp", servers: [srv], serverStates,
        });
        expect(offline.detail.animals[0].id).toBe(302);
        expect(offline.fromCache).toBe(true);
    });

    test("R2-02 an older index does not replace the accepted sequence", async () => {
        const userData = tempDir();
        const { srv, serverStates } = ftpSrv(userData);
        const current = envelope({
            schemaVersion: 1, idScheme: "integer-v1", updatedAt: 222, animalMode: "base", pens: [{ id: "42", ts: 222, animalCount: 1 }],
        }, 2, "session-a");
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-a.xml`, current],
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, current],
        ]);
        expect(await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates })).toBe(true);
        const older = envelope({
            schemaVersion: 1, idScheme: "integer-v1", updatedAt: 91, animalMode: "base", pens: [{ id: "42", ts: 91, animalCount: 1 }],
        }, 1, "session-a");
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-a.xml`, older],
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, older],
        ]);
        expect(await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates })).toBe(false);
        const index = await livestockDetail.readDirtyIndex(srv, { userDataPath: userData, serverStates });
        expect(index.ts).toBe(222);
        expect(index.resourceSequence).toBe(2);
    });

    test("R2-03 replacing the state object supersedes the in-flight read", async () => {
        const userData = tempDir();
        const { srv, serverStates } = ftpSrv(userData);
        mockFtp.files = new Map([
            [`${base}/career-a/resources/penDetail/42/slot-a.xml`, envelope(detailDoc(301, 42), 1, "session-a")],
            [`${base}/career-a/resources/penDetail/42/slot-b.xml`, envelope(detailDoc(302, 42), 2, "session-a")],
        ]);
        mockFtp.beforeWrite = (remote) => {
            if (String(remote).includes("penDetail") && String(remote).endsWith("slot-b.xml")) {
                const previous = serverStates["r1-ftp"];
                serverStates["r1-ftp"] = Object.assign({}, previous, {
                    exportIdentity: Object.assign({}, previous.exportIdentity),
                });
            }
        };
        const result = await livestockDetail.read({
            req: { params: { id: "42" } }, resolveServerIdForRequest: () => "r1-ftp", servers: [srv], serverStates,
        });
        mockFtp.beforeWrite = null;
        expect(result).toBeNull();
    });

    test("R2-04 a failed stream transfer does not retry by filesystem path", async () => {
        const userData = tempDir();
        const { srv, serverStates } = ftpSrv(userData);
        mockFtp.files = new Map([
            [`${base}/career-a/resources/penDetail/42/slot-b.xml`, envelope(detailDoc(302, 42), 2, "session-a")],
        ]);
        mockFtp.targets = [];
        mockFtp.rejectStream = true;
        const result = await livestockDetail.read({
            req: { params: { id: "42" } }, resolveServerIdForRequest: () => "r1-ftp", servers: [srv], serverStates,
        });
        mockFtp.rejectStream = false;
        expect(result).toBeNull();
        expect(mockFtp.targets.includes("path")).toBe(false);
        expect(mockFtp.targets.length).toBeGreaterThan(0);
    });

    test("R2-08 an invalid newer detail does not hide the valid side", async () => {
        const root = tempDir();
        const slot = path.join(root, "savegame3");
        const folder = path.join(slot, "career-a", "resources", "penDetail", "42");
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(slot, "active.xml"), routeXml("session-a"));
        fs.writeFileSync(path.join(folder, "slot-a.xml"), envelope(detailDoc(707, 42), 1, "session-a"));
        fs.writeFileSync(path.join(folder, "slot-b.xml"), envelope({
            schemaVersion: 999, idScheme: "integer-v1", penId: "42", placeableId: 42, animals: [{ id: 909, uniqueId: "909" }],
        }, 2, "session-a"));
        const result = await readLocal(root, "42");
        expect(result.detail.animals[0].id).toBe(707);
    });

    test("R2-07 cancellation during publication does not promote a second file or report success", async () => {
        const userData = tempDir();
        const { srv, serverStates } = ftpSrv(userData);
        const body = envelope({
            schemaVersion: 1, idScheme: "integer-v1", updatedAt: 222, animalMode: "base", pens: [{ id: "42", ts: 222, animalCount: 1 }],
        }, 2, "session-a");
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-a.xml`, body],
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, body],
        ]);
        const realRename = fs.promises.rename.bind(fs.promises);
        const promotions = [];
        let allow = true;
        fs.promises.rename = async (from, to) => {
            const incoming = String(from).includes(".incoming");
            await realRename(from, to);
            if (incoming) {
                promotions.push(to);
                allow = false;
            }
        };
        try {
            const refreshed = await livestockDetail.ftpRefreshDirtyIndex(srv, {
                userDataPath: userData,
                serverStates,
                canCommit: () => allow,
            });
            expect(refreshed).toBe(false);
            expect(promotions.length).toBe(1);
        } finally {
            fs.promises.rename = realRename;
        }
    });

    test("R2-09 two refreshes share one pair operation", async () => {
        const userData = tempDir();
        const { srv, serverStates } = ftpSrv(userData);
        const body = envelope({
            schemaVersion: 1, idScheme: "integer-v1", updatedAt: 222, animalMode: "base", pens: [{ id: "42", ts: 222, animalCount: 1 }],
        }, 2, "session-a");
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-a.xml`, body],
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, body],
        ]);
        const settled = await Promise.allSettled([
            livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates }),
            livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates }),
        ]);
        expect(settled.map((item) => item.status)).toEqual(["fulfilled", "fulfilled"]);
        expect(settled.map((item) => item.value)).toEqual([true, true]);
    });

    test("R2-05 and R2-06 the dirty watcher retries a missing directory and handles errors", async () => {
        const root = tempDir();
        const missing = path.join(root, "career-a", "resources", "dirtyPens");
        const present = path.join(root, "career-b", "resources", "dirtyPens");
        fs.mkdirSync(present, { recursive: true });
        const handles = [];
        const fakeFs = {
            watch(target) {
                const listeners = {};
                const handle = {
                    on(event, fn) { listeners[event] = fn; },
                    close() { handle.closed = true; },
                    listeners,
                    target,
                };
                handles.push(handle);
                return handle;
            },
        };
        const state = { active: true };
        const ownedNow = () => state.active === true;
        await livestockDetail.reconcileDirtyWatch({
            state, desired: null, fsImpl: fakeFs, pathExists: async (target) => fs.existsSync(target), ownedNow, onEvent() {},
        });
        await livestockDetail.reconcileDirtyWatch({
            state, desired: missing, fsImpl: fakeFs, pathExists: async (target) => fs.existsSync(target), ownedNow, onEvent() {},
        });
        expect(state.dirtyPensWatcher).toBeFalsy();
        fs.mkdirSync(missing, { recursive: true });
        await livestockDetail.reconcileDirtyWatch({
            state, desired: missing, fsImpl: fakeFs, pathExists: async (target) => fs.existsSync(target), ownedNow, onEvent() {},
        });
        expect(state.dirtyPensWatcher).toBe(handles[0]);
        expect(typeof handles[0].listeners.error).toBe("function");
        await livestockDetail.reconcileDirtyWatch({
            state, desired: present, fsImpl: fakeFs, pathExists: async (target) => fs.existsSync(target), ownedNow, onEvent() {},
        });
        expect(handles[0].closed).toBe(true);
        expect(state.dirtyPensWatcher).toBe(handles[1]);
        expect(typeof handles[1].listeners.error).toBe("function");
        expect(handles.filter((handle) => !handle.closed)).toHaveLength(1);
    });
});

function indexDoc(ts, pens) {
    return {
        schemaVersion: 1,
        idScheme: "integer-v1",
        updatedAt: ts,
        animalMode: "base",
        pens: (pens || ["42"]).map((id) => ({ id, ts, animalCount: 1 })),
    };
}

function selectionNamed(userData, kind) {
    return fs.readdirSync(userData)
        .filter((name) => name.startsWith("livestock_sel_") && name.includes(`_${kind}`))
        .map((name) => path.join(userData, name));
}

describe("resource commitment and admission", () => {
    const base = "fixture/modSettings/FS25_FarmDashboard/savegame3";

    test("R3-01 an equal-sequence index conflict keeps the committed bytes", async () => {
        const userData = tempDir();
        const { srv, serverStates } = ftpSrv(userData);
        const current = envelope(indexDoc(222), 2, "session-a");
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-a.xml`, current],
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, current],
        ]);
        expect(await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates })).toBe(true);
        const savedPath = selectionNamed(userData, "dirtyPens")[0];
        const before = fs.readFileSync(savedPath);
        const changed = envelope(indexDoc(999), 2, "session-a");
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-a.xml`, changed],
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, changed],
        ]);
        expect(await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates })).toBe(false);
        expect(fs.readFileSync(savedPath).equals(before)).toBe(true);
        const index = await livestockDetail.readDirtyIndex(srv, { userDataPath: userData, serverStates });
        expect(index.ts).toBe(222);
        expect(index.resourceSequence).toBe(2);
    });

    test("R3-02 an equal-sequence detail conflict keeps animal 302", async () => {
        const userData = tempDir();
        const { srv, serverStates } = ftpSrv(userData);
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, envelope(indexDoc(222), 2, "session-a")],
            [`${base}/career-a/resources/penDetail/42/slot-b.xml`, envelope(detailDoc(302, 42), 2, "session-a")],
        ]);
        await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates });
        const first = await livestockDetail.read({
            req: { params: { id: "42" } }, resolveServerIdForRequest: () => "r1-ftp", servers: [srv], serverStates,
        });
        expect(first.detail.animals[0].id).toBe(302);
        const savedPath = selectionNamed(userData, "penDetail")[0];
        const before = fs.readFileSync(savedPath);
        livestockDetail.bustDirtyIndexCache("r1-ftp");
        mockFtp.files.set(`${base}/career-a/resources/penDetail/42/slot-a.xml`, envelope(detailDoc(999, 42), 2, "session-a"));
        mockFtp.files.set(`${base}/career-a/resources/penDetail/42/slot-b.xml`, envelope(detailDoc(999, 42), 2, "session-a"));
        const conflict = await livestockDetail.read({
            req: { params: { id: "42" } }, resolveServerIdForRequest: () => "r1-ftp", servers: [srv], serverStates,
        });
        expect(conflict.detail.animals[0].id).toBe(302);
        expect(conflict.fromCache).toBe(true);
        expect(fs.readFileSync(savedPath).equals(before)).toBe(true);
    });

    test("R3-03 a cold cache file is not trusted from its filename", async () => {
        const userData = tempDir();
        const { srv, serverStates } = ftpSrv(userData);
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, envelope(indexDoc(222), 2, "session-a")],
            [`${base}/career-a/resources/penDetail/42/slot-b.xml`, envelope(detailDoc(302, 42), 2, "session-a")],
        ]);
        await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates });
        await livestockDetail.read({
            req: { params: { id: "42" } }, resolveServerIdForRequest: () => "r1-ftp", servers: [srv], serverStates,
        });
        const savedPath = selectionNamed(userData, "penDetail")[0];
        fs.writeFileSync(savedPath, JSON.stringify({
            payload: detailDoc(909, 99),
            record: { careerId: "foreign-career", sessionId: "foreign-session", publicationSequence: 2 },
        }));
        livestockDetail.bustDirtyIndexCache("r1-ftp");
        mockFtp.files = new Map();
        const result = await livestockDetail.read({
            req: { params: { id: "42" } }, resolveServerIdForRequest: () => "r1-ftp", servers: [srv], serverStates,
        });
        expect(result).toBeNull();
    });

    test("R3-04 a replaced owner does not reuse the previous memory entry", async () => {
        const userData = tempDir();
        const { srv, serverStates } = ftpSrv(userData);
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, envelope(indexDoc(222), 2, "session-a")],
            [`${base}/career-a/resources/penDetail/42/slot-b.xml`, envelope(detailDoc(302, 42), 2, "session-a")],
        ]);
        await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates });
        const seeded = await livestockDetail.read({
            req: { params: { id: "42" } }, resolveServerIdForRequest: () => "r1-ftp", servers: [srv], serverStates,
        });
        expect(seeded.detail.animals[0].id).toBe(302);
        const savedPath = selectionNamed(userData, "penDetail")[0];
        const stored = JSON.parse(fs.readFileSync(savedPath, "utf8"));
        stored.xml = envelope(detailDoc(444, 42), 4, "session-a");
        fs.writeFileSync(savedPath, JSON.stringify(stored));
        const previous = serverStates["r1-ftp"];
        serverStates["r1-ftp"] = Object.assign({}, previous, {
            exportIdentity: Object.assign({}, previous.exportIdentity),
        });
        mockFtp.paths = [];
        const result = await livestockDetail.read({
            req: { params: { id: "42" } }, resolveServerIdForRequest: () => "r1-ftp", servers: [srv], serverStates,
        });
        expect(result.detail.animals[0].id).toBe(444);
        expect(result.fromCache).toBe(true);
    });

    test("R3-05 a pipeline failure settles while the transfer is still pending", () => {
        const dir = tempDir();
        const script = path.join(dir, "pipeline-child.js");
        const local = path.join(dir, "out.xml");
        fs.writeFileSync(script, `
            const livestock = require(${JSON.stringify(path.join(__dirname, "..", "livestockDetail.js"))});
            const localPath = ${JSON.stringify(local)};
            let rejectTransfer;
            const pending = new Promise((_, reject) => { rejectTransfer = reject; });
            const client = { downloadTo(dest) { dest.destroy(new Error("reviewer-pipeline-error")); return pending; } };
            const started = Date.now();
            const operation = livestock.boundedDownloadTo(client, localPath, "remote.xml", 100000);
            Promise.race([
                operation.then(() => "resolved", () => "rejected"),
                new Promise((resolve) => setTimeout(() => resolve("pending"), 200)),
            ]).then((status) => {
                console.log(status + " " + (Date.now() - started));
                rejectTransfer(new Error("cleanup"));
                process.exit(status === "rejected" ? 0 : 1);
            });
        `);
        const result = spawnSync(process.execPath, ["--unhandled-rejections=strict", script], { encoding: "utf8" });
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("rejected");
    });

    test("R3-06 overlapping reconciles arm one handle", async () => {
        const root = tempDir();
        const target = path.join(root, "career-a", "resources", "dirtyPens");
        const other = path.join(root, "career-b", "resources", "dirtyPens");
        fs.mkdirSync(target, { recursive: true });
        fs.mkdirSync(other, { recursive: true });
        const handles = [];
        const fakeFs = {
            watch(dir) {
                const listeners = {};
                const handle = {
                    on(event, fn) { listeners[event] = fn; },
                    close() { handle.closed = true; },
                    listeners,
                    target: dir,
                };
                handles.push(handle);
                return handle;
            },
        };
        const state = { active: true };
        const ownedNow = () => state.active === true;
        let resolveExists;
        const pendingExists = new Promise((resolve) => { resolveExists = resolve; });
        const first = livestockDetail.reconcileDirtyWatch({
            state, desired: target, fsImpl: fakeFs, pathExists: () => pendingExists, ownedNow, onEvent() {},
        });
        const second = livestockDetail.reconcileDirtyWatch({
            state, desired: target, fsImpl: fakeFs, pathExists: () => pendingExists, ownedNow, onEvent() {},
        });
        expect(second).toBe(first);
        resolveExists(true);
        await first;
        expect(handles).toHaveLength(1);
        expect(state.dirtyPensWatcher).toBe(handles[0]);
        expect(typeof handles[0].listeners.error).toBe("function");
        handles[0].close();
        state.dirtyPensWatcher = null;
        state.dirtyArmedTarget = null;
        let releaseOld;
        let releaseNew;
        const oldGate = new Promise((resolve) => { releaseOld = resolve; });
        const newGate = new Promise((resolve) => { releaseNew = resolve; });
        const raced = livestockDetail.reconcileDirtyWatch({
            state, desired: target, fsImpl: fakeFs, pathExists: () => oldGate, ownedNow, onEvent() {},
        });
        const replacement = livestockDetail.reconcileDirtyWatch({
            state, desired: other, fsImpl: fakeFs, pathExists: () => newGate, ownedNow, onEvent() {},
        });
        releaseNew(true);
        await replacement;
        releaseOld(true);
        await raced;
        expect(handles.filter((handle) => !handle.closed)).toHaveLength(1);
        expect(state.dirtyArmedTarget).toBe(other);
        let releaseStopped;
        const stoppedGate = new Promise((resolve) => { releaseStopped = resolve; });
        const duringStop = livestockDetail.reconcileDirtyWatch({
            state, desired: target, fsImpl: fakeFs, pathExists: () => stoppedGate, ownedNow, onEvent() {},
        });
        state.active = false;
        releaseStopped(true);
        await duringStop;
        expect(handles.filter((handle) => !handle.closed)).toHaveLength(0);
        state.active = true;
        await livestockDetail.reconcileDirtyWatch({
            state, desired: null, fsImpl: fakeFs, pathExists: async () => true, ownedNow, onEvent() {},
        });
        await livestockDetail.reconcileDirtyWatch({
            state, desired: target, fsImpl: fakeFs, pathExists: async () => true, ownedNow, onEvent() {},
        });
        expect(handles.filter((handle) => !handle.closed)).toHaveLength(1);
        expect(state.dirtyArmedTarget).toBe(target);
    });

    test("R3-07 identical detail reads share one pair operation", async () => {
        const userData = tempDir();
        const { srv, serverStates } = ftpSrv(userData);
        mockFtp.files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, envelope(indexDoc(222), 2, "session-a")],
            [`${base}/career-a/resources/penDetail/42/slot-a.xml`, envelope(detailDoc(301, 42), 1, "session-a")],
            [`${base}/career-a/resources/penDetail/42/slot-b.xml`, envelope(detailDoc(302, 42), 2, "session-a")],
        ]);
        await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates });
        livestockDetail.bustDirtyIndexCache("r1-ftp");
        mockFtp.opened = 0;
        mockFtp.paths = [];
        const reads = await Promise.all([
            livestockDetail.read({
                req: { params: { id: "42" } }, resolveServerIdForRequest: () => "r1-ftp", servers: [srv], serverStates,
            }),
            livestockDetail.read({
                req: { params: { id: "42" } }, resolveServerIdForRequest: () => "r1-ftp", servers: [srv], serverStates,
            }),
        ]);
        expect(reads.map((item) => item.detail.animals[0].id)).toEqual([302, 302]);
        expect(mockFtp.opened).toBe(1);
        expect(mockFtp.paths.filter((item) => item.includes("penDetail"))).toHaveLength(2);
    });

    test("a third same-source detail waits for an admission slot", async () => {
        const userData = tempDir();
        const { srv, serverStates } = ftpSrv(userData);
        const pens = ["42", "43", "44"];
        const files = new Map([
            [`${base}/career-a/resources/dirtyPens/slot-b.xml`, envelope(indexDoc(222, pens), 2, "session-a")],
        ]);
        for (const pen of pens) {
            files.set(`${base}/career-a/resources/penDetail/${pen}/slot-b.xml`, envelope(detailDoc(Number(pen), pen), 2, "session-a"));
        }
        mockFtp.files = files;
        await livestockDetail.ftpRefreshDirtyIndex(srv, { userDataPath: userData, serverStates });
        livestockDetail.bustDirtyIndexCache("r1-ftp");
        let openGate;
        const gate = new Promise((resolve) => { openGate = resolve; });
        mockFtp.beforeDownload = () => gate;
        try {
            const reads = pens.map((pen) => livestockDetail.read({
                req: { params: { id: pen } }, resolveServerIdForRequest: () => "r1-ftp", servers: [srv], serverStates,
            }));
            let queued = 0;
            for (let attempt = 0; attempt < 30; attempt += 1) {
                queued = livestockDetail.resourceAdmissionSnapshot().queued;
                if (queued === 1) break;
                await new Promise((resolve) => setImmediate(resolve));
            }
            expect(livestockDetail.resourceAdmissionSnapshot().globalActive).toBe(2);
            expect(queued).toBe(1);
            openGate();
            const settled = await Promise.all(reads);
            expect(settled.map((item) => item.detail.animals[0].id)).toEqual([42, 43, 44]);
        } finally {
            mockFtp.beforeDownload = null;
        }
    });
});

function listTree(dir) {
    if (!fs.existsSync(dir)) return [];
    const found = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) found.push(...listTree(full));
        else found.push(full);
    }
    return found;
}

describe("resource request ownership", () => {
    test("a read-only replica does not write the neighboring requests file", async () => {
        const root = tempDir();
        const userData = tempDir();
        fs.mkdirSync(path.join(root, "savegame3"), { recursive: true });
        const srv = {
            id: "replica-source",
            mode: "local",
            localPath: root,
            localSubFolder: "savegame3",
            legacyJson: false,
            replicaRegistration: { remoteSlot: "savegame3", sessionPairing: "alpha" },
        };
        const serverStates = {
            "replica-source": {
                active: true,
                userDataPath: userData,
                exportIdentity: {
                    sourceId: "replica-source",
                    careerId: "career-a",
                    sessionId: "session-a",
                    sourceSlot: "savegame3",
                    replica: true,
                },
            },
        };
        const opts = {
            req: { params: { id: "42" } },
            resolveServerIdForRequest: () => "replica-source",
            servers: [srv],
            serverStates,
            getFs25DocumentsRoot: () => root,
        };
        const before = listTree(root).concat(listTree(userData));
        expect(await livestockDetail.read(opts)).toBeNull();
        expect(await livestockDetail.request(opts)).toBe(false);
        expect(listTree(root).concat(listTree(userData))).toEqual(before);
        expect(fs.existsSync(path.join(root, "savegame3", "requests.json"))).toBe(false);
    });

    test("a selected authority still writes one requests file", async () => {
        const root = tempDir();
        const slot = path.join(root, "savegame3");
        fs.mkdirSync(slot, { recursive: true });
        const srv = {
            id: "authority-source",
            mode: "local",
            localPath: root,
            localSubFolder: "savegame3",
            legacyJson: false,
            replicaRegistration: { remoteSlot: "savegame9", sessionPairing: "unused" },
        };
        const serverStates = {
            "authority-source": {
                active: true,
                exportIdentity: {
                    careerId: "career-a",
                    sessionId: "session-a",
                    sourceSlot: "savegame3",
                    authoritative: true,
                },
            },
        };
        const ok = await livestockDetail.request({
            req: { params: { id: "42" } },
            resolveServerIdForRequest: () => "authority-source",
            servers: [srv],
            serverStates,
            getFs25DocumentsRoot: () => root,
        });
        expect(ok).toBe(true);
        const written = JSON.parse(fs.readFileSync(path.join(slot, "requests.json"), "utf8"));
        expect(written.pens).toEqual([expect.objectContaining({ id: 42 })]);
        expect(listTree(root)).toHaveLength(1);
    });

    test("an unresolved modern identity does not guess a requests path", async () => {
        const root = tempDir();
        fs.mkdirSync(path.join(root, "savegame3"), { recursive: true });
        const srv = { id: "open-source", mode: "local", localPath: root, localSubFolder: "savegame3", legacyJson: false };
        const serverStates = { "open-source": { active: true, exportIdentity: { careerId: "career-a" } } };
        const ok = await livestockDetail.request({
            req: { params: { id: "42" } },
            resolveServerIdForRequest: () => "open-source",
            servers: [srv],
            serverStates,
            getFs25DocumentsRoot: () => root,
        });
        expect(ok).toBe(false);
        expect(listTree(root)).toEqual([]);
    });

    test("an explicit legacy authority still writes its requests file", async () => {
        const root = tempDir();
        const slot = path.join(root, "savegame3");
        fs.mkdirSync(slot, { recursive: true });
        const srv = { id: "legacy-source", mode: "local", localPath: root, localSubFolder: "savegame3", legacyJson: true };
        const ok = await livestockDetail.request({
            req: { params: { id: "42" } },
            resolveServerIdForRequest: () => "legacy-source",
            servers: [srv],
            serverStates: { "legacy-source": { active: true } },
            getFs25DocumentsRoot: () => root,
        });
        expect(ok).toBe(true);
        const written = JSON.parse(fs.readFileSync(path.join(slot, "requests.json"), "utf8"));
        expect(written.schemaVersion).toBe(1);
        expect(written.pens[0].id).toBe(42);
    });

    test("an FTP replica does not cache or upload a request", async () => {
        const userData = tempDir();
        const srv = {
            id: "replica-ftp",
            mode: "ftp",
            ftpHost: "fixture-host",
            ftpBasePath: "fixture",
            localSubFolder: "savegame3",
            legacyJson: false,
        };
        const serverStates = {
            "replica-ftp": {
                active: true,
                userDataPath: userData,
                ingressKind: "replica",
                exportIdentity: { careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame3", replica: true },
            },
        };
        mockFtp.opened = 0;
        const ok = await livestockDetail.request({
            req: { params: { id: "42" } },
            resolveServerIdForRequest: () => "replica-ftp",
            servers: [srv],
            serverStates,
        });
        expect(ok).toBe(false);
        expect(mockFtp.opened).toBe(0);
        expect(listTree(userData)).toEqual([]);
    });

    test("a modern request without identity does not write", async () => {
        const root = tempDir();
        fs.mkdirSync(path.join(root, "savegame3"), { recursive: true });
        const identities = [undefined, null, {}];
        for (const exportIdentity of identities) {
            const srv = { id: "bare-source", mode: "local", localPath: root, localSubFolder: "savegame3", legacyJson: false };
            const state = { active: true };
            if (exportIdentity !== undefined) state.exportIdentity = exportIdentity;
            const ok = await livestockDetail.request({
                req: { params: { id: "42" } },
                resolveServerIdForRequest: () => "bare-source",
                servers: [srv],
                serverStates: { "bare-source": state },
                getFs25DocumentsRoot: () => root,
            });
            expect(ok).toBe(false);
        }
        expect(listTree(root)).toEqual([]);
    });

    test("a selected savegame4 does not write savegame3", async () => {
        const root = tempDir();
        fs.mkdirSync(path.join(root, "savegame3"), { recursive: true });
        fs.mkdirSync(path.join(root, "savegame4"), { recursive: true });
        const srv = { id: "slot-source", mode: "local", localPath: root, localSubFolder: "savegame3", legacyJson: false };
        const ok = await livestockDetail.request({
            req: { params: { id: "42" } },
            resolveServerIdForRequest: () => "slot-source",
            servers: [srv],
            serverStates: {
                "slot-source": {
                    active: true,
                    exportIdentity: { careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame4", authoritative: true },
                },
            },
            getFs25DocumentsRoot: () => root,
        });
        expect(ok).toBe(false);
        expect(listTree(root)).toEqual([]);
    });

    test("configuredSlot is the selected local destination", async () => {
        const root = tempDir();
        const slot = path.join(root, "savegame3");
        fs.mkdirSync(slot, { recursive: true });
        const srv = { id: "configured-source", mode: "local", localPath: root, localSubFolder: "savegame3", legacyJson: false };
        const ok = await livestockDetail.request({
            req: { params: { id: "42" } },
            resolveServerIdForRequest: () => "configured-source",
            servers: [srv],
            serverStates: {
                "configured-source": {
                    active: true,
                    exportIdentity: { careerId: "career-a", sessionId: "session-a", configuredSlot: "savegame3", authoritative: true },
                },
            },
            getFs25DocumentsRoot: () => root,
        });
        expect(ok).toBe(true);
        expect(fs.existsSync(path.join(slot, "requests.json"))).toBe(true);
    });

    test("FTP uses the selected last save slot and rejects a conflicting folder", async () => {
        const userData = tempDir();
        const matched = {
            id: "ftp-match",
            mode: "ftp",
            ftpHost: "fixture-host",
            ftpBasePath: "fixture",
            localSubFolder: "savegame3",
            legacyJson: false,
        };
        mockFtp.opened = 0;
        const ok = await livestockDetail.request({
            req: { params: { id: "42" } },
            resolveServerIdForRequest: () => "ftp-match",
            servers: [matched],
            serverStates: {
                "ftp-match": {
                    active: true,
                    userDataPath: userData,
                    lastSaveSlot: "savegame4",
                    exportIdentity: { careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame4" },
                },
            },
        });
        expect(ok).toBe(true);
        expect(listTree(userData).some((file) => file.includes("livestock_requests_ftp-match"))).toBe(true);
        const conflictData = tempDir();
        const conflict = await livestockDetail.request({
            req: { params: { id: "42" } },
            resolveServerIdForRequest: () => "ftp-conflict",
            servers: [{ ...matched, id: "ftp-conflict" }],
            serverStates: {
                "ftp-conflict": {
                    active: true,
                    userDataPath: conflictData,
                    exportIdentity: { careerId: "career-a", sessionId: "session-a", sourceSlot: "savegame4" },
                },
            },
        });
        expect(conflict).toBe(false);
        expect(listTree(conflictData)).toEqual([]);
    });
});
