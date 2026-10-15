/**
 * @jest-environment jsdom
 */
"use strict";

const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");

const { h, render, options } = preactRuntime().preact;
const toasts = [];
localStorage.clear();

// SettingsModal captures its save baseline and dirty flag in useEffect. Preact runs those
// effects on an animation frame (35 ms fallback), so queue them here and drain them from
// waitFor instead of racing fixed sleeps against frame timing.
const pendingEffects = [];
const frameScheduler = options.requestAnimationFrame;
options.requestAnimationFrame = (flush) => {
    pendingEffects.push(flush);
};

const WAIT_LIMIT_MS = 2000;
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

async function settle() {
    for (let round = 0; round < 100; round += 1) {
        await nextTask();
        if (pendingEffects.length === 0) return;
        pendingEffects.splice(0).forEach((flush) => flush());
    }
    throw new Error("preact effects did not settle");
}

async function waitFor(label, predicate) {
    const deadline = Date.now() + WAIT_LIMIT_MS;
    for (;;) {
        await settle();
        if (predicate()) return;
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

function createStore(initializer) {
    let state;
    const set = (partial) => {
        const next = typeof partial === "function" ? partial(state) : partial;
        state = { ...state, ...next };
    };
    const get = () => state;
    state = initializer(set, get);
    const useStore = (selector) => (selector ? selector(state) : state);
    useStore.getState = get;
    useStore.setState = set;
    return useStore;
}

const store = productionTs("NEW APP/src/store/dashboard-store.ts", {
    zustand: { create: createStore },
    "@/types/dashboard": {
        normalizeSectionId: (value) => value || "overview",
        NAV_SECTIONS: ["overview", "storage"],
    },
});
const fillUnits = productionTs("NEW APP/src/lib/fill-units.ts");
const bridge = productionTs("NEW APP/src/services/electron-bridge.ts");
const saveDomains = productionTs("NEW APP/src/settings/save-domains.ts");

const countedSaveUiPreferences = async () => {
    api.saved = (api.saved || 0) + 1;
    return { ok: true };
};

const api = {
    getUiPreferences: async () => ({ sections: {}, newUiLocked: false, useNewUi: true, defaultSection: "overview" }),
    getCurrentConfig: async () => ({ servers: [{ id: "local" }], ftpPolling: {} }),
    getLanAccessSettings: async () => ({ lanUsername: "admin" }),
    getModConfig: async () => ({ updateInterval: 10000, collectionCycleMs: 60000, modules: {}, revision: "1" }),
    getFieldExclusionOptions: async () => ({ rows: [] }),
    getDesktopAppVersion: async () => "5.0.5",
    onAppUpdateStatus: () => {},
    saveUiPreferences: countedSaveUiPreferences,
    saveSettings: async () => ({ ok: true }),
    saveModConfig: async () => ({ ok: true }),
    saveLanAccessSettings: async () => ({ ok: true }),
};

window.farmDashAPI = api;

const SettingsModal = productionTs("NEW APP/src/settings/SettingsModal.tsx", {
    "@/i18n/i18n": { t: (key) => key, tOr: (_key, fallback) => fallback, getLocale: () => "en" },
    "@/components/ui": {
        Badge: (props) => h("span", props, props.children),
        Button: (props) => h("button", { type: "button", disabled: props.disabled, onClick: props.onClick }, props.children),
    },
    "@/lib/fill-units": fillUnits,
    "@/store/dashboard-store": store,
    "@/types/dashboard": {
        normalizeSectionId: (value) => value || "overview",
        NAV_SECTIONS: ["overview", "storage"],
    },
    "@/services/electron-bridge": bridge,
    "@/settings/save-domains": saveDomains,
    "@/platform/viewer-mode": { isFarmDashLocalConfigHost: () => true },
    "@/platform/ChangesModal": { showToast: (message) => { toasts.push(message); } },
    "@/lib/mod-export-progress": { startModStoreImageExport: () => {} },
    "@/lib/discovered-save": {
        discoveryContextFromScan: () => ({}),
        discoveryFeedback: () => "",
        importDiscoveredSaves: async () => {},
    },
    "@/settings/theming": {
        THEME_TABS: ["global"],
        applyThemeForSection: () => {},
        applyThemeVars: () => {},
        clearThemesStorage: () => {},
        defaultThemes: () => ({ global: {} }),
        loadThemes: () => ({ global: {} }),
        saveThemes: () => {},
    },
    "@/lib/realisticFarming/compatibility": {
        buildDetectedRfCompatRows: () => [],
        buildRfCompatibilityRows: () => [],
        countDetectedRfMods: () => 0,
    },
    "@/settings/HealthPane": { HealthPane: () => null },
    "@/lib/use-focus-trap": { useFocusTrap: () => {} },
    "@/services/ws-client": {
        applyServersFromSettingsDraft: () => {},
        reloadServersFromApi: async () => {},
    },
}).SettingsModal;

const storageProto = Object.getPrototypeOf(window.localStorage);
const realSetItem = storageProto.setItem;
const mounted = [];

const fillSelect = (host) => host.querySelector("select[aria-label='settings.fillUnitsLabel']");
const saveButton = (host) => [...host.querySelectorAll("button")].find((button) => button.textContent === "settings.save");
const hasSaveLifecycle = (host, lifecycle) => (
    [...host.querySelectorAll(".fd-save-lifecycle")].some((node) => node.textContent === lifecycle)
);

function paint() {
    const host = document.createElement("div");
    document.body.appendChild(host);
    mounted.push(host);
    render(h(SettingsModal, { open: true, onClose: () => {} }), host);
    return host;
}

async function paintReady() {
    const host = paint();
    await waitFor("settings to finish loading", () => saveButton(host)?.disabled === false);
    return host;
}

async function choose(host, select, value) {
    select.value = value;
    select.l.changefalse({ currentTarget: select, target: select });
    await waitFor(`draft ${value} to mark settings dirty`, () => host.querySelector(".fd-unsaved-dot") !== null);
}

async function unmount(host) {
    render(null, host);
    await settle();
}

async function clickSave(host, lifecycle) {
    saveButton(host).click();
    await waitFor(`save to finish as ${lifecycle}`, () => (
        hasSaveLifecycle(host, lifecycle) && saveButton(host)?.disabled === false
    ));
}

afterEach(async () => {
    storageProto.setItem = realSetItem;
    api.saveUiPreferences = countedSaveUiPreferences;
    for (const host of mounted.splice(0)) {
        render(null, host);
        host.remove();
    }
    await settle();
});

afterAll(() => {
    options.requestAnimationFrame = frameScheduler;
});

describe("UNITS-013 settings fill-unit control", () => {
    test("the settings select saves, reloads, clears, and reports a storage failure", async () => {
        const host = await paintReady();
        const select = fillSelect(host);
        expect(select).not.toBeNull();
        expect(select.value).toBe("auto");
        await choose(host, select, "imperial");
        const save = saveButton(host);
        expect(save.disabled).toBe(false);
        await clickSave(host, "ux.save.synced");
        expect(api.saved || 0).toBe(0);
        expect(store.useDashboardStore.getState().viewerFillUnitMode).toBe("imperial");
        expect(localStorage.getItem("farmdash_viewer_fill_unit")).toBe("imperial");
        await unmount(host);
        const reloaded = await paintReady();
        expect(fillSelect(reloaded).value).toBe("imperial");
        await choose(reloaded, fillSelect(reloaded), "auto");
        await clickSave(reloaded, "ux.save.synced");
        expect(store.useDashboardStore.getState().viewerFillUnitMode).toBe(null);
        expect(localStorage.getItem("farmdash_viewer_fill_unit")).toBe(null);
        storageProto.setItem = function setItemBlocked() { throw new Error("blocked"); };
        await choose(reloaded, fillSelect(reloaded), "british");
        await clickSave(reloaded, "ux.save.failed");
        storageProto.setItem = realSetItem;
        expect(toasts).toContain("settings.fillUnitsStorageFailed");
        expect(store.useDashboardStore.getState().viewerFillUnitMode).toBe(null);
        await unmount(reloaded);
    });

    test("closing without save leaves the stored fill unit unchanged", async () => {
        expect(store.useDashboardStore.getState().setViewerFillUnitMode("imperial")).toBe(true);
        const host = await paintReady();
        const select = fillSelect(host);
        expect(select.value).toBe("imperial");
        await choose(host, select, "litres");
        await unmount(host);
        const again = await paintReady();
        expect(fillSelect(again).value).toBe("imperial");
        expect(store.useDashboardStore.getState().viewerFillUnitMode).toBe("imperial");
        expect(localStorage.getItem("farmdash_viewer_fill_unit")).toBe("imperial");
        await unmount(again);
        store.useDashboardStore.getState().setViewerFillUnitMode(null);
    });

    test("a rejected display save does not replace the stored fill unit", async () => {
        expect(store.useDashboardStore.getState().setViewerFillUnitMode("imperial")).toBe(true);
        api.saveUiPreferences = async () => ({ ok: false, error: "fixture-ui-preferences-failed" });
        const host = await paintReady();
        const select = fillSelect(host);
        const sectionSelect = [...host.querySelectorAll("select")].find((node) => node !== select);
        await choose(host, sectionSelect, "storage");
        select.value = "british";
        select.l.changefalse({ currentTarget: select, target: select });
        await settle();
        await clickSave(host, "ux.save.failed");
        expect(toasts).toContain("fixture-ui-preferences-failed");
        expect(localStorage.getItem("farmdash_viewer_fill_unit")).toBe("imperial");
        expect(store.useDashboardStore.getState().viewerFillUnitMode).toBe("imperial");
        api.saveUiPreferences = countedSaveUiPreferences;
        await unmount(host);
        store.useDashboardStore.getState().setViewerFillUnitMode(null);
    });

    test("a committed display save is not sent again when only the fill unit still needs storing", async () => {
        expect(store.useDashboardStore.getState().setViewerFillUnitMode("imperial")).toBe(true);
        storageProto.setItem = function setItem(key, value) {
            if (key === "farmdash_viewer_fill_unit") throw new Error("blocked");
            return realSetItem.call(this, key, value);
        };
        const host = await paintReady();
        const select = fillSelect(host);
        const sectionSelect = [...host.querySelectorAll("select")].find((node) => node !== select);
        await choose(host, sectionSelect, "storage");
        select.value = "british";
        select.l.changefalse({ currentTarget: select, target: select });
        await settle();
        await clickSave(host, "ux.save.failed");
        expect(api.saved).toBe(1);
        expect(localStorage.getItem("farmdash_default_section")).toBe("storage");
        expect(localStorage.getItem("farmdash_viewer_fill_unit")).toBe("imperial");
        expect(toasts).toContain("settings.fillUnitsStorageFailed");
        expect(toasts).toContain("settings.savePartial");
        expect(toasts).not.toContain("fill-unit-storage");
        storageProto.setItem = realSetItem;
        await clickSave(host, "ux.save.synced");
        expect(api.saved).toBe(1);
        expect(localStorage.getItem("farmdash_viewer_fill_unit")).toBe("british");
        expect(store.useDashboardStore.getState().viewerFillUnitMode).toBe("british");
        await unmount(host);
        store.useDashboardStore.getState().setViewerFillUnitMode(null);
    });
});
