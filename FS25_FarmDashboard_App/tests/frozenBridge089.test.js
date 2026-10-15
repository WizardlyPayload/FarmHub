/**
 * @jest-environment jsdom
 */
"use strict";

const { productionTs } = require("./helpers/production-source.cjs");

const demo = productionTs("NEW APP/src/platform/demo-source.ts");
const bridge = productionTs("NEW APP/src/services/electron-bridge.ts", {
    "@/platform/demo-source": demo,
});

const SAFE = ["getTranslationsJson", "getStoredLocale", "getDesktopAppVersion"];
const DENIED = [
    "getCurrentConfig", "saveSettings", "launchDashboard", "scanLocalSaves", "openSetup", "resetSettings",
    "setStoredLocale", "getUiPreferences", "saveUiPreferences", "getLanAccessSettings", "saveLanAccessSettings",
    "checkDesktopAppUpdates", "exportModStoreImages", "getFieldExclusionOptions", "getModConfig", "saveModConfig",
    "readLocalFarmdashDataJson", "readServerLiveCache", "setSimHubLiveContext", "onAppUpdateStatus",
    "subscribeExportModStoreImagesProgress", "getSetupStatus", "runSetupHandshake", "restoreLanDefaults",
    "getPendingReplicaSession", "approvePendingReplicaSession", "declinePendingReplicaSession",
];

/** Same shape Electron's contextBridge exposes: own data properties, non-writable, non-configurable, frozen. */
function frozenBridge(extra = {}) {
    const calls = [];
    const methods = {};
    for (const name of [...SAFE, ...DENIED]) {
        methods[name] = function (...args) {
            calls.push({ name, self: this, args });
            if (name === "getStoredLocale") return Promise.resolve("en");
            if (name === "getTranslationsJson") return Promise.resolve({ en: { hello: "Hello" } });
            if (name === "getDesktopAppVersion") return Promise.resolve("5.0.6");
            return Promise.resolve({ ok: true, name });
        };
    }
    const source = { ...methods, ...extra };
    const raw = {};
    for (const key of Reflect.ownKeys(source)) {
        Object.defineProperty(raw, key, { value: source[key], enumerable: true, writable: false, configurable: false });
    }
    Object.freeze(raw);
    return { raw, calls };
}

function descriptors(raw) {
    return Reflect.ownKeys(raw).map((key) => [key, Object.getOwnPropertyDescriptor(raw, key)]);
}

