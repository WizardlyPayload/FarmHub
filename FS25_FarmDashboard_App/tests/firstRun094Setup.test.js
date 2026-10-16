/**
 * @jest-environment jsdom
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { productionTs, preactRuntime } = require("./helpers/production-source.cjs");

const APP_ROOT = path.resolve(__dirname, "../..");

describe("094 setup window bootstrap and first-run import", () => {
    const { preact } = preactRuntime();
    const setupHtml = fs.readFileSync(path.join(APP_ROOT, "NEW APP/setup.html"), "utf8");

    function deferred() {
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
        return { promise, resolve, reject };
    }

    function mountDocument() {
        const parsed = new DOMParser().parseFromString(setupHtml, "text/html");
        document.head.innerHTML = "";
        document.body.innerHTML = parsed.body.innerHTML.replace(/<script[\s\S]*?<\/script>/gi, "");
        return document.getElementById("app");
    }

    function loadSetup(api, i18n = {}) {
        const h = preact.h;
        return productionTs("NEW APP/src/setup/main.tsx", {
            "@/styles/global.css": {},
            "@/platform/platform.css": {},
            "@/setup/setup.css": {},
            "@/components/ux/ux.css": {},
            "@/i18n/i18n": {
                initI18n: i18n.initI18n || (() => Promise.resolve()),
                t: (key) => key,
                tOr: (_key, fallback) => fallback,
            },
            "@/components/ui": {
                Button: (props) => h("button", { type: "button", onClick: props.onClick }, props.children),
            },
            "@/services/electron-bridge": { getFarmDashApi: () => api },
            "@/lib/setup-status": {
                fetchSetupStatus: api.fetchSetupStatus || (async () => null),
                runSetupHandshake: async () => null,
            },
            "@/lib/mod-export-progress": { startModStoreImageExport: async () => {} },
            "@/platform/ModExportProgressModal": { ModExportProgressModal: () => null },
            "@/lib/ux-classify": { mapSaveError: (raw) => raw },
        });
    }

    function buttonByText(text) {
        return [...document.querySelectorAll("button")].find((button) => button.textContent.includes(text));
    }

    async function settle(ms = 0) {
        for (let i = 0; i < 4; i += 1) await jest.advanceTimersByTimeAsync(i === 0 ? ms : 120);
    }

    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
    });

    afterEach(() => {
        const app = document.getElementById("app");
        if (app) preact.render(null, app);
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    test("setup.html shows an accessible loading state before any script runs", () => {
        const app = mountDocument();
        const status = app.querySelector("[role='status']");
        expect(status).not.toBeNull();
        expect(status.getAttribute("aria-busy")).toBe("true");
        expect(status.textContent).toMatch(/Loading/);
    });

    test("loading stays visible while init is unresolved, then a bounded retry keeps the stored config", async () => {
        mountDocument();
        const reads = [deferred(), deferred()];
        let readCount = 0;
        const api = {
            getCurrentConfig: jest.fn(() => reads[readCount++].promise),
            getStoredLocale: jest.fn(async () => "en"),
            saveSettings: jest.fn(async () => ({ ok: true, saveState: "saved" })),
            launchDashboard: jest.fn(async () => ({ ok: true })),
            scanLocalSaves: jest.fn(async () => ({ saves: [] })),
        };
        loadSetup(api, { initI18n: () => new Promise(() => {}) });
        await settle(0);
        const splash = () => document.querySelector("#app [role='status'][aria-busy='true']");
        expect(splash()).not.toBeNull();
        expect(splash().textContent).toMatch(/Loading/);
        await settle(4500);
        expect(splash()).not.toBeNull();
        expect(buttonByText("setup.launch")).toBeUndefined();
        await settle(1000);
        expect(api.getCurrentConfig).toHaveBeenCalledTimes(1);
        expect(splash()).not.toBeNull();
        expect(buttonByText("setup.launch")).toBeUndefined();
        await settle(8000);
        const alert = document.querySelector("#app [role='alert']");
        expect(alert).not.toBeNull();
        expect(alert.textContent).toContain("Could not load your servers");
        expect(buttonByText("setup.launch")).toBeUndefined();
        expect(api.saveSettings).not.toHaveBeenCalled();

        buttonByText("Retry").click();
        await settle(0);
        reads[1].resolve({ isConfigured: true, servers: [{ id: "keep", name: "Kept Farm", mode: "local", localPath: "C:/p/modSettings/FS25_FarmDashboard", localSubFolder: "savegame3" }] });
        await settle(0);
        reads[0].resolve({ servers: [] });
        await settle(0);
        expect(document.querySelector("#app [role='alert']")).toBeNull();
        expect(document.body.textContent).toContain("Kept Farm");
        buttonByText("setup.launch").click();
        await settle(0);
        expect(api.saveSettings).toHaveBeenCalledTimes(1);
        expect(api.saveSettings.mock.calls[0][0].servers.map((row) => row.id)).toEqual(["keep"]);
    });

    test("auto-detect imports a pending career and explains the next action", async () => {
        mountDocument();
        const dashRoot = "C:/Users/p/Documents/My Games/FarmingSimulator2025/modSettings/FS25_FarmDashboard";
        const api = {
            getCurrentConfig: jest.fn(async () => ({})),
            getStoredLocale: jest.fn(async () => "en"),
            saveSettings: jest.fn(async () => ({ ok: true, saveState: "saved" })),
            launchDashboard: jest.fn(async () => ({ ok: true })),
            scanLocalSaves: jest.fn(async () => ({
                saves: [{
                    id: "srv_1",
                    name: "Fresh Farm — Riverbend Springs",
                    mode: "local",
                    localPath: dashRoot,
                    localSubFolder: "savegame1",
                    savegameName: "Fresh Farm",
                    mapTitle: "Riverbend Springs",
                    sourceKey: "local:x:savegame1",
                    awaitingFirstExport: true,
                }],
                defaultDashboardRoot: dashRoot,
            })),
        };
        loadSetup(api);
        await settle(0);
        buttonByText("setup.detectIdle").click();
        await settle(0);
        const toast = document.querySelector(".fd-setup__toast");
        expect(toast.textContent).toContain("1 saved career with no dashboard export yet");
        expect(toast.textContent).toContain("Launch Dashboard");
        expect(document.body.textContent).toContain("Fresh Farm — Riverbend Springs");
        const hint = document.querySelector(".fd-setup__awaiting");
        expect(hint).not.toBeNull();
        expect(hint.getAttribute("role")).toBe("status");
        expect(hint.textContent).toContain("Waiting for the first export");
        buttonByText("setup.launch").click();
        await settle(0);
        const saved = api.saveSettings.mock.calls[0][0].servers;
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({ mode: "local", localPath: dashRoot, localSubFolder: "savegame1" });
        expect(saved[0]).not.toHaveProperty("awaitingFirstExport");
        expect(api.launchDashboard).toHaveBeenCalledTimes(1);
    });

    test("auto-detect with no career explains what to do instead of asking for data.json", async () => {
        mountDocument();
        const api = {
            getCurrentConfig: jest.fn(async () => ({})),
            getStoredLocale: jest.fn(async () => "en"),
            saveSettings: jest.fn(),
            launchDashboard: jest.fn(),
            scanLocalSaves: jest.fn(async () => ({ saves: [], defaultDashboardRoot: null })),
        };
        loadSetup(api);
        await settle(0);
        buttonByText("setup.detectIdle").click();
        await settle(0);
        const toast = document.querySelector(".fd-setup__toast").textContent;
        expect(toast).not.toContain("toastNoDataJson");
        expect(toast).toContain("No Farming Simulator 25 career was found");
        expect(api.saveSettings).not.toHaveBeenCalled();
    });
});
