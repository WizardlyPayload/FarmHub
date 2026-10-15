/** Typed wrapper around `window.farmDashAPI` (Electron preload). Null in plain browser. */

import { demoWritesAreLocked, denyDemoMutation } from "@/platform/demo-source";

export type SettingsTabKey = "dashboard" | "servers" | "mod" | "theme" | "health" | "about";

export type SectionKey =
  | "livestock"
  | "vehicles"
  | "fields"
  | "economy"
  | "pastures"
  | "productions"
  | "storage"
  | "redtape"
  | "ads"
  | "moisture";

export interface UiPreferences {
  sections?: Partial<Record<SectionKey, boolean>>;
  excludedFarmlandIdsByServer?: Record<string, number[]>;
  fieldClusterPrefsByServer?: Record<
    string,
    { autoMerge?: boolean; manualGroups: number[][] }
  >;
  simHubView?: SimHubViewPrefs;
  useNewUi?: boolean;
  /** V5 always serves NEW APP — hide the classic-UI toggle. */
  newUiLocked?: boolean;
  productLine?: "v5" | "rf" | "classic" | string;
  /** overview | last | specific section id */
  defaultSection?: string;
}

export interface SimHubViewPrefs {
  enabled?: boolean;
  view?: "fields" | "pastures" | "production";
  fieldClusterIds?: string[];
  pastureIds?: number[];
  productionKeys?: string[];
}

export interface FarmDashConfigServer {
  id: string;
  name: string;
  mode?: "local" | "ftp";
  localPath?: string;
  localSubFolder?: string;
  replicaRemoteSlot?: string;
  legacyJson?: boolean;
  sourceKey?: string;
  bindingStatus?: "registration-mismatch" | "registration-recovery";
  replicaRegistration?: { remoteSlot?: string; sessionPairing?: string; sessionPairingSet?: boolean };
  ftpHost?: string;
  ftpPort?: number | string;
  ftpUser?: string;
  ftpPass?: string;
  ftpBasePath?: string;
  httpFeedHost?: string;
  httpFeedPort?: number | string;
  httpFeedCode?: string;
}

export interface FarmDashConfig {
  isConfigured?: boolean;
  servers?: FarmDashConfigServer[];
  ftpPolling?: {
    initialDelaySeconds?: number;
    intervalMinutes?: number;
    scheduleMode?: "sync" | "staggered";
  };
  [key: string]: unknown;
}

export interface LanAccessSettings {
  lanAccessEnabled?: boolean;
  lanUsername?: string;
  lanPassword?: string;
  lanAllowedIPs?: string;
  lanAuthOptional?: boolean;
}

export interface ModConfig {
  updateInterval?: number;
  collectionCycleMs?: number;
  modules?: Record<string, boolean>;
  configPath?: string;
  path?: string;
  presence?: "missing" | "ok" | "malformed" | "unreadable" | "duplicate";
  revision?: string | null;
  exists?: boolean;
  error?: string;
  expectedRevision?: string;
}

export interface FarmDashAPI {
  getCurrentConfig: () => Promise<FarmDashConfig>;
  saveSettings: (
    config: FarmDashConfig
  ) => Promise<{ ok?: boolean; error?: string; keptExisting?: boolean; rebooted?: boolean } | void>;
  launchDashboard?: () => Promise<{
    ok?: boolean;
    error?: string;
    stage?: string;
  }>;
  scanLocalSaves: () => Promise<unknown>;
  getPendingReplicaSession?: () => Promise<PendingReplicaSessionState>;
  approvePendingReplicaSession?: (pendingId: string) => Promise<{ ok?: boolean; error?: string; sourceId?: string; name?: string }>;
  declinePendingReplicaSession?: (pendingId: string) => Promise<{ ok?: boolean }>;
  getOrphanReplicaRecovery?: () => Promise<OrphanReplicaRecoveryState>;
  startOrphanReplicaChallenge?: (offerId: string) => Promise<{ ok?: boolean; error?: string; challengeId?: string }>;
  cancelOrphanReplicaChallenge?: (offerId: string, challengeId?: string) => Promise<{ ok?: boolean; error?: string }>;
  restoreOrphanReplica?: (offerId: string, challengeId?: string) => Promise<{ ok?: boolean; error?: string; sourceId?: string }>;
  openSetup: () => void;
  resetSettings: () => void;
  getStoredLocale: () => Promise<string>;
  setStoredLocale: (code: string) => void;
  getTranslationsJson: () => Promise<Record<string, Record<string, string>>>;
  getUiPreferences: () => Promise<UiPreferences>;
  saveUiPreferences: (prefs: UiPreferences) => Promise<unknown>;
  getLanAccessSettings: () => Promise<LanAccessSettings>;
  saveLanAccessSettings: (
    payload: LanAccessSettings,
  ) => Promise<{ ok?: boolean; error?: string }>;
  getDesktopAppVersion: () => Promise<string>;
  checkDesktopAppUpdates: () => Promise<{ ok?: boolean; reason?: string }>;
  exportModStoreImages: (opts?: { suppressNativeDialog?: boolean }) => Promise<unknown>;
  getFieldExclusionOptions: (payload: {
    activeFarmId?: number | null;
  }) => Promise<{ rows?: FieldExclusionRow[] }>;
  getModConfig: () => Promise<ModConfig>;
  saveModConfig: (cfg: ModConfig) => Promise<{ ok?: boolean; error?: string; revision?: string }>;
  readLocalFarmdashDataJson: () => Promise<unknown>;
  readServerLiveCache: (serverId: string) => Promise<unknown>;
  setSimHubLiveContext: (payload: {
    serverId?: string | null;
    farmId?: number | null;
  }) => Promise<unknown>;
  onAppUpdateStatus: (cb: (payload: unknown) => void) => () => void;
  subscribeExportModStoreImagesProgress: (cb: (payload: unknown) => void) => () => void;
  getSetupStatus?: () => Promise<unknown>;
  runSetupHandshake?: () => Promise<unknown>;
  restoreLanDefaults?: () => Promise<{ ok?: boolean; error?: string }>;
}

