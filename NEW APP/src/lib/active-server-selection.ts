/** Browser selection keys. The classic key is read only during a first NEW APP selection. */
export const ACTIVE_SERVER_KEY = "farmdash_active_server_v1";
export const ACTIVE_CAREER_KEY = "farmdash_active_career_v1";
const CLASSIC_ACTIVE_SERVER_KEY = "dashboard_active_server";

type ServerRow = { id: string | number; sourceBinding?: unknown };
type SelectionStorage = Pick<Storage, "getItem" | "setItem">;

function matchingId(servers: ServerRow[], value: string | null | undefined): string | null {
  const id = String(value || "").trim();
  if (!id) return null;
  const match = servers.find((server) => String(server.id) === id);
  return match ? String(match.id) : null;
}

export function careerIdForServer(server: ServerRow | null | undefined): string | null {
  const binding = server?.sourceBinding;
  if (!binding || typeof binding !== "object") return null;
  const identity = (binding as { exportIdentity?: unknown }).exportIdentity;
  if (!identity || typeof identity !== "object") return null;
  const careerId = (identity as { careerId?: unknown }).careerId;
  return typeof careerId === "string" && careerId.trim() ? careerId.trim() : null;
}

export function resolveAvailableServerId(servers: ServerRow[], preferred: string | null): string | null {
  const selected = matchingId(servers, preferred);
  if (selected) return selected;
  // A nonempty saved ID is pending, not permission to replace it with a
  // temporarily sole source from an incomplete /api/servers response.
  if (typeof preferred === "string" && preferred.trim()) return null;
  if (servers.length !== 1) return null;
  return matchingId(servers, String(servers[0].id));
}

export function resolveInitialServerId(
  servers: ServerRow[],
  suppliedStorage?: SelectionStorage | null,
): string | null {
  let storage = suppliedStorage;
  if (storage === undefined) {
    try { storage = localStorage; } catch { storage = null; }
  }
  let current: string | null = null;
  try { current = storage?.getItem(ACTIVE_SERVER_KEY) ?? null; } catch { /* no stored selection */ }
  if (current !== null) {
    const direct = resolveAvailableServerId(servers, current);
    if (direct) return direct;
    let previousCareer: string | null = null;
    try { previousCareer = storage?.getItem(ACTIVE_CAREER_KEY) ?? null; } catch { /* no identity */ }
    if (previousCareer) {
      const matches = servers.filter((server) => careerIdForServer(server) === previousCareer);
      if (matches.length === 1) {
        const recovered = String(matches[0].id);
        try { storage?.setItem(ACTIVE_SERVER_KEY, recovered); } catch { /* still selected this session */ }
        return recovered;
      }
    }
    return null;
  }

  let classic: string | null = null;
  try { classic = storage?.getItem(CLASSIC_ACTIVE_SERVER_KEY) ?? null; } catch { /* no classic selection */ }
  const migrated = matchingId(servers, classic);
  if (migrated) {
    try { storage?.setItem(ACTIVE_SERVER_KEY, migrated); } catch { /* selection still works for this session */ }
    return migrated;
  }
  if (typeof classic === "string" && classic.trim()) return null;
  return resolveAvailableServerId(servers, null);
}
