"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { encodeEnvelope } = require("../exportEnvelope");
const { ingestWatchedSlot } = require("../exportIngress");
const { writeStrictPair } = require("../replicaPairContract.cjs");
const { recordIngress, projectStatus } = require("../ingressOrchestration");
const localIngress = require("../localIngressController");
const { isLuaExportStale } = require("../liveExportFreshness");
const ux = require("../uxContract.cjs");
const { productionFunctions, productionTs } = require("./helpers/production-source.cjs");

function commit(dir, sequence, generation, letter, revision, payload, at, sourceSlot = "savegame3", connectionEpoch = "1") {
    const envelope = encodeEnvelope(JSON.stringify(payload), {
        careerId: "career-a",
        sessionId: "session-a",
        publicationSequence: sequence,
        exportGeneration: generation,
        simulationTimeMs: 10,
    });
    writeStrictPair(dir, envelope, {
        sourceId: "source-a",
        sourceSlot,
        connectionEpoch,
        slot: letter,
        replicaRevision: revision,
    });
    for (const name of [`slot-${letter}.xml`, `selection-${letter}.xml`]) {
        fs.utimesSync(path.join(dir, name), at, at);
    }
}

function read(dir, previous, configuredSlot = "savegame3") {
    return ingestWatchedSlot(dir, {
        sourceId: "source-a",
        configuredSlot,
        previous,
        tracker: previous && previous.tracker,
    });
}

