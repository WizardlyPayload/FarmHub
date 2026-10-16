/**
 * @jest-environment jsdom
 */
"use strict";

const { productionTs } = require("./helpers/production-source.cjs");

const demo = productionTs("NEW APP/src/platform/demo-source.ts");
const bridge = productionTs("NEW APP/src/services/electron-bridge.ts", {
    "@/platform/demo-source": demo,
});

function ownedField(index) {
    return { id: index + 1, fieldId: index + 1, name: `Field ${index + 1}`, ownerFarmId: 1, hectares: 4.2 };
}

function generation(id, demoId, extra) {
    return {
        id,
        demoId,
        capturedAt: "2026-09-27T09:00:00.000Z",
        gameDate: "2030-06",
        mapTitle: "Recorded demo map",
        limitations: ["Recorded demo. Companion numbers that are detection-only stay detection-only."],
        section: "fields",
        exportGeneration: 1,
        payload: {
            dataSource: "recorded-demo",
            activeFarmId: 1,
            fields: [ownedField(0)],
            ...extra,
        },
    };
}

describe("recorded demo source", () => {
    afterEach(() => {
        demo.setDemoWritesLocked(false);
        delete window.farmDashAPI;
    });

    test("two visitors keep distinct demos and a bad publish keeps the previous generation", () => {
        let library = demo.emptyDemoLibrary();
        const base = demo.publishDemoGeneration(library, generation("gen-base", "base"));
        expect(base.ok).toBe(true);
        library = base.library;
        const pf = demo.publishDemoGeneration(library, generation("gen-pf", "precision-farming"));
        expect(pf.ok).toBe(true);
        library = pf.library;

        const leaked = demo.publishDemoGeneration(library, generation("gen-bad", "realistic-farming", {
            playerName: "private",
        }), { strict: true });
        expect(leaked.ok).toBe(false);
        expect(leaked.error).toBe("unknown-field");
        expect(leaked.library).toBe(library);
        expect(library.pointer).toBe("gen-pf");

        const secret = demo.publishDemoGeneration(library, generation("gen-secret", "realistic-farming", {
            serverPassword: "hidden",
        }));
        expect(secret.ok).toBe(false);
        expect(secret.error).toBe("private-field");
        expect(secret.library).toBe(library);
        expect(library.pointer).toBe("gen-pf");
        expect(library.generations["gen-bad"]).toBeUndefined();
        expect(library.generations["gen-secret"]).toBeUndefined();

        let visitors = {};
        const first = demo.selectRecordedDemo(visitors, "visitor-a", "base", library);
        visitors = first.visitors;
        const second = demo.selectRecordedDemo(visitors, "visitor-b", "precision-farming", library);
        expect(first.generation.demoId).toBe("base");
        expect(second.generation.demoId).toBe("precision-farming");
        expect(second.visitors["visitor-a"].demoId).toBe("base");
        expect(second.visitors["visitor-b"].generationId).toBe("gen-pf");

        const applied = [];
        const loaded = demo.loadRecordedDemo({
            visitors,
            visitorId: "visitor-a",
            demoId: "base",
            library,
            apply: (payload, section, capturedAt) => applied.push({ payload, section, capturedAt }),
        });
        expect(loaded.ok).toBe(true);
        expect(applied[0].section).toBe("fields");
        expect(applied[0].payload.fields).toHaveLength(1);
        expect(applied[0].payload.fields[0]).toMatchObject({ fieldId: 1, ownerFarmId: 1, hectares: 4.2 });
        expect(applied[0].capturedAt).toBe("2026-09-27T09:00:00.000Z");
        expect(demo.demoWritesAreLocked()).toBe(true);
    });

    test("private data past the old scan cap, a reused id, and a later generation stay honest", () => {
        let library = demo.emptyDemoLibrary();
        const cleanRows = Array.from({ length: 201 }, (_, index) => ownedField(index));
        const clean = demo.publishDemoGeneration(demo.emptyDemoLibrary(), generation("gen-clean", "base", { fields: cleanRows }));
        expect(clean.ok).toBe(true);
        expect(clean.library.generations["gen-clean"].payload.fields).toHaveLength(201);

        const fields = cleanRows.map((row) => ({ ...row }));
        fields[200] = { ...fields[200], password: "hidden" };
        const oversized = demo.publishDemoGeneration(library, generation("gen-over", "base", { fields }));
        expect(oversized.ok).toBe(false);
        expect(oversized.error).toBe("private-field");
        expect(oversized.library).toBe(library);
        expect(JSON.stringify(oversized.library)).not.toContain("hidden");

        const privateTitle = "C:/Users/private/save";
        expect(demo.publicText(privateTitle)).toBeNull();
        const pathInTitle = demo.publishDemoGeneration(library, {
            ...generation("gen-path", "base"),
            mapTitle: privateTitle,
        });
        expect(pathInTitle.ok).toBe(false);
        expect(pathInTitle.error).toBe("incomplete-label");
        expect(pathInTitle.library).toBe(library);

        const pathInTypedTitle = demo.publishDemoGeneration(library, generation("gen-typed-path", "base", {
            fields: [{ ...ownedField(0), name: privateTitle }],
        }));
        expect(pathInTypedTitle.ok).toBe(false);
        expect(pathInTypedTitle.error).toBe("private-or-invalid-text");
        expect(pathInTypedTitle.library).toBe(library);
        expect(library.pointer).toBeNull();

        const uncommitted = demo.publishDemoGeneration(library, {
            ...generation("gen-zero", "base"),
            exportGeneration: 0,
        });
        expect(uncommitted.ok).toBe(false);
        expect(uncommitted.error).toBe("uncommitted");

        const first = demo.publishDemoGeneration(library, generation("base-old", "base"));
        expect(first.ok).toBe(true);
        library = first.library;
        const input = generation("base-new", "base");
        const second = demo.publishDemoGeneration(library, input);
        expect(second.ok).toBe(true);
        library = second.library;
        input.payload.fields[0].name = "mutated after publish";
        expect(library.generations["base-new"].payload.fields[0].name).toBe("Field 1");

        const duplicate = demo.publishDemoGeneration(library, generation("base-new", "base"));
        expect(duplicate.ok).toBe(false);
        expect(duplicate.error).toBe("duplicate-generation");
        expect(duplicate.library).toBe(library);

        const pf = demo.publishDemoGeneration(library, generation("pf-new", "precision-farming"));
        expect(pf.ok).toBe(true);
        library = pf.library;
        const selected = demo.selectRecordedDemo({}, "visitor-a", "base", library);
        expect(selected.ok).toBe(true);
        expect(selected.generation.id).toBe("base-new");
    });

    test("a retained api reference still denies setup and settings after the demo locks", async () => {
        const saveSettings = jest.fn(async () => ({ ok: true }));
        const runSetupHandshake = jest.fn(async () => ({ ok: true }));
        const restoreLanDefaults = jest.fn(async () => ({ ok: true }));
        window.farmDashAPI = { saveSettings, runSetupHandshake, restoreLanDefaults };
        const api = bridge.getFarmDashApi();
        demo.setDemoWritesLocked(true);
        expect(await api.saveSettings({})).toEqual({ ok: false, error: "demo-read-only", action: "saveSettings" });
        expect(await api.runSetupHandshake()).toEqual({ ok: false, error: "demo-read-only", action: "runSetupHandshake" });
        expect(await api.restoreLanDefaults()).toEqual({ ok: false, error: "demo-read-only", action: "restoreLanDefaults" });
        expect(saveSettings).not.toHaveBeenCalled();
        expect(runSetupHandshake).not.toHaveBeenCalled();
        expect(restoreLanDefaults).not.toHaveBeenCalled();
    });

    test("a loaded demo denies settings writes and leaves the host server untouched", async () => {
        const saveSettings = jest.fn(async () => ({ ok: true }));
        window.farmDashAPI = { saveSettings };
        demo.setDemoWritesLocked(true);
        const api = bridge.getFarmDashApi();
        const denied = await api.saveSettings({ host: "changed" });
        expect(denied).toEqual({ ok: false, error: "demo-read-only", action: "saveSettings" });
        expect(saveSettings).not.toHaveBeenCalled();
    });
});
