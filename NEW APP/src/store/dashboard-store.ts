import { create } from "zustand";
import type {
  DashboardPayload,
  FarmDashServer,
  SectionId,
  SectionParams,
} from "@/types/dashboard";
import { normalizeSectionId } from "@/types/dashboard";
import { demoWritesAreLocked } from "@/platform/demo-source";
import { recordedLastUpdated } from "@/platform/recorded-publication";
import { setLocale as applyLocale, getLocale } from "@/i18n/i18n";
import { ACTIVE_CAREER_KEY, ACTIVE_SERVER_KEY, careerIdForServer } from "@/lib/active-server-selection";

const LAST_SECTION_KEY = "farmdash_last_section";
const DEFAULT_SECTION_PREF_KEY = "farmdash_default_section";

export function readStoredServerId(): string | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SERVER_KEY);
    const id = String(raw || "").trim();
    return id ? id : null;
  } catch {
    return null;
  }
}

export function writeStoredServerId(id: string | null): void {
  try {
    if (!id) {
      localStorage.removeItem(ACTIVE_SERVER_KEY);
      localStorage.removeItem(ACTIVE_CAREER_KEY);
    } else {
      localStorage.setItem(ACTIVE_SERVER_KEY, String(id));
      const server = useDashboardStore.getState().servers.find((row) => String(row.id) === String(id));
      const careerId = careerIdForServer(server);
      if (careerId) localStorage.setItem(ACTIVE_CAREER_KEY, careerId);
      else localStorage.removeItem(ACTIVE_CAREER_KEY);
    }
  } catch {
    /* ignore */
  }
}

export type DefaultSectionPref = "overview" | "last" | SectionId;

export interface DashboardState {
  payload: DashboardPayload | null;
  servers: FarmDashServer[];
  activeServerId: string | null;
  activeFarmId: number | null;
  section: SectionId;
  sectionParams: SectionParams;
  /** Enabled dashboard sections from Settings (map always available). */
  enabledSections: Partial<Record<string, boolean>>;
  connection: "connecting" | "ws" | "http" | "error";
  lastUpdated: string | null;
  locale: string;
  /** Manual litres/british/imperial choice. Ignored while a provider export owns units. */
  viewerFillUnitMode: "litres" | "british" | "imperial" | null;

  setPayload: (payload: DashboardPayload | null) => void;
  setServers: (servers: FarmDashServer[]) => void;
  setActiveServerId: (id: string | null) => void;
  setActiveFarmId: (id: number | null) => void;
  setSection: (section: SectionId, params?: SectionParams) => void;
  setSectionParams: (params: SectionParams) => void;
  clearSectionParams: () => void;
  setEnabledSections: (sections: Partial<Record<string, boolean>>) => void;
  setConnection: (connection: DashboardState["connection"]) => void;
  setLocale: (locale: string) => void;
  setViewerFillUnitMode: (mode: DashboardState["viewerFillUnitMode"]) => boolean;
}

function writeHash(section: SectionId, params: SectionParams) {
  const parts = [`#/${section}`];
  if (params.tab) parts[0] += `/${encodeURIComponent(params.tab)}`;
  const q = new URLSearchParams();
  if (params.filter) q.set("filter", params.filter);
  if (params.id) q.set("id", params.id);
  if (params.role) q.set("role", params.role);
  if (params.view) q.set("view", params.view);
  const qs = q.toString();
  const hash = qs ? `${parts[0]}?${qs}` : parts[0];
  if (typeof window !== "undefined" && window.location.hash !== hash) {
    window.history.replaceState(null, "", hash);
  }
}

function rememberSection(section: SectionId) {
  try {
    localStorage.setItem(LAST_SECTION_KEY, section);
  } catch {
    /* ignore */
  }
}

function readViewerFillUnitMode(): DashboardState["viewerFillUnitMode"] {
  try {
    const stored = localStorage.getItem("farmdash_viewer_fill_unit");
    if (stored === "litres" || stored === "british" || stored === "imperial") return stored;
  } catch {
    /* ignore */
  }
  return null;
}

export function readLastSection(): SectionId | null {
  try {
    const raw = localStorage.getItem(LAST_SECTION_KEY);
    return raw ? normalizeSectionId(raw) : null;
  } catch {
    return null;
  }
}

export function readDefaultSectionPref(): DefaultSectionPref {
  try {
    const raw = localStorage.getItem(DEFAULT_SECTION_PREF_KEY);
    if (!raw) return "last";
    if (raw === "overview" || raw === "last") return raw;
    return normalizeSectionId(raw);
  } catch {
    return "last";
  }
}

export function writeDefaultSectionPref(pref: DefaultSectionPref) {
  try {
    localStorage.setItem(DEFAULT_SECTION_PREF_KEY, pref);
  } catch {
    /* ignore */
  }
}

