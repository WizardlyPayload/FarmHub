/** Loose field row from merged dashboard /api payload (Lua + XML). */
export type FieldRecord = Record<string, any>;

export type FieldSuggestion = {
  action: string;
  actionKey?: string;
  reason?: string;
  source: "rules";
  kind?: string;
};

export type GameSettings = Record<string, unknown>;

export type RulesEngineOpts = {
  gameSettings?: GameSettings;
  skippedOptionalOrganic?: Record<string, boolean>;
};

export type ToolRoleMatch = {
  owned: { roleId: string; matches: string[] }[];
  missing: { roleId: string; labelKey: string }[];
};

export type FieldCluster = {
  clusterId: string;
  fields: FieldRecord[];
};

export type FieldClusterPref = {
  /** Ignored. Nearby same-crop auto-merge was removed; GPS blobs + manual groups only. */
  autoMerge?: boolean;
  manualGroups?: number[][];
};
