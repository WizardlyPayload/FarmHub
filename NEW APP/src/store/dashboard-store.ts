import { create } from "zustand";
import type {
  DashboardPayload,
  FarmDashServer,
  SectionId,
  SectionParams,
} from "@/types/dashboard";
import { normalizeSectionId } from "@/types/dashboard";

const LAST_SECTION_KEY = "farmdash_last_section";
const DEFAULT_SECTION_PREF_KEY = "farmdash_default_section";
const ACTIVE_SERVER_KEY = "farmdash_active_server_v1";

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
    if (!id) localStorage.removeItem(ACTIVE_SERVER_KEY);
    else localStorage.setItem(ACTIVE_SERVER_KEY, String(id));
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
  locale: localStorage.getItem("farmdash_locale") || "en",

  setPayload: (payload) =>
    set((state) => ({
      payload,
      lastUpdated: payload?.lastUpdated ?? new Date().toISOString(),
      connection: payload?.error ? "error" : state.connection === "error" ? "http" : state.connection,
    })),
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
  setConnection: (connection) => set({ connection }),
  setLocale: (locale) => {
    localStorage.setItem("farmdash_locale", locale);
    set({ locale });
    // Keep i18n catalog locale in sync (dynamic import avoids circular deps at module init).
    void import("@/i18n/i18n").then((m) => m.setLocale(locale));
  },
}));

export function applyPayloadToStore(payload: DashboardPayload) {
  useDashboardStore.getState().setPayload(payload);
  if (!payload.error) {
    useDashboardStore.getState().setConnection("ws");
  }
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
