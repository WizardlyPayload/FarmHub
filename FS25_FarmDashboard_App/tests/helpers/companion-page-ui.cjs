"use strict";

/**
 * jsdom harness for dedicated companion pages (`NEW APP/src/sections/mods/<key>/`).
 * Use from a test file that starts with the `@jest-environment jsdom` docblock.
 *
 *   const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
 *   const page = loadCompanionPage("enhancedLoanSystem");
 *   const host = page.renderPage(payload, { farmId: 1 });
 *   expect(host.querySelector('[data-stat="debt"]').textContent).toContain("…");
 */

const { productionTs, preactRuntime } = require("./production-source.cjs");

function interpolate(text, params) {
    let out = String(text);
    if (params) {
        for (const [name, value] of Object.entries(params)) out = out.split(`{{${name}}}`).join(String(value));
    }
    return out;
}

const i18n = {
    t: (key, params) => interpolate(key, params),
    tOr: (key, fallback, params) => interpolate(fallback || key, params),
    getLocale: () => "en",
};

function uiMocks(h) {
    return {
        Badge: (props) => h("span", { class: `fd-badge fd-badge--${props.tone || "default"}`, title: props.title }, props.children),
        Button: (props) =>
            h("button", { type: "button", class: `fd-btn fd-btn--${props.variant || "primary"}`, onClick: props.onClick }, props.children),
        Card: (props) =>
            h(
                "div",
                { class: `fd-card ${props.class || ""}`.trim() },
                props.title ? h("h3", { class: "fd-card__title" }, props.title) : null,
                h("div", { class: "fd-card__body" }, props.children),
            ),
    };
}

/** Every `*.css` import resolves to an empty module. */
function withCssMocks(mocks) {
    return new Proxy(mocks, {
        getOwnPropertyDescriptor(target, id) {
            if (typeof id === "string" && id.endsWith(".css") && !(id in target)) {
                return { value: {}, writable: false, enumerable: true, configurable: true };
            }
            return Reflect.getOwnPropertyDescriptor(target, id);
        },
        get(target, id) {
            if (typeof id === "string" && id.endsWith(".css") && !(id in target)) return {};
            return target[id];
        },
    });
}

/**
 * @param {string} key  page folder / registry key, e.g. "enhancedLoanSystem"
 * @param {{ mocks?: Record<string, unknown>, catalogId?: string, title?: string, group?: string }} [opts]
 *   extra module mocks (merged over the defaults); catalogId/title/group are used only when the key has
 *   no registry entry yet
 */
function loadCompanionPage(key, opts = {}) {
    const { preact } = preactRuntime();
    const { h, render } = preact;
    const box = {
        state: {
            payload: null,
            activeFarmId: 1,
            section: `mod-${key}`,
            sectionParams: {},
            viewerFillUnitMode: null,
            enabledSections: {},
            setSection(id) {
                box.state.section = id;
                box.navigations.push(id);
            },
            setSectionParams() {},
        },
        navigations: [],
    };
    const useDashboardStore = (selector) => (selector ? selector(box.state) : box.state);
    useDashboardStore.getState = () => box.state;
    const mocks = withCssMocks({
        "@/i18n/i18n": i18n,
        "@/components/ui": uiMocks(h),
        "@/store/dashboard-store": { useDashboardStore },
        ...(opts.mocks || {}),
    });
    const registry = productionTs("NEW APP/src/sections/mods/registry.ts", mocks);
    // Groups test before the lead adds their registry line; a stand-in entry keeps the harness usable.
    const entry = registry.COMPANION_PAGES.find((e) => e.key === key) || {
        key,
        catalogId: opts.catalogId || key,
        title: opts.title || key,
        glyph: "??",
        group: opts.group || "finance",
        load: async () => mod.Page,
    };
    const mod = productionTs(`NEW APP/src/sections/mods/${key}/index.ts`, mocks);
    if (typeof mod.Page !== "function") throw new Error(`NEW APP/src/sections/mods/${key}/index.ts must export Page`);

    /** Render the page for `payload`; returns the host element (appended to document.body). */
    function renderPage(payload, renderOpts = {}) {
        box.state.payload = payload;
        box.state.activeFarmId = renderOpts.farmId ?? 1;
        box.state.viewerFillUnitMode = renderOpts.fillUnitMode ?? null;
        const host = document.createElement("div");
        document.body.appendChild(host);
        render(h(mod.Page, { entry }), host);
        return host;
    }

    return { entry, Page: mod.Page, registry, renderPage, store: box, i18n };
}

module.exports = { loadCompanionPage, i18n, withCssMocks };
