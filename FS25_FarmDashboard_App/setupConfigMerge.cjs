// FS25 FarmDashboard | setupConfigMerge.cjs
// Persist-safe merge for Settings / first-run config (keeps FTP secrets; refuses empty wipe).

function mergeServersPreserveSecrets(prevServers, incomingServers) {
  if (!Array.isArray(incomingServers)) return [];
  const prevById = new Map((prevServers || []).map((s) => [String(s.id), s]));
  return incomingServers.map((inc) => {
    if (!inc || typeof inc !== "object") return inc;
    const prev = prevById.get(String(inc.id));
    const out = { ...inc };
    delete out.ftpPassSet;
    delete out.httpFeedCodeSet;
    if (inc.mode === "ftp" && prev) {
      const emptyPass = inc.ftpPass == null || String(inc.ftpPass).trim() === "";
      if (emptyPass && prev.ftpPass) out.ftpPass = prev.ftpPass;
    }
    const emptyCode = inc.httpFeedCode == null || String(inc.httpFeedCode).trim() === "";
    if (emptyCode && prev && prev.httpFeedCode) out.httpFeedCode = prev.httpFeedCode;
    const registration = inc.replicaRegistration;
    if (registration && typeof registration === "object" && !Array.isArray(registration)) {
      // The renderer never sees the pairing; an empty value on an existing row means "unchanged", not "clear".
      // Unlinking is done by removing the row.
      const nextRegistration = { ...registration };
      delete nextRegistration.sessionPairingSet;
      const emptyPairing = nextRegistration.sessionPairing == null || String(nextRegistration.sessionPairing).trim() === "";
      const prevPairing = prev && prev.replicaRegistration && typeof prev.replicaRegistration === "object"
        ? prev.replicaRegistration.sessionPairing : null;
      if (emptyPairing && typeof prevPairing === "string" && prevPairing) nextRegistration.sessionPairing = prevPairing;
      out.replicaRegistration = nextRegistration;
    }
    return out;
  });
}

/**
 * Empty `servers: []` from a race (Save before settings finished loading) must not
 * erase an existing save list on disk.
 */
function resolveServersForSave(prevServers, incomingServers) {
  const prev = Array.isArray(prevServers) ? prevServers : [];
  if (!Array.isArray(incomingServers)) {
    return { servers: prev.slice(), keptExisting: prev.length > 0 };
  }
  if (incomingServers.length === 0 && prev.length > 0) {
    return { servers: prev.slice(), keptExisting: true };
  }
  return {
    servers: mergeServersPreserveSecrets(prev, incomingServers),
    keptExisting: false,
  };
}

function secretRevision(v) {
  const s = String(v || "");
  if (!s) return "0";
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${s.length}:${(h >>> 0).toString(16)}`;
}

function replicaRuntimeIdentity(server) {
  if (!server || server.replicaRegistration == null) return null;
  const registration = server.replicaRegistration;
  if (typeof registration !== "object" || Array.isArray(registration)) {
    return { remoteSlot: "", sessionPairing: "" };
  }
  return {
    remoteSlot: typeof registration.remoteSlot === "string" ? registration.remoteSlot.trim() : "",
    sessionPairing: typeof registration.sessionPairing === "string" ? registration.sessionPairing.trim() : "",
  };
}

function serverRuntimeIdentity(server) {
  if (!server || typeof server !== "object") return null;
  return {
    id: server.id,
    enabled: server.enabled !== false,
    mode: server.mode,
    localSubFolder: server.localSubFolder || "",
    localPath: server.localPath || "",
    replicaRemoteSlot: server.replicaRemoteSlot || "",
    ftpSavegameRemoteDir: server.ftpSavegameRemoteDir || "",
    ftpHost: server.ftpHost || "",
    ftpPort: server.ftpPort || "",
    ftpUser: server.ftpUser || "",
    ftpBasePath: server.ftpBasePath || "",
    ftpPass: secretRevision(server.ftpPass),
    ftpSecure: String(server.ftpSecure ?? ""),
    ftpFtps: String(server.ftpFtps ?? ""),
    ftpAllowInsecureTls: String(server.ftpAllowInsecureTls ?? ""),
    httpFeedSecure: String(server.httpFeedSecure ?? ""),
    httpFeedHost: server.httpFeedHost || "",
    httpFeedPort: server.httpFeedPort || "",
    httpFeedCode: secretRevision(server.httpFeedCode),
    replicaRegistration: replicaRuntimeIdentity(server),
  };
}

function serverListSignature(servers) {
  return JSON.stringify((Array.isArray(servers) ? servers : []).map(serverRuntimeIdentity));
}

function ftpPollingEqual(a, b) {
  const x = a && typeof a === "object" ? a : {};
  const y = b && typeof b === "object" ? b : {};
  return (
    Number(x.initialDelaySeconds ?? 0) === Number(y.initialDelaySeconds ?? 0) &&
    Number(x.intervalMinutes ?? 5) === Number(y.intervalMinutes ?? 5) &&
    String(x.scheduleMode || "sync") === String(y.scheduleMode || "sync")
  );
}

function canonicalFtpPolling(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    initialDelaySeconds: Number(source.initialDelaySeconds ?? 0),
    intervalMinutes: Number(source.intervalMinutes ?? 5),
    scheduleMode: String(source.scheduleMode || "sync"),
  };
}

function runtimeRestartSignature(config) {
  const source = config && typeof config === "object" ? config : {};
  return JSON.stringify({
    servers: serverListSignature(source.servers),
    ftpPolling: canonicalFtpPolling(source.ftpPolling),
  });
}

function configNeedsServerReboot(prevConfig, nextConfig) {
  return runtimeRestartSignature(prevConfig) !== runtimeRestartSignature(nextConfig);
}

/** Union by id: keep local/dev rows, then append installed-only ids (dev:new-ui --sync-config). */
function unionServersById(installedServers, localServers) {
  const inst = Array.isArray(installedServers) ? installedServers : [];
  const local = Array.isArray(localServers) ? localServers : [];
  if (local.length === 0) return inst.slice();
  const seen = new Set();
  const out = [];
  for (const s of local) {
    if (!s || s.id == null) continue;
    const id = String(s.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(s);
  }
  for (const s of inst) {
    if (!s || s.id == null) continue;
    const id = String(s.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(s);
  }
  return out;
}

module.exports = {
  mergeServersPreserveSecrets,
  resolveServersForSave,
  replicaRuntimeIdentity,
  serverRuntimeIdentity,
  serverListSignature,
  canonicalFtpPolling,
  runtimeRestartSignature,
  ftpPollingEqual,
  configNeedsServerReboot,
  unionServersById,
};