describe("089 frozen contextBridge facade", () => {
    afterEach(() => {
        demo.setDemoWritesLocked(false);
        delete window.farmDashAPI;
    });

    test("fixture really is frozen with non-configurable, non-writable properties", () => {
        const { raw } = frozenBridge();
        expect(Object.isFrozen(raw)).toBe(true);
        for (const name of [...SAFE, "saveSettings", "runSetupHandshake"]) {
            expect(Object.getOwnPropertyDescriptor(raw, name)).toMatchObject({ writable: false, configurable: false, enumerable: true });
        }
    });

    test("setup reads and authorized desktop calls work on a frozen bridge", async () => {
        const { raw, calls } = frozenBridge();
        const before = descriptors(raw);
        window.farmDashAPI = raw;
        const api = bridge.getFarmDashApi();
        expect(await api.getStoredLocale()).toBe("en");
        expect(await api.getTranslationsJson()).toEqual({ en: { hello: "Hello" } });
        expect(await api.getDesktopAppVersion()).toBe("5.0.6");
        expect(await api.getCurrentConfig()).toEqual({ ok: true, name: "getCurrentConfig" });
        const cfg = { servers: [] };
        expect(await api.saveSettings(cfg)).toEqual({ ok: true, name: "saveSettings" });
        expect(await api.runSetupHandshake()).toEqual({ ok: true, name: "runSetupHandshake" });
        expect(calls.map((c) => c.name)).toEqual(["getStoredLocale", "getTranslationsJson", "getDesktopAppVersion", "getCurrentConfig", "saveSettings", "runSetupHandshake"]);
        expect(calls.every((c) => c.self === raw)).toBe(true);
        expect(calls[4].args).toEqual([cfg]);
        expect(calls[4].args[0]).toBe(cfg);
        expect(descriptors(raw)).toEqual(before);
        for (const [key, desc] of before) expect(raw[key]).toBe(desc.value);
    });

    test("facade and wrapped methods are cached per raw bridge", () => {
        const first = frozenBridge();
        window.farmDashAPI = first.raw;
        const api = bridge.getFarmDashApi();
        expect(bridge.getFarmDashApi()).toBe(api);
        expect(api.getStoredLocale).toBe(api.getStoredLocale);
        expect(api.saveSettings).toBe(api.saveSettings);
        expect(api.saveSettings).not.toBe(first.raw.saveSettings);
        const second = frozenBridge();
        window.farmDashAPI = second.raw;
        const other = bridge.getFarmDashApi();
        expect(other).not.toBe(api);
        window.farmDashAPI = first.raw;
        expect(bridge.getFarmDashApi()).toBe(api);
    });

    test("recorded mode runs only the three safe methods, with zero side effects for the rest", async () => {
        const { raw, calls } = frozenBridge();
        window.farmDashAPI = raw;
        const api = bridge.getFarmDashApi();
        demo.setDemoWritesLocked(true);
        for (const name of DENIED) {
            expect(await api[name]("arg")).toEqual({ ok: false, error: "demo-read-only", action: name });
        }
        expect(calls).toEqual([]);
        expect(await api.getStoredLocale()).toBe("en");
        expect(await api.getTranslationsJson()).toEqual({ en: { hello: "Hello" } });
        expect(await api.getDesktopAppVersion()).toBe("5.0.6");
        expect(calls.map((c) => c.name)).toEqual(["getStoredLocale", "getTranslationsJson", "getDesktopAppVersion"]);
    });

    test("methods captured before recorded mode read the lock at call time, and forwarding returns after", async () => {
        const { raw, calls } = frozenBridge();
        window.farmDashAPI = raw;
        const api = bridge.getFarmDashApi();
        const saveSettings = api.saveSettings;
        const resetSettings = api.resetSettings;
        const handshake = api.runSetupHandshake;
        const locale = api.getStoredLocale;
        demo.setDemoWritesLocked(true);
        expect(await saveSettings({ host: "changed" })).toEqual({ ok: false, error: "demo-read-only", action: "saveSettings" });
        expect(await resetSettings()).toEqual({ ok: false, error: "demo-read-only", action: "resetSettings" });
        expect(await handshake()).toEqual({ ok: false, error: "demo-read-only", action: "runSetupHandshake" });
        expect(calls).toEqual([]);
        expect(await locale()).toBe("en");
        expect(calls.map((c) => c.name)).toEqual(["getStoredLocale"]);
        demo.setDemoWritesLocked(false);
        expect(await saveSettings({ host: "ok" })).toEqual({ ok: true, name: "saveSettings" });
        expect(await api.getCurrentConfig()).toEqual({ ok: true, name: "getCurrentConfig" });
        expect(calls.map((c) => c.name)).toEqual(["getStoredLocale", "saveSettings", "getCurrentConfig"]);
        expect(calls[1].self).toBe(raw);
        expect(calls[1].args).toEqual([{ host: "ok" }]);
    });

    test("sync return, sync throw, rejected promises and unknown/optional properties pass through", async () => {
        const boom = new Error("sync boom");
        const refused = new Error("untrusted_sender");
        const marker = Symbol("marker");
        const { raw } = frozenBridge({
            openSetup: function () { return this; },
            resetSettings: () => { throw boom; },
            getCurrentConfig: () => Promise.reject(refused),
            appVersionLabel: "5.0.6",
            [marker]: "symbol-value",
        });
        const before = descriptors(raw);
        window.farmDashAPI = raw;
        const api = bridge.getFarmDashApi();
        expect(api.openSetup()).toBe(raw);
        let thrown = null;
        try { api.resetSettings(); } catch (error) { thrown = error; }
        expect(thrown).toBe(boom);
        await expect(api.getCurrentConfig()).rejects.toBe(refused);
        expect(api.appVersionLabel).toBe("5.0.6");
        expect(api[marker]).toBe("symbol-value");
        expect(api.notARealMethod).toBeUndefined();
        expect("notARealMethod" in api).toBe(false);
        expect(descriptors(raw)).toEqual(before);

        const sparse = Object.freeze(Object.defineProperty({}, "getStoredLocale", {
            value: () => Promise.resolve("de"), enumerable: true, writable: false, configurable: false,
        }));
        window.farmDashAPI = sparse;
        const small = bridge.getFarmDashApi();
        expect(small.launchDashboard).toBeUndefined();
        expect("launchDashboard" in small).toBe(false);
        expect(small.launchDashboard?.()).toBeUndefined();
        expect(await small.getStoredLocale()).toBe("de");
    });

    test("reflection on the facade is consistent and never claims the raw non-configurable descriptors", () => {
        const { raw } = frozenBridge();
        const before = descriptors(raw);
        window.farmDashAPI = raw;
        const api = bridge.getFarmDashApi();
        expect(Reflect.ownKeys(api)).toEqual(Reflect.ownKeys(raw));
        expect(Object.keys(api)).toEqual(Object.keys(raw));
        expect("getStoredLocale" in api).toBe(true);
        const desc = Object.getOwnPropertyDescriptor(api, "getStoredLocale");
        expect(desc).toMatchObject({ writable: false, enumerable: true, configurable: true });
        expect(desc.value).toBe(api.getStoredLocale);
        expect(Object.getOwnPropertyDescriptor(api, "missing")).toBeUndefined();
        expect(Object.getPrototypeOf(api)).toBe(Object.getPrototypeOf(raw));
        const spread = { ...api };
        expect(spread.saveSettings).toBe(api.saveSettings);
        expect(() => { api.saveSettings = () => ({ ok: true }); }).toThrow(TypeError);
        expect(() => { delete api.saveSettings; }).toThrow(TypeError);
        expect(() => Object.defineProperty(api, "saveSettings", { value: 1 })).toThrow(TypeError);
        expect(descriptors(raw)).toEqual(before);
    });

    test("no desktop API keeps null behaviour", () => {
        delete window.farmDashAPI;
        expect(bridge.getFarmDashApi()).toBeNull();
        expect(bridge.hasFarmDashApi()).toBe(false);
        window.farmDashAPI = frozenBridge().raw;
        expect(bridge.hasFarmDashApi()).toBe(true);
    });
});
