import type { SetupStatus } from "@/lib/ux-state";
import { getFarmDashApi } from "@/services/electron-bridge";
import { fetchWithRetry } from "@/lib/ux-retry";
import { demoWritesAreLocked } from "@/platform/demo-source";

function statusUrl(path: string, serverId?: string | null): string {
  const selected = typeof serverId === "string" ? serverId.trim() : "";
  return selected ? `${path}?serverId=${encodeURIComponent(selected)}` : path;
}

export async function fetchSetupStatus(serverId?: string | null): Promise<SetupStatus | null> {
  if (demoWritesAreLocked()) return null;
  const api = getFarmDashApi();
  if (!serverId && api?.getSetupStatus) {
    try {
      return (await api.getSetupStatus()) as SetupStatus;
    } catch {
      /* fall through to HTTP */
    }
  }
  try {
    const res = await fetchWithRetry(() => fetch(statusUrl("/api/setup-status", serverId), { cache: "no-store" }), {
      retry: false,
    });
    if (!res.ok) return null;
    return (await res.json()) as SetupStatus;
  } catch {
    return null;
  }
}

export async function fetchUxEvents(): Promise<SetupStatus["recentEvents"]> {
  const status = await fetchSetupStatus();
  return status?.recentEvents || [];
}

export async function runSetupHandshake(serverId?: string | null): Promise<SetupStatus | null> {
  if (demoWritesAreLocked()) return null;
  const api = getFarmDashApi();
  if (!serverId && api?.runSetupHandshake) {
    try {
      return (await api.runSetupHandshake()) as SetupStatus;
    } catch {
      /* HTTP */
    }
  }
  try {
    const res = await fetch(statusUrl("/api/setup-handshake", serverId), { method: "POST", cache: "no-store" });
    if (!res.ok) return fetchSetupStatus(serverId);
    return (await res.json()) as SetupStatus;
  } catch {
    return fetchSetupStatus(serverId);
  }
}
