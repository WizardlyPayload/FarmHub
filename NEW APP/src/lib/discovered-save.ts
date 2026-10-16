import type { FarmDashConfigServer } from "../services/electron-bridge";

export type DiscoveryContext = {
  defaultDashboardRoot?: string | null;
};

export type DiscoveryConflict = {
  id: string;
  reason: "binding-conflict" | "registration-mismatch";
};

export type DiscoveryRecovery = {
  id: string;
  reason: "registration-recovery";
};

export type DiscoveryUnresolved = {
  id: string;
  reason: "default-root-unresolved";
};

function normalizedRoot(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/[\\/]+/g, "/")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

function remoteSlotOf(server: { replicaRemoteSlot?: unknown; replicaRegistration?: unknown }): string {
  const direct = String(server.replicaRemoteSlot || "").trim().toLowerCase();
  const registration = server.replicaRegistration;
  const registered = registration && typeof registration === "object" && !Array.isArray(registration)
    ? String((registration as { remoteSlot?: unknown }).remoteSlot || "").trim().toLowerCase()
    : "";
  return direct || registered;
}

function locatedRoot(
  server: { mode?: unknown; localPath?: unknown },
  context: DiscoveryContext,
): { root: string; unresolved: boolean } {
  const explicit = normalizedRoot(server.localPath);
  if (explicit) return { root: explicit, unresolved: false };
  if (String(server.mode || "") === "ftp") return { root: "", unresolved: false };
  const fallback = normalizedRoot(context.defaultDashboardRoot);
  if (fallback) return { root: fallback, unresolved: false };
  return { root: "", unresolved: true };
}

function identityOf(
  server: FarmDashConfigServer,
  context: DiscoveryContext,
): { id: string; kind: string; binding: string; physical: string | null; unresolved: boolean } {
  const remote = remoteSlotOf(server);
  const slot = String(server.localSubFolder || "").trim().toLowerCase();
  const located = locatedRoot(server, context);
  const kind = String(server.mode || "") === "ftp" ? "ftp" : remote ? "replica" : "local";
  const id = String(server.id || "").trim();
  const host = String(server.ftpHost || "").trim().toLowerCase();
  const physical = located.unresolved
    ? null
    : kind === "ftp"
      ? `ftp:${host}:${slot}`
      : kind === "replica"
        ? `replica:${located.root}:${id}:${remote}`
        : `local:${located.root}:${slot}`;
  return {
    id,
    kind,
    binding: `${kind}|${located.root}|${slot}|${remote}`,
    physical,
    unresolved: located.unresolved,
  };
}

export function discoveryContextFromScan(result: unknown): DiscoveryContext {
  if (!result || Array.isArray(result) || typeof result !== "object") return { defaultDashboardRoot: null };
  const value = (result as { defaultDashboardRoot?: unknown }).defaultDashboardRoot;
  return { defaultDashboardRoot: typeof value === "string" && value.trim() ? value : null };
}

export function discoveredServerFromScan(save: Record<string, unknown>, index: number): FarmDashConfigServer | null {
  const folder = String(save.localSubFolder || save.folder || "").trim();
  const localPath = String(save.localPath || "").trim();
  if (!folder || !localPath) return null;
  const remote = typeof save.replicaRemoteSlot === "string" ? save.replicaRemoteSlot.trim() : "";
  const stableId = typeof save.id === "string" ? save.id.trim() : "";
  if (remote && !stableId) return null;
  const row: FarmDashConfigServer = {
    id: remote ? stableId : `srv_${Date.now()}_${index}`,
    name: String(save.name || folder),
    mode: "local",
    localSubFolder: folder,
    localPath,
  };
  if (remote) row.replicaRemoteSlot = remote;
  if (save.legacyJson === true) row.legacyJson = true;
  if (save.bindingStatus === "registration-mismatch" || save.bindingStatus === "registration-recovery") {
    row.bindingStatus = save.bindingStatus;
  }
  return row;
}

export function importDiscoveredSaves(
  existing: FarmDashConfigServer[],
  saves: Array<Record<string, unknown>>,
  context: DiscoveryContext = {},
): {
  added: FarmDashConfigServer[];
  conflicts: DiscoveryConflict[];
  recoveries: DiscoveryRecovery[];
  unresolved: DiscoveryUnresolved[];
  allDetected: boolean;
  awaitingFirstExport: string[];
} {
  const added: FarmDashConfigServer[] = [];
  const awaitingFirstExport: string[] = [];
  const conflicts: DiscoveryConflict[] = [];
  const recoveries: DiscoveryRecovery[] = [];
  const unresolved: DiscoveryUnresolved[] = [];
  const seenIds = new Map<string, ReturnType<typeof identityOf>>();
  const seenPhysical = new Set<string>();
  let existingRootUnresolved = false;
  for (const server of existing || []) {
    const info = identityOf(server, context);
    if (info.id) seenIds.set(info.id, info);
    if (info.physical) seenPhysical.add(info.physical);
    if (info.unresolved) {
      existingRootUnresolved = true;
      unresolved.push({ id: info.id, reason: "default-root-unresolved" });
    }
  }
  let readable = 0;
  for (const save of saves || []) {
    const row = discoveredServerFromScan(save, added.length);
    if (!row) continue;
    readable += 1;
    if (row.bindingStatus === "registration-recovery") {
      recoveries.push({ id: row.id, reason: "registration-recovery" });
      continue;
    }
    if (row.bindingStatus === "registration-mismatch") {
      conflicts.push({ id: row.id, reason: "registration-mismatch" });
      continue;
    }
    if (remoteSlotOf(row) && !existing.some((server) =>
      String(server.id) === row.id &&
      !!server.replicaRegistration
    )) {
      // A retained game-side replica is an offer for key-bound recovery, not a new app link.
      recoveries.push({ id: row.id, reason: "registration-recovery" });
      continue;
    }
    const info = identityOf(row, context);
    if (info.physical && seenPhysical.has(info.physical)) continue;
    const prior = info.id ? seenIds.get(info.id) : undefined;
    if (prior) {
      if (prior.binding !== info.binding) conflicts.push({ id: info.id, reason: "binding-conflict" });
      continue;
    }
    if (info.unresolved || (existingRootUnresolved && info.kind === "local")) {
      unresolved.push({ id: info.id || row.id, reason: "default-root-unresolved" });
      continue;
    }
    if (info.id) seenIds.set(info.id, info);
    if (info.physical) seenPhysical.add(info.physical);
    added.push(row);
    // Pending careers are imported like any local source; the marker stays out of the saved row.
    if (save.awaitingFirstExport === true && info.kind === "local") awaitingFirstExport.push(row.id);
  }
  return {
    added,
    conflicts,
    recoveries,
    unresolved,
    allDetected: readable > 0 && added.length === 0 && conflicts.length === 0 && recoveries.length === 0 && unresolved.length === 0,
    awaitingFirstExport,
  };
}

export function discoveryFeedback(
  imported: { added: FarmDashConfigServer[]; conflicts: DiscoveryConflict[]; recoveries?: DiscoveryRecovery[]; unresolved: DiscoveryUnresolved[]; allDetected: boolean },
  hadSaves: boolean,
): "recovery" | "conflict" | "unresolved" | "added" | "all" | "none" {
  if (imported.recoveries && imported.recoveries.length) return "recovery";
  if (imported.conflicts.length) return "conflict";
  if (imported.unresolved.length && imported.added.length === 0) return "unresolved";
  if (imported.added.length) return "added";
  if (hadSaves && imported.allDetected) return "all";
  return "none";
}
