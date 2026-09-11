import type { DashboardPayload, FarmDashServer } from "@/types/dashboard";
import { hasFarmDashApi } from "@/services/electron-bridge";
import { fetchWithRetry } from "@/lib/ux-retry";

/** Electron dev API from `npm run start:dev` (see tools/app/start-dev-electron.mjs). */
const VITE_DEV_API_HOST =
  (typeof import.meta.env.VITE_FARMDASH_API === "string" &&
    import.meta.env.VITE_FARMDASH_API.trim()) ||
  "127.0.0.1:8766";

function isBrowserViteDev(): boolean {
  return import.meta.env.DEV && !hasFarmDashApi();
}

function apiBase(): string {
  return "";
}

function withServerId(url: string, serverId: string | null): string {
  if (!serverId) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}serverId=${encodeURIComponent(serverId)}`;
}

export async function fetchDashboardData(
  serverId: string | null,
  options: { retry?: boolean } = {},
): Promise<DashboardPayload> {
  const res = await fetchWithRetry(
    () => fetch(withServerId(`${apiBase()}/api/data`, serverId), { cache: "no-store" }),
    { retry: options.retry === true },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<DashboardPayload>;
}

export async function fetchServers(): Promise<FarmDashServer[]> {
  const res = await fetch(`${apiBase()}/api/servers`, { cache: "no-store" });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`HTTP ${res.status}`);
  }
  if (res.status === 503 || !res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) throw new Error("invalid_servers");
  return body as FarmDashServer[];
}

export async function fetchLanWsToken(): Promise<string | null> {
  try {
    const res = await fetch(`${apiBase()}/api/lan-ws-token`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string };
    return body.token ?? null;
  } catch {
    return null;
  }
}

export function wsUrl(token?: string | null): string {
  // Vite :5173 proxies HTTP /api but not the root WebSocket upgrade — talk to dev Electron directly.
  if (isBrowserViteDev()) {
    const base = `ws://${VITE_DEV_API_HOST}`;
    if (token) return `${base}?t=${encodeURIComponent(token)}`;
    return base;
  }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${location.host}`;
  if (token) return `${base}?t=${encodeURIComponent(token)}`;
  return base;
}
