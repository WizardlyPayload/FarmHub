"use strict";

const { recordIngress } = require("../ingressOrchestration");

function modernTransport(generation = 1) {
    return {
        sourceId: "local-savegame1",
        careerId: "career-a",
        sessionId: "session-a",
        publicationSequence: generation,
        exportGeneration: generation,
        legacy: false,
        replica: false,
    };
}

test("an old or changing unproven local mirror never gains a live receipt from an app read", () => {
    const state = {};
    const now = new Date().toISOString();
    const legacy = { sourceId: "old-mirror", legacy: true, freshness: "unconfirmed", replica: false };
    recordIngress(state, { collectedAt: now, fields: [{ id: 1 }] }, legacy, now);
    expect(state.lastLuaReceiptAt).toBe(now);
    expect(state.lastLuaReceivedAt).toBeNull();

    const later = new Date(Date.now() + 1000).toISOString();
    recordIngress(state, { collectedAt: later, fields: [{ id: 1 }, { id: 2 }] }, legacy, later);
    expect(state.lastLuaReceivedAt).toBeNull();
});

test("a modern local envelope uses its valid export-produced time, not app-open time", () => {
    const state = {};
    const producedAt = new Date(Date.now() - 60_000).toISOString();
    const observedAt = new Date().toISOString();
    recordIngress(state, { collectedAt: producedAt, fields: [{ id: 1 }] }, modernTransport(), observedAt);
    expect(state.lastLuaReceivedAt).toBe(producedAt);
    expect(state.lastLuaReceiptAt).toBe(observedAt);
});

test("modern local data without a producer clock waits for real content progression", () => {
    const state = {};
    const first = new Date().toISOString();
    const second = new Date(Date.now() + 1000).toISOString();
    recordIngress(state, { fields: [{ id: 1 }] }, modernTransport(1), first);
    expect(state.lastLuaReceivedAt).toBeNull();
    recordIngress(state, { fields: [{ id: 1 }] }, modernTransport(1), second);
    expect(state.lastLuaReceivedAt).toBeNull();
    recordIngress(state, { fields: [{ id: 1 }, { id: 2 }] }, modernTransport(2), second);
    expect(state.lastLuaReceivedAt).toBe(second);
});

test("a future producer time cannot make a cold local read live", () => {
    const state = {};
    const observedAt = new Date().toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    recordIngress(state, { collectedAt: future, fields: [{ id: 1 }] }, modernTransport(), observedAt);
    expect(state.lastLuaReceivedAt).toBeNull();
});

test("replicas continue to use their validated committed time", () => {
    const state = {};
    const committedAt = new Date(Date.now() - 1000).toISOString();
    recordIngress(state, { fields: [{ id: 1 }] }, {
        sourceId: "mp-linked",
        sourceSlot: "savegame1",
        careerId: "career-a",
        sessionId: "session-a",
        publicationSequence: 1,
        exportGeneration: 1,
        payloadProof: "proof-a",
        committedAt,
        replica: true,
    }, new Date().toISOString());
    expect(state.lastLuaReceivedAt).toBe(committedAt);
});
