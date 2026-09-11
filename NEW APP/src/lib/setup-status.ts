import type { SetupStatus } from "@/lib/ux-state";
import { getFarmDashApi } from "@/services/electron-bridge";
import { fetchWithRetry } from "@/lib/ux-retry";

export async function fetchSetupStatus(): Promise<SetupStatus | null> {
  const api = getFarmDashApi();
  if (api?.getSetupStatus) {
    try {
      return (await api.getSetupStatus()) as SetupStatus;
    } catch {
      /* fall through to HTTP */
    }
  }
  try {
    const res = await fetchWithRetry(() => fetch("/api/setup-status", { cache: "no-store" }), {
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

export async function runSetupHandshake(): Promise<SetupStatus | null> {
  const api = getFarmDashApi();
  if (api?.runSetupHandshake) {
    try {
      return (await api.runSetupHandshake()) as SetupStatus;
    } catch {
      /* HTTP */
    }
  }
  try {
    const res = await fetch("/api/setup-handshake", { method: "POST", cache: "no-store" });
    if (!res.ok) return fetchSetupStatus();
    return (await res.json()) as SetupStatus;
  } catch {
    return fetchSetupStatus();
  }
}
