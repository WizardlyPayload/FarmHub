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

function serverListSignature(servers) {
  return (Array.isArray(servers) ? servers : [])
    .map((s) => {
      if (!s || typeof s !== "object") return "";
      return [
        s.id,
        s.mode,
        s.localSubFolder || "",
        s.localPath || "",
        s.ftpHost || "",
        s.ftpPort || "",
        s.ftpUser || "",
        s.ftpBasePath || "",
        secretRevision(s.ftpPass),
        String(s.ftpSecure ?? ''),
        String(s.ftpFtps ?? ''),
        String(s.ftpAllowInsecureTls ?? ''),
        String(s.httpFeedSecure ?? ''),
        s.httpFeedHost || "",
        s.httpFeedPort || "",
        secretRevision(s.httpFeedCode),
        s.name || "",
      ].join("|");
    })
    .join(";");
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

function configNeedsServerReboot(prevConfig, nextConfig) {
  const prev = prevConfig && typeof prevConfig === "object" ? prevConfig : {};
  const next = nextConfig && typeof nextConfig === "object" ? nextConfig : {};
  if (serverListSignature(prev.servers) !== serverListSignature(next.servers)) return true;
  if (!ftpPollingEqual(prev.ftpPolling, next.ftpPolling)) return true;
  return false;
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
  serverListSignature,
  ftpPollingEqual,
  configNeedsServerReboot,
  unionServersById,
};
