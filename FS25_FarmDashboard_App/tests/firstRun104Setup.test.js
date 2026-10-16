/**
 * @jest-environment jsdom
 */
"use strict";

// 104: only the latest setup config read may settle the screen. Older successes, rejections and
// eight-second timeouts are dropped, and a genuine latest failure keeps save/Launch closed.

const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");

const { preact } = preactRuntime();
const CONFIG_TIMEOUT_MS = 8000;

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    return { promise, resolve, reject };
}

const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(text));

// Preact runs effects after paint (animation frame or a 100 ms fallback), so each settle also advances 3 x 120 ms.
async function settle(ms = 0) {
    await jest.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 3; i += 1) await jest.advanceTimersByTimeAsync(120);
}

function load(api) {
    document.head.innerHTML = "";
    document.body.innerHTML = "<div id=\"app\"></div>";
    productionTs("NEW APP/src/setup/main.tsx", {
        "@/styles/global.css": {},
        "@/platform/platform.css": {},
        "@/setup/setup.css": {},
        "@/components/ux/ux.css": {},
        "@/i18n/i18n": { initI18n: async () => {}, t: (k) => k, tOr: (_k, f) => f },
        "@/components/ui": { Button: (p) => preact.h("button", { type: "button", onClick: p.onClick }, p.children) },
        "@/services/electron-bridge": { getFarmDashApi: () => api },
        "@/lib/setup-status": { fetchSetupStatus: async () => null, runSetupHandshake: async () => null },
        "@/lib/mod-export-progress": { startModStoreImageExport: async () => {} },
        "@/platform/ModExportProgressModal": { ModExportProgressModal: () => null },
        "@/lib/ux-classify": { mapSaveError: (x) => x },
    });
}

function view() {
    const text = document.body.textContent;
    return {
        loadError: text.includes("Could not load your servers"),
        latestFarm: text.includes("Latest Farm"),
        staleFarm: text.includes("Stale Farm"),
        launch: !!button("setup.launch"),
        localOnly: text.includes("Setup stays on this PC"),
    };
}

const latest = { isConfigured: true, servers: [{ id: "latest", name: "Latest Farm", mode: "local", localPath: "C:/isolated/104/modSettings/FS25_FarmDashboard", localSubFolder: "savegame1" }] };
const stale = { isConfigured: true, servers: [{ id: "stale", name: "Stale Farm", mode: "local", localPath: "C:/isolated/104/modSettings/FS25_FarmDashboard", localSubFolder: "savegame2" }] };

function apiWith(reads) {
    const getCurrentConfig = jest.fn();
    for (const read of reads) getCurrentConfig.mockImplementationOnce(read);
    return {
        getCurrentConfig,
        getStoredLocale: async () => "en",
        saveSettings: jest.fn(async () => ({ ok: true })),
        launchDashboard: jest.fn(async () => ({ ok: true })),
        scanLocalSaves: async () => ({ saves: [] }),
    };
}

/** Initial read fails, then Retry is pressed once per remaining read (optionally with time between presses). */
async function start(reads, gapsMs = []) {
    const api = apiWith([() => Promise.reject(new Error("initial-read-failed")), ...reads]);
    load(api);
    await settle();
    expect(view().loadError).toBe(true);
    for (let i = 0; i < reads.length; i += 1) {
        button("Retry").click();
        await settle(gapsMs[i] || 0);
    }
    expect(api.getCurrentConfig).toHaveBeenCalledTimes(reads.length + 1);
    return api;
}

beforeEach(() => { jest.useFakeTimers(); localStorage.clear(); });
afterEach(() => { preact.render(null, document.getElementById("app")); jest.clearAllTimers(); jest.useRealTimers(); });

test("older rejection that settles before the newer success never shows over it", async () => {
    const older = deferred();
    const newer = deferred();
    const api = await start([() => older.promise, () => newer.promise]);
    older.reject(new Error("older-read-failed"));
    await settle();
    expect(view()).toMatchObject({ loadError: true, launch: false });
    newer.resolve(latest);
    await settle();
    expect(view()).toMatchObject({ loadError: false, latestFarm: true, launch: true });
    await settle(CONFIG_TIMEOUT_MS + 500);
    expect(view()).toMatchObject({ loadError: false, latestFarm: true, launch: true });
    expect(api.saveSettings).not.toHaveBeenCalled();
});

test("older rejection after the newer success leaves the newer config usable", async () => {
    const older = deferred();
    const newer = deferred();
    const api = await start([() => older.promise, () => newer.promise]);
    newer.resolve(latest);
    await settle();
    older.reject(new Error("older-read-failed"));
    await settle();
    expect(view()).toMatchObject({ loadError: false, latestFarm: true, launch: true });
    button("setup.launch").click();
    await settle();
    expect(api.saveSettings).toHaveBeenCalledTimes(1);
    expect(api.saveSettings.mock.calls[0][0].servers.map((s) => s.id)).toEqual(["latest"]);
});

test("an older read's eight-second timeout that fires while the newer read is pending is dropped", async () => {
    const older = deferred();
    const newer = deferred();
    await start([() => older.promise, () => newer.promise], [5000, 0]);
    await settle(3100);
    expect(view()).toMatchObject({ loadError: true, launch: false });
    newer.resolve(latest);
    await settle();
    expect(view()).toMatchObject({ loadError: false, latestFarm: true, launch: true });
    await settle(CONFIG_TIMEOUT_MS);
    expect(view()).toMatchObject({ loadError: false, latestFarm: true, launch: true });
});

test("an older read's timeout after the newer success is dropped, and its late value is ignored", async () => {
    const older = deferred();
    const newer = deferred();
    await start([() => older.promise, () => newer.promise]);
    newer.resolve(latest);
    await settle();
    await settle(CONFIG_TIMEOUT_MS + 100);
    expect(view()).toMatchObject({ loadError: false, latestFarm: true, launch: true });
    older.resolve(stale);
    await settle();
    expect(view()).toMatchObject({ loadError: false, latestFarm: true, staleFarm: false, launch: true });
});

test("an older success while the newer read is pending does not open Launch", async () => {
    const older = deferred();
    const newer = deferred();
    await start([() => older.promise, () => newer.promise]);
    older.resolve(stale);
    await settle();
    expect(view()).toMatchObject({ loadError: true, staleFarm: false, launch: false });
    newer.resolve(latest);
    await settle();
    expect(view()).toMatchObject({ loadError: false, latestFarm: true, staleFarm: false, launch: true });
});

test("the latest read timing out keeps setup fail-closed even after an older success", async () => {
    const older = deferred();
    const newer = deferred();
    const api = await start([() => older.promise, () => newer.promise]);
    older.resolve(latest);
    await settle();
    await settle(CONFIG_TIMEOUT_MS + 100);
    expect(view()).toMatchObject({ loadError: true, launch: false });
    newer.resolve(latest);
    await settle();
    expect(view()).toMatchObject({ loadError: true, launch: false });
    expect(api.saveSettings).not.toHaveBeenCalled();
});

test("a later Retry recovers after a genuine latest failure", async () => {
    const api = await start([
        () => Promise.reject(new Error("latest-read-failed")),
        () => Promise.resolve(latest),
    ]);
    expect(view()).toMatchObject({ loadError: false, latestFarm: true, launch: true });
    expect(api.saveSettings).not.toHaveBeenCalled();
});

test("an initial local-only denial still shows the local-only screen", async () => {
    const api = apiWith([() => Promise.reject(new Error("E_SETUP_LOCAL_ONLY"))]);
    load(api);
    await settle();
    expect(view()).toMatchObject({ localOnly: true, loadError: false, launch: false });
});