/** A joined server waiting for "Link this server?". The session token never reaches the renderer. */
export interface PendingReplicaSession {
  pendingId: string;
  careerId: string;
  sourceSlot: string;
  mapTitle: string;
  serverName: string;
}

export type PendingReplicaSessionState =
  | { state: "none" | "declined" | "unavailable" }
  | { state: "invalid"; error?: string | null }
  | { state: "pending"; session: PendingReplicaSession }
  | { state: "linked"; sourceId: string; session: PendingReplicaSession };

/** A read-only offer. The pairing value and registration digest stay in the main process. */
export interface OrphanReplicaRecoveryOffer {
  offerId: string;
  sourceId: string;
  sourceSlot: string;
}

export type OrphanReplicaRecoveryState =
  | { state: "none" }
  | { state: "offer" | "waiting" | "verified"; offer: OrphanReplicaRecoveryOffer; error?: string; challengeId?: string };

export interface FieldExclusionRow {
  serverId?: string;
  farmlandId?: number;
  label?: string;
  name?: string;
}

declare global {
  interface Window {
    farmDashAPI?: FarmDashAPI;
    __farmDashRemoteViewer?: boolean;
    __FARMDASH_SETUP_TOKEN?: string;
    __farmdashLanFetchPatched?: boolean;
  }
}

const RECORDED_SAFE_METHODS = new Set([
  "getTranslationsJson",
  "getStoredLocale",
  "getDesktopAppVersion",
]);

type BridgeMethod = (...args: unknown[]) => unknown;

const guardedBridges = new WeakMap<object, FarmDashAPI>();

/**
 * Electron's contextBridge object is frozen with non-configurable, non-writable properties, so a
 * Proxy over it may not return wrapped functions. The empty extensible target lets the facade
 * return guarded wrappers while every read is forwarded to the raw bridge.
 */
function guardBridge(api: FarmDashAPI): FarmDashAPI {
  const raw = api as unknown as Record<PropertyKey, unknown>;
  const wrapped = new Map<string, { method: BridgeMethod; guarded: BridgeMethod }>();
  const read = (prop: PropertyKey): unknown => {
    const value = raw[prop];
    if (typeof prop !== "string" || typeof value !== "function") return value;
    const cached = wrapped.get(prop);
    if (cached && cached.method === value) return cached.guarded;
    const method = value as BridgeMethod;
    const guarded: BridgeMethod = (...args) => {
      if (demoWritesAreLocked() && !RECORDED_SAFE_METHODS.has(prop)) {
        return Promise.resolve(denyDemoMutation(prop));
      }
      return method.apply(api, args);
    };
    wrapped.set(prop, { method, guarded });
    return guarded;
  };
  return new Proxy({} as FarmDashAPI, {
    get: (_target, prop) => read(prop),
    has: (_target, prop) => prop in raw,
    ownKeys: () => Reflect.ownKeys(raw),
    getOwnPropertyDescriptor: (_target, prop) => {
      const own = Reflect.getOwnPropertyDescriptor(raw, prop);
      if (!own) return undefined;
      return { value: read(prop), writable: false, enumerable: own.enumerable, configurable: true };
    },
    getPrototypeOf: () => Reflect.getPrototypeOf(raw),
    set: () => false,
    defineProperty: () => false,
    deleteProperty: () => false,
  });
}

export function getFarmDashApi(): FarmDashAPI | null {
  if (typeof window === "undefined" || !window.farmDashAPI) return null;
  const api = window.farmDashAPI;
  let guarded = guardedBridges.get(api);
  if (!guarded) {
    guarded = guardBridge(api);
    guardedBridges.set(api, guarded);
  }
  return guarded;
}

export function hasFarmDashApi(): boolean {
  return getFarmDashApi() != null;
}