describe("replica receipt freshness", () => {
    test("cold restart keeps a stale committed pair stale despite fresh payload timestamps", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-receipt-stale-"));
        const old = new Date(Date.now() - 5 * 60 * 1000);
        commit(dir, 161, 30, "a", 1, {
            vehicles: [{ id: 7 }],
            collectedAt: new Date().toISOString(),
        }, old);

        const ingress = read(dir);
        const state = {};
        expect(ingress.status).toBe("replica");
        expect(ingress.identity.sourceId).toBe("source-a");
        expect(ingress.identity.exportGeneration).toBe(30);
        recordIngress(state, ingress.payload, ingress.identity, new Date().toISOString());
        expect(Date.parse(state.lastLuaReceivedAt)).toBeLessThan(Date.now() - 4 * 60 * 1000);
        expect(isLuaExportStale(state.lastLuaReceivedAt, Date.now(), 60000)).toBe(true);
        expect(projectStatus(state.exportIdentity, ingress.tracker).readiness).not.toBe("live");
        expect(ingestWatchedSlot(dir, { sourceId: "source-b", configuredSlot: "savegame3" }).payload).toBeNull();
    });

    test("duplicate reread cannot renew a commit, but a new generation with identical payload can", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-receipt-progress-"));
        const payload = { vehicles: [{ id: 7 }] };
        commit(dir, 161, 30, "a", 1, payload, new Date(Date.now() - 5 * 60 * 1000));
        const state = {};
        const first = read(dir);
        recordIngress(state, first.payload, first.identity);
        const staleAt = state.lastLuaReceivedAt;

        const duplicate = read(dir, first);
        recordIngress(state, duplicate.payload, duplicate.identity);
        expect(state.lastLuaReceivedAt).toBe(staleAt);
        expect(isLuaExportStale(state.lastLuaReceivedAt, Date.now(), 60000)).toBe(true);

        commit(dir, 162, 31, "b", 2, payload, new Date());
        const next = read(dir, duplicate);
        expect(next.status).toBe("replica");
        expect(next.identity.exportGeneration).toBe(31);
        expect(next.freshness).toBe("live");
        recordIngress(state, next.payload, next.identity);
        expect(Date.parse(state.lastLuaReceivedAt)).toBeGreaterThan(Date.parse(staleAt));
        expect(isLuaExportStale(state.lastLuaReceivedAt, Date.now(), 60000)).toBe(false);

        const reread = read(dir, next);
        recordIngress(state, reread.payload, reread.identity);
        expect(state.lastLuaReceivedAt).toBe(next.identity.committedAt);
    });

    test("missing committed file time stays unconfirmed", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-receipt-no-clock-"));
        commit(dir, 161, 30, "a", 1, { vehicles: [{ id: 7 }] }, new Date());
        const stat = jest.spyOn(fs, "fstatSync").mockImplementation(() => { throw new Error("no metadata"); });
        try {
            const ingress = read(dir);
            const state = {};
            expect(ingress.status).toBe("replica");
            expect(ingress.freshness).toBe("unconfirmed");
            expect(ingress.identity.committedAt).toBeNull();
            recordIngress(state, ingress.payload, ingress.identity);
            expect(state.lastLuaReceivedAt).toBeNull();
            expect(isLuaExportStale(state.lastLuaReceivedAt, Date.now(), 60000)).toBe(true);
        } finally {
            stat.mockRestore();
        }
    });

    test("loss of file-time proof after a valid receipt clears the retained live badge time", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-receipt-loss-"));
        commit(dir, 161, 30, "a", 1, { vehicles: [{ id: 7 }] }, new Date());
        const first = read(dir);
        const state = {};
        recordIngress(state, first.payload, { ...first.identity, freshness: first.freshness });
        expect(isLuaExportStale(state.lastLuaReceivedAt, Date.now(), 60000)).toBe(false);

        const stat = jest.spyOn(fs, "fstatSync").mockImplementation(() => { throw new Error("no metadata"); });
        try {
            const reread = read(dir, first);
            expect(reread.status).toBe("replica");
            expect(reread.identity.committedAt).toBeNull();
            recordIngress(state, reread.payload, { ...reread.identity, freshness: reread.freshness });
            expect(state.lastLuaReceivedAt).toBeNull();
            expect(isLuaExportStale(state.lastLuaReceivedAt, Date.now(), 60000)).toBe(true);
            expect(projectStatus(state.exportIdentity, reread.tracker).readiness).toBe("unconfirmed");
        } finally {
            stat.mockRestore();
        }
        const restoredMetadata = read(dir, first);
        recordIngress(state, restoredMetadata.payload, { ...restoredMetadata.identity, freshness: restoredMetadata.freshness });
        expect(state.lastLuaReceivedAt).toBeNull();
    });

    test("historical sequential commits cannot appear live, then a fresh generation recovers", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-receipt-history-"));
        const old = new Date(Date.now() - 5 * 60 * 1000);
        commit(dir, 161, 30, "a", 1, { vehicles: [{ id: 7 }] }, old);
        const first = read(dir);
        commit(dir, 162, 31, "b", 2, { vehicles: [{ id: 8 }] }, old);
        const second = read(dir, first);
        expect(second.tracker.classify("source-a", "career-a")).toBe("live");
        expect(second.freshness).toBe("stale");
        expect(projectStatus({ ...second.identity, freshness: second.freshness }, second.tracker).readiness).toBe("stale");

        commit(dir, 163, 32, "a", 3, { vehicles: [{ id: 9 }] }, new Date());
        const current = read(dir, second);
        expect(current.freshness).toBe("live");
        expect(projectStatus({ ...current.identity, freshness: current.freshness }, current.tracker).readiness).toBe("live");
    });

    test("equal-sequence conflict stays unconfirmed even while the tracker says live", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-receipt-conflict-"));
        commit(dir, 161, 30, "a", 1, { vehicles: [{ id: 7 }] }, new Date());
        const first = read(dir);
        commit(dir, 162, 31, "b", 2, { vehicles: [{ id: 8 }] }, new Date());
        const second = read(dir, first);
        expect(second.tracker.classify("source-a", "career-a")).toBe("live");

        commit(dir, 162, 31, "b", 2, { vehicles: [{ id: 99 }] }, new Date());
        const conflict = read(dir, second);
        expect(conflict.status).toBe("last-known");
        expect(conflict.reason).toBe("equal-sequence-conflict");
        expect(conflict.freshness).toBe("unconfirmed");
        expect(projectStatus({ ...conflict.identity, freshness: conflict.freshness }, conflict.tracker).readiness).toBe("unconfirmed");
    });

    test("a slot or pairing epoch switch cannot inherit the previous receipt time", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-receipt-context-"));
        const payload = { vehicles: [{ id: 7 }] };
        commit(dir, 161, 30, "a", 1, payload, new Date());
        const first = read(dir);
        const state = { lastGoodMergedSnapshot: { marker: true } };
        recordIngress(state, first.payload, first.identity);
        const recentAt = state.lastLuaReceivedAt;

        commit(dir, 161, 30, "b", 2, payload, new Date(Date.now() - 5 * 60 * 1000), "savegame4", "1");
        const otherSlot = read(dir, first, "savegame4");
        expect(otherSlot.identity.sourceSlot).toBe("savegame4");
        recordIngress(state, otherSlot.payload, otherSlot.identity);
        expect(Date.parse(state.lastLuaReceivedAt)).toBeLessThan(Date.parse(recentAt));
        expect(isLuaExportStale(state.lastLuaReceivedAt, Date.now(), 60000)).toBe(true);
        expect(state.lastGoodMergedSnapshot).toBeNull();

        state.lastGoodMergedSnapshot = { marker: true };
        commit(dir, 161, 30, "a", 3, payload, new Date(Date.now() - 2 * 60 * 1000), "savegame4", "2");
        const newEpoch = read(dir, otherSlot, "savegame4");
        expect(newEpoch.identity.connectionEpoch).toBe("2");
        recordIngress(state, newEpoch.payload, newEpoch.identity);
        expect(state.lastLuaReceivedAt).toBe(newEpoch.identity.committedAt);
        expect(state.lastGoodMergedSnapshot).toBeNull();
    });

    test("recent same-sequence pair in a new slot or epoch starts unconfirmed until that context advances", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-tracker-context-"));
        const same = { vehicles: [{ id: 7 }] };
        commit(dir, 161, 30, "a", 1, same, new Date());
        const first = read(dir);
        commit(dir, 162, 31, "b", 2, same, new Date());
        const live = read(dir, first);
        expect(live.freshness).toBe("live");

        commit(dir, 162, 31, "a", 3, same, new Date(), "savegame4", "1");
        const changedSlot = read(dir, live, "savegame4");
        expect(changedSlot.identity.sourceSlot).toBe("savegame4");
        expect(changedSlot.freshness).toBe("unconfirmed");
        expect(changedSlot.tracker.classify("source-a", "career-a")).toBe("unconfirmed");
        commit(dir, 163, 32, "b", 4, same, new Date(), "savegame4", "1");
        const slotProgress = read(dir, changedSlot, "savegame4");
        expect(slotProgress.freshness).toBe("live");

        commit(dir, 163, 32, "a", 5, same, new Date(), "savegame4", "2");
        const changedEpoch = read(dir, slotProgress, "savegame4");
        expect(changedEpoch.identity.connectionEpoch).toBe("2");
        expect(changedEpoch.freshness).toBe("unconfirmed");
        commit(dir, 164, 33, "b", 6, same, new Date(), "savegame4", "2");
        expect(read(dir, changedEpoch, "savegame4").freshness).toBe("live");
    });

    test("retained replica conflict keeps payload but projects Snap in the actual badge resolver", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-conflict-badge-"));
        const state = {};
        const srv = { id: "source-a" };
        const accept = (id, raw, transport) => recordIngress(state, JSON.parse(raw), transport);
        commit(dir, 161, 30, "a", 1, { vehicles: [{ id: 7 }] }, new Date());
        const first = read(dir);
        expect(localIngress.applyWatchedIngress(state, srv, first, accept)).toBe(true);
        commit(dir, 162, 31, "b", 2, { vehicles: [{ id: 8 }] }, new Date());
        const live = read(dir, first);
        expect(localIngress.applyWatchedIngress(state, srv, live, accept)).toBe(true);
        const recentAt = state.lastLuaReceivedAt;
        expect(isLuaExportStale(recentAt, Date.now(), 90000)).toBe(false);

        commit(dir, 162, 31, "b", 2, { vehicles: [{ id: 99 }] }, new Date());
        const conflict = read(dir, live);
        expect(conflict.status).toBe("last-known");
        expect(conflict.reason).toBe("equal-sequence-conflict");
        expect(localIngress.applyWatchedIngress(state, srv, conflict, accept)).toBe(true);
        expect(state.luaData.vehicles[0].id).toBe(8);
        expect(state.lastLuaReceivedAt).toBeNull();
        expect(projectStatus(state.exportIdentity, conflict.tracker).readiness).toBe("unconfirmed");

        const { stampLuaExportFreshness } = productionFunctions("FS25_FarmDashboard_App/main.js", ["stampLuaExportFreshness"], {
            getLuaExportStaleMs: () => 90000,
            isLuaExportStale,
            applyFreshnessMeta: ux.applyFreshnessMeta,
        });
        const merged = stampLuaExportFreshness({
            dataSource: "merged", luaAvailable: true, xmlAvailable: true,
            dataTimestamps: { lastLuaReceivedAt: recentAt },
        }, state);
        expect(merged.luaAvailable).toBe(false);
        expect(merged.dataTimestamps.isStale).toBe(true);
        expect(merged.dataTimestamps.confidence).toBe("held");
        const { resolveNavbarConnectionBadge } = productionTs("NEW APP/src/lib/connection-badge.ts");
        expect(resolveNavbarConnectionBadge({ ...merged, nowMs: Date.now() }).kind).toBe("snap");

        const unreadable = { ...conflict, reason: "unreadable" };
        expect(localIngress.applyWatchedIngress(state, srv, unreadable, accept)).toBe(true);
        expect(state.lastLuaReceivedAt).toBeNull();

        commit(dir, 163, 32, "a", 3, { vehicles: [{ id: 9 }] }, new Date());
        const recovered = read(dir, conflict);
        expect(recovered.freshness).toBe("live");
        expect(localIngress.applyWatchedIngress(state, srv, recovered, accept)).toBe(true);
        expect(state.luaData.vehicles[0].id).toBe(9);
        expect(isLuaExportStale(state.lastLuaReceivedAt, Date.now(), 90000)).toBe(false);
        const liveMerged = stampLuaExportFreshness({
            dataSource: "merged", luaAvailable: true, xmlAvailable: true,
            dataTimestamps: { lastLuaReceivedAt: state.lastLuaReceivedAt },
        }, state);
        expect(resolveNavbarConnectionBadge({ ...liveMerged, nowMs: Date.now() }).kind).toBe("live");
    });
});
