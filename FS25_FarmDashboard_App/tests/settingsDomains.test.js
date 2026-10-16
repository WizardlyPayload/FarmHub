"use strict";

const { productionTs } = require("./helpers/production-source.cjs");
const { settingsDomainsToWrite, runSettingsSave, loadModDraft } = productionTs("NEW APP/src/settings/save-domains.ts");

describe("settings save domains", () => {
    test("a display-only save does not write mod config", () => {
        expect(settingsDomainsToWrite({
            displayChanged: true,
            connectionChanged: false,
            modChanged: false,
            lanChanged: false,
        })).toEqual(["display"]);
    });

    test("a failed mod domain stays writable after connection already committed", () => {
        const afterConnection = settingsDomainsToWrite({
            displayChanged: false,
            connectionChanged: false,
            modChanged: true,
            lanChanged: false,
        });
        expect(afterConnection).toEqual(["mod"]);
        expect(afterConnection).not.toContain("connection");
    });

    test("an unchanged save writes nothing, and display-only writes preferences once", async () => {
        const calls = { display: 0, connection: 0, mod: 0, lan: 0 };
        const writers = {
            saveDisplay: async () => { calls.display += 1; return { ok: true }; },
            saveConnection: async () => { calls.connection += 1; return { ok: true }; },
            saveMod: async () => { calls.mod += 1; return { ok: true, revision: "next" }; },
            saveLan: async () => { calls.lan += 1; return { ok: true }; },
        };
        const same = {
            displayNow: "d",
            displayBaseline: "d",
            connectionNow: "c",
            connectionBaseline: "c",
            modNow: "m",
            modBaseline: "m",
            modRevision: "rev",
            lanNow: "l",
            lanBaseline: "l",
            lanSecretPending: false,
        };
        const unchanged = await runSettingsSave(same, writers);
        expect(unchanged.attempted).toEqual([]);
        expect(calls).toEqual({ display: 0, connection: 0, mod: 0, lan: 0 });
        const displayOnly = await runSettingsSave({ ...same, displayNow: "d2" }, writers);
        expect(displayOnly.committed).toEqual(["display"]);
        expect(calls).toEqual({ display: 1, connection: 0, mod: 0, lan: 0 });
        const modal = require("fs").readFileSync(require("path").join(__dirname, "../../NEW APP/src/settings/SettingsModal.tsx"), "utf8");
        expect(modal).toMatch(/runSettingsSave\(/);
        expect(modal).not.toMatch(/displayChanged:\s*true/);
    });

    test("a mod failure leaves the unattempted LAN domain dirty and a retry skips connection", async () => {
        const calls = [];
        let modTries = 0;
        const writers = {
            saveDisplay: async () => { calls.push("display"); return { ok: true }; },
            saveConnection: async () => { calls.push("connection"); return { ok: true }; },
            saveMod: async (expected) => {
                calls.push("mod:" + expected);
                modTries += 1;
                if (modTries === 1) return { ok: false, error: "conflict" };
                return { ok: true, revision: "r2" };
            },
            saveLan: async () => { calls.push("lan"); return { ok: true }; },
        };
        const state = {
            displayNow: "d2",
            displayBaseline: "d1",
            connectionNow: "c2",
            connectionBaseline: "c1",
            modNow: "m2",
            modBaseline: "m1",
            modRevision: "r1",
            lanNow: "l2",
            lanBaseline: "l1",
            lanSecretPending: false,
        };
        const first = await runSettingsSave(state, writers);
        expect(first.failed).toBe("mod");
        expect(first.committed).toEqual(["display", "connection"]);
        expect(first.dirty).toEqual(["mod", "lan"]);
        expect(calls).toEqual(["display", "connection", "mod:r1"]);
        const retry = await runSettingsSave({
            ...state,
            displayNow: first.displayBaseline,
            displayBaseline: first.displayBaseline,
            connectionNow: first.connectionBaseline,
            connectionBaseline: first.connectionBaseline,
            modRevision: first.modRevision,
        }, writers);
        expect(retry.committed).toEqual(["mod", "lan"]);
        expect(retry.dirty).toEqual([]);
        expect(retry.modRevision).toBe("r2");
        expect(calls).toEqual(["display", "connection", "mod:r1", "mod:r1", "lan"]);
    });

    test("loading a disabled collector does not turn it back on", () => {
        const draft = loadModDraft({ modules: { fields: false }, revision: "missing" }, ["fields", "vehicles"]);
        expect(draft.modules.fields).toBe(false);
        expect(draft.modules.vehicles).toBe(true);
        expect(draft.revision).toBe("missing");
    });
});
