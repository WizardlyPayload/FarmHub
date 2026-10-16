export type SettingsDomain = "display" | "connection" | "mod" | "lan" | "viewer";

/** Which save writers a settings save may call. Unchanged domains are omitted. */
export function settingsDomainsToWrite(input: {
  displayChanged: boolean;
  connectionChanged: boolean;
  modChanged: boolean;
  lanChanged: boolean;
  viewerChanged?: boolean;
}): SettingsDomain[] {
  const domains: SettingsDomain[] = [];
  if (input.displayChanged) domains.push("display");
  if (input.connectionChanged) domains.push("connection");
  if (input.modChanged) domains.push("mod");
  if (input.lanChanged) domains.push("lan");
  if (input.viewerChanged) domains.push("viewer");
  return domains;
}

export function displaySaveBody(input: {
  sections: unknown;
  excluded: unknown;
  clusterPrefs: Record<string, { manualGroups?: number[][] } | undefined>;
  simHub: unknown;
  useNewUi: boolean;
  newUiLocked: boolean;
  defaultSection: unknown;
}): {
  sections: unknown;
  excludedFarmlandIdsByServer: unknown;
  fieldClusterPrefsByServer: Record<string, { autoMerge: false; manualGroups: number[][] }>;
  simHubView: unknown;
  useNewUi: boolean;
  defaultSection: unknown;
} {
  return {
    sections: input.sections,
    excludedFarmlandIdsByServer: input.excluded,
    fieldClusterPrefsByServer: Object.fromEntries(
      Object.entries(input.clusterPrefs || {}).map(([sid, pref]) => [
        sid,
        { autoMerge: false as const, manualGroups: pref?.manualGroups || [] },
      ]),
    ),
    simHubView: input.simHub,
    useNewUi: input.newUiLocked ? true : input.useNewUi,
    defaultSection: input.defaultSection,
  };
}

export function displaySnapshot(input: Parameters<typeof displaySaveBody>[0]): string {
  return JSON.stringify(displaySaveBody(input));
}

/**
 * Loaded module flags overlay the defaults. An explicit false from the game
 * config stays false. There is no versioned migration that turns collectors back on.
 */
export function mergeLoadedModModules(
  defaults: Record<string, boolean>,
  loaded: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  return { ...defaults, ...(loaded || {}) };
}

export function loadModDraft(
  modCfg: {
    updateInterval?: number;
    collectionCycleMs?: number;
    modules?: Record<string, boolean>;
    revision?: string | null;
    configPath?: string;
  } | null | undefined,
  moduleNames: readonly string[],
): {
  updateInterval: number;
  collectionCycleMs: number;
  modules: Record<string, boolean>;
  revision: string;
  configPath?: string;
} {
  const defaults = Object.fromEntries(moduleNames.map((name) => [name, true]));
  return {
    updateInterval: modCfg?.updateInterval ?? 10000,
    collectionCycleMs: modCfg?.collectionCycleMs ?? 60000,
    modules: mergeLoadedModModules(defaults, modCfg?.modules),
    revision: typeof modCfg?.revision === "string" ? modCfg.revision : "",
    configPath: modCfg?.configPath,
  };
}

export type SettingsSaveState = {
  displayNow: string;
  displayBaseline: string;
  connectionNow: string;
  connectionBaseline: string;
  modNow: string;
  modBaseline: string;
  modRevision: string;
  lanNow: string;
  lanBaseline: string;
  lanSecretPending: boolean;
  viewerNow?: string;
  viewerBaseline?: string;
};

export type SettingsWriterResult = {
  ok?: boolean;
  error?: string;
  revision?: string;
  restartRequired?: boolean;
  keptExisting?: boolean;
};

export type SettingsWriters = {
  saveDisplay: () => Promise<SettingsWriterResult | undefined>;
  saveConnection: () => Promise<SettingsWriterResult | undefined>;
  saveMod: (expectedRevision: string) => Promise<SettingsWriterResult | undefined>;
  saveLan: () => Promise<SettingsWriterResult | undefined>;
  saveViewer?: () => Promise<SettingsWriterResult | undefined>;
};

