/** Typed wrapper around `window.farmDashAPI` (Electron preload). Null in plain browser. */

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
  saveModConfig: (cfg: ModConfig) => Promise<{ ok?: boolean; error?: string }>;
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

export function getFarmDashApi(): FarmDashAPI | null {
  if (typeof window !== "undefined" && window.farmDashAPI) {
    return window.farmDashAPI;
  }
  return null;
}

export function hasFarmDashApi(): boolean {
  return getFarmDashApi() != null;
}