export function parseLocationHash(): { section: SectionId; params: SectionParams } {
  if (typeof window === "undefined") {
    return { section: "overview", params: {} };
  }
  const raw = window.location.hash.replace(/^#\/?/, "").trim();
  if (!raw) {
    const pref = readDefaultSectionPref();
    if (pref === "last") {
      return { section: readLastSection() || "overview", params: {} };
    }
    if (pref === "overview") return { section: "overview", params: {} };
    return { section: normalizeSectionId(pref), params: {} };
  }

  const [pathPart, queryPart] = raw.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  let section = normalizeSectionId(segments[0]);
  const params: SectionParams = {};
  if (segments[1]) params.tab = decodeURIComponent(segments[1]);

  if (queryPart) {
    const q = new URLSearchParams(queryPart);
    // Legacy `#/economy?tab=redtape` (and similar) — path segment wins if both present.
    const tabQ = q.get("tab");
    if (tabQ && !params.tab) params.tab = tabQ;
    const filter = q.get("filter");
    const id = q.get("id");
    const role = q.get("role");
    const view = q.get("view");
    if (filter) params.filter = filter;
    if (id) params.id = id;
    if (role) params.role = role;
    if (view) params.view = view;
  }

  // Legacy Economy deep links promote to first-class sections.
  if (section === "economy" && params.tab === "storage") {
    section = "storage";
    delete params.tab;
  }
  if (section === "economy" && params.tab === "redtape") {
    section = "redtape";
    delete params.tab;
  }
  if (section === "economy" && params.tab === "invoices") {
    section = "invoices";
    delete params.tab;
  }
  if (section === "economy" && params.tab === "hirepurchasing") {
    section = "hirepurchasing";
    delete params.tab;
  }

  return { section, params };
}

const initialRoute = parseLocationHash();
// Normalize legacy `#/economy/storage` / `#/economy/redtape` / invoices|hirepurchasing in the address bar on boot.
if (typeof window !== "undefined") {
  writeHash(initialRoute.section, initialRoute.params);
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  payload: null,
  servers: [],
  activeServerId: readStoredServerId(),
  activeFarmId: null,
  section: initialRoute.section,
  sectionParams: initialRoute.params,
  enabledSections: {},
  connection: "connecting",
  lastUpdated: null,
  locale: typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo")
    ? "en" : localStorage.getItem("farmdash_locale") || "en",
  viewerFillUnitMode: readViewerFillUnitMode(),

  setPayload: (payload) =>
    set((state) => {
      if (demoWritesAreLocked() && payload?.dataSource !== "recorded-demo") {
        return { connection: "http" };
      }
      if (payload?.dataSource === "recorded-demo") {
        return {
          payload,
          lastUpdated: recordedLastUpdated(payload, state.lastUpdated),
          connection: "http",
        };
      }
      return {
        payload,
        lastUpdated: payload?.lastUpdated ?? new Date().toISOString(),
        connection: payload?.error ? "error" : state.connection === "error" ? "http" : state.connection,
      };
    }),
  setServers: (servers) => set({ servers }),
  setActiveServerId: (activeServerId) => {
    writeStoredServerId(activeServerId);
    set({ activeServerId });
  },
  setActiveFarmId: (activeFarmId) => set({ activeFarmId }),
  setSection: (section, params = {}) => {
    const next = normalizeSectionId(section);
    rememberSection(next);
    writeHash(next, params);
    set({ section: next, sectionParams: params });
  },
  setSectionParams: (params) => {
    const { section } = get();
    writeHash(section, params);
    set({ sectionParams: params });
  },
  clearSectionParams: () => {
    const { section } = get();
    writeHash(section, {});
    set({ sectionParams: {} });
  },
  setEnabledSections: (enabledSections) => set({ enabledSections }),
  setConnection: (connection) =>
    set((state) => state.connection === connection ? state : { connection }),
  setLocale: (locale) => {
    applyLocale(locale);
    set({ locale: getLocale() });
  },
  setViewerFillUnitMode: (viewerFillUnitMode) => {
    try {
      if (viewerFillUnitMode) localStorage.setItem("farmdash_viewer_fill_unit", viewerFillUnitMode);
      else localStorage.removeItem("farmdash_viewer_fill_unit");
    } catch {
      return false;
    }
    set({ viewerFillUnitMode });
    return true;
  },
}));

export function applyPayloadToStore(payload: DashboardPayload) {
  const store = useDashboardStore.getState();
  if (payload?.dataSource === "recorded-demo" || demoWritesAreLocked()) {
    if (payload?.dataSource === "recorded-demo") {
      store.setPayload(payload);
      store.setConnection("http");
    }
    return;
  }
  store.setPayload(payload);
  if (!payload.error) {
    store.setConnection("ws");
  }
  const sid = store.activeServerId;
  if (!sid || payload.error) return;
  const savegameNameRaw = String(payload.savegameName || "").trim();
  const savegameName = /^savegame\d+$/i.test(savegameNameRaw) ? "" : savegameNameRaw;
  const mapTitle = String(
    payload.mapTitle || payload.serverInfo?.mapName || "",
  ).trim();
  if (!savegameName && !mapTitle) return;
  let changed = false;
  const next = store.servers.map((srv) => {
    if (String(srv.id) !== String(sid)) return srv;
    if ((!savegameName || srv.savegameName === savegameName)
      && (!mapTitle || srv.mapTitle === mapTitle)) return srv;
    changed = true;
    return {
      ...srv,
      ...(savegameName ? { savegameName } : {}),
      ...(mapTitle ? { mapTitle } : {}),
    };
  });
  if (changed) store.setServers(next);
}

export function farmStorageKey(serverId: string | null | undefined): string {
  return `dashboard_active_farm_${String(serverId || "default")}`;
}

export function readStoredFarmId(serverId: string | null | undefined): number | null {
  try {
    const raw = localStorage.getItem(farmStorageKey(serverId));
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeStoredFarmId(serverId: string | null | undefined, farmId: number): void {
  try {
    localStorage.setItem(farmStorageKey(serverId), String(farmId));
  } catch {
    /* ignore */
  }
}

/** Sync store from browser hash (popstate / hashchange). */
export function syncSectionFromHash() {
  const { section, params } = parseLocationHash();
  const state = useDashboardStore.getState();
  if (state.section === section && JSON.stringify(state.sectionParams) === JSON.stringify(params)) {
    // Still normalize legacy `#/economy/storage` / `#/economy/redtape` / invoices|hirepurchasing URLs.
    writeHash(section, params);
    return;
  }
  rememberSection(section);
  writeHash(section, params);
  useDashboardStore.setState({ section, sectionParams: params });
}