export type SettingsSaveResult = {
  attempted: SettingsDomain[];
  committed: SettingsDomain[];
  failed: SettingsDomain | null;
  error?: string;
  dirty: SettingsDomain[];
  displayBaseline: string;
  connectionBaseline: string;
  modBaseline: string;
  modRevision: string;
  lanBaseline: string;
  viewerBaseline: string;
  clearLanSecret: boolean;
  displayResult?: SettingsWriterResult;
};

async function callWriter(
  fn: () => Promise<SettingsWriterResult | undefined>,
): Promise<SettingsWriterResult> {
  try {
    return (await fn()) || { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The settings Save button. Writers run only for domains whose snapshot differs
 * from the last committed baseline. A failure leaves that domain and every
 * later unattempted domain dirty, and does not roll back domains already committed.
 */
export async function runSettingsSave(
  state: SettingsSaveState,
  writers: SettingsWriters,
): Promise<SettingsSaveResult> {
  const viewerNow = state.viewerNow ?? "";
  const viewerBaseline = state.viewerBaseline ?? "";
  const pending = settingsDomainsToWrite({
    displayChanged: state.displayNow !== state.displayBaseline,
    connectionChanged: state.connectionNow !== state.connectionBaseline,
    modChanged: state.modNow !== state.modBaseline,
    lanChanged: state.lanSecretPending || state.lanNow !== state.lanBaseline,
    viewerChanged: viewerNow !== viewerBaseline,
  });
  const dirty = new Set(pending);
  const result: SettingsSaveResult = {
    attempted: [...pending],
    committed: [],
    failed: null,
    dirty: [...pending],
    displayBaseline: state.displayBaseline,
    connectionBaseline: state.connectionBaseline,
    modBaseline: state.modBaseline,
    modRevision: state.modRevision,
    lanBaseline: state.lanBaseline,
    viewerBaseline,
    clearLanSecret: false,
  };

  if (pending.includes("display")) {
    const res = await callWriter(() => writers.saveDisplay());
    result.displayResult = res;
    if (res.ok === false) {
      result.failed = "display";
      result.error = res.error || "display";
      result.dirty = [...dirty];
      return result;
    }
    result.displayBaseline = state.displayNow;
    result.committed.push("display");
    dirty.delete("display");
  }

  if (pending.includes("connection")) {
    const res = await callWriter(() => writers.saveConnection());
    if (res.ok === false) {
      result.failed = "connection";
      result.error = res.error || "connection";
      result.dirty = [...dirty];
      return result;
    }
    result.connectionBaseline = state.connectionNow;
    result.committed.push("connection");
    dirty.delete("connection");
  }

  if (pending.includes("mod")) {
    const res = await callWriter(() => writers.saveMod(result.modRevision));
    if (res.ok === false) {
      result.failed = "mod";
      result.error = res.error || "mod";
      result.dirty = [...dirty];
      return result;
    }
    result.modBaseline = state.modNow;
    if (typeof res.revision === "string" && res.revision !== "") result.modRevision = res.revision;
    result.committed.push("mod");
    dirty.delete("mod");
  }

  if (pending.includes("lan")) {
    const res = await callWriter(() => writers.saveLan());
    if (res.ok === false) {
      result.failed = "lan";
      result.error = res.error || "lan";
      result.dirty = [...dirty];
      return result;
    }
    result.lanBaseline = state.lanNow;
    result.clearLanSecret = true;
    result.committed.push("lan");
    dirty.delete("lan");
  }

  if (pending.includes("viewer")) {
    const res = await callWriter(() => writers.saveViewer?.() ?? Promise.resolve({ ok: false, error: "fill-unit-storage" }));
    if (res.ok === false) {
      result.failed = "viewer";
      result.error = res.error || "fill-unit-storage";
      result.dirty = [...dirty];
      return result;
    }
    result.viewerBaseline = viewerNow;
    result.committed.push("viewer");
    dirty.delete("viewer");
  }

  result.dirty = [...dirty];
  return result;
}
