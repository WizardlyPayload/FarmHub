/** LAN HTTP Basic auth for remote / tablet viewers. */

const STORAGE_KEY = "farmdash_lan_http_basic_v1";

export const LAN_AUTH_GATE_TIMEOUT_MS = 30_000;

const lanGateWaiters: Array<() => void> = [];

function getLanHttpBasicStoredToken(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    try {
      return sessionStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }
}

function setLanHttpBasicStoredToken(token: string): void {
  if (!token) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* ignore */
  }
}

function clearLanHttpBasicStoredToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function encodeBasicCredentials(user: string, pass: string): string {
  const str = `${String(user)}:${String(pass)}`;
  try {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 1) {
      bin += String.fromCharCode(bytes[i]!);
    }
    return btoa(bin);
  } catch {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch {
      return "";
    }
  }
}

function resolveLanGateWaiters(): void {
  while (lanGateWaiters.length > 0) {
    const r = lanGateWaiters.shift();
    try {
      r?.();
    } catch {
      /* ignore */
    }
  }
}

function hostnameImpliesLocalDashboard(): boolean {
  try {
    const h = String(window.location?.hostname ?? "").toLowerCase();
    return !h || h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
  } catch {
    return true;
  }
}

function shouldAttachLanBasicToUrl(urlStr: string): boolean {
  if (hostnameImpliesLocalDashboard()) return false;
  try {
    const u = new URL(urlStr, window.location.origin);
    if (u.origin !== window.location.origin) return false;
    return u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

export function farmdashSetLanHttpBasic(user: string, pass: string): void {
  const tok = encodeBasicCredentials(user, pass);
  if (tok) setLanHttpBasicStoredToken(tok);
}

export function farmdashClearLanHttpBasic(): void {
  clearLanHttpBasicStoredToken();
}

export function farmdashHasLanHttpBasic(): boolean {
  return !!getLanHttpBasicStoredToken();
}

export function farmdashWaitForLanHttpBasicIfNeeded(options: { timeoutMs?: number } = {}): Promise<void> {
  if (typeof globalThis === "undefined" || typeof globalThis.window === "undefined") return Promise.resolve();
  if (!globalThis.window.__farmDashRemoteViewer) return Promise.resolve();
  const waitMs = Number.isFinite(Number(options.timeoutMs))
    ? Number(options.timeoutMs)
    : LAN_AUTH_GATE_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = globalThis.window.setTimeout(() => {
      try {
        globalThis.document?.body?.classList.add("farmdash-lan-auth-timeout");
        globalThis.sessionStorage?.setItem("farmdash_last_error_code", "E_LAN_TIMEOUT");
      } catch {
        /* ignore */
      }
      done();
    }, waitMs);
    lanGateWaiters.push(() => {
      globalThis.window.clearTimeout(timer);
      done();
    });
  });
}

export function resolveLanAuthGate(): void {
  resolveLanGateWaiters();
}

export async function probeRemoteDashboardBootstrap(
  fetchImpl: typeof fetch = fetch,
  baseOrigin = "",
): Promise<boolean> {
  try {
    const base = String(baseOrigin || "").trim();
    if (!base) return false;
    const status = await fetchImpl(`${base}/api/status`, { cache: "no-store", method: "GET" });
    if (!status.ok) return false;
    const servers = await fetchImpl(`${base}/api/servers`, { cache: "no-store", method: "GET" });
    return servers.ok;
  } catch {
    return false;
  }
}

export type LanVerifyKind = "ok" | "auth" | "network";

export function interpretLanVerifyResult(status: number, networkError = false): LanVerifyKind {
  if (networkError) return "network";
  const n = Number(status);
  if (n === 401 || n === 403) return "auth";
  if (n >= 200 && n < 300) return "ok";
  return "network";
}

export async function verifyLanCredentials(): Promise<{ ok: boolean; status: number; kind: LanVerifyKind }> {
  try {
    const r = await fetch(`${window.location.origin}/api/servers`, {
      cache: "no-store",
      method: "GET",
    });
    const status = Number(r.status) || 0;
    const kind = interpretLanVerifyResult(status, false);
    return { ok: kind === "ok", status, kind };
  } catch {
    return { ok: false, status: 0, kind: "network" };
  }
}

export function installLanHttpBasicFetchPatch(): void {
  if (typeof window === "undefined" || window.__farmdashLanFetchPatched) return;
  window.__farmdashLanFetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const nextInit: RequestInit = init ? { ...init } : {};
    const headers = new Headers(nextInit.headers || {});
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (shouldAttachLanBasicToUrl(url) && !headers.has("Authorization")) {
      const tok = getLanHttpBasicStoredToken();
      if (tok) headers.set("Authorization", `Basic ${tok}`);
    }
    nextInit.headers = headers;
    return orig(input, nextInit);
  };
}

/** Mark remote viewer when hostname is not loopback / Electron local. */
export function detectAndMarkRemoteViewer(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.__farmDashRemoteViewer === "boolean") {
    return window.__farmDashRemoteViewer;
  }
  const h = String(window.location?.hostname ?? "").toLowerCase();
  const local =
    !h ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]" ||
    window.location.protocol === "file:";
  window.__farmDashRemoteViewer = !local || h === "demo.farmdashboard.co.uk";
  return !!window.__farmDashRemoteViewer;
}
