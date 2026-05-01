// FS25 FarmDashboard | lan-http-auth.js
// Patches global fetch to send HTTP Basic for same-origin /api/* when opened from a LAN host (tablet viewer).
// Credentials are stored in sessionStorage for the tab only — set via the overlay in index.html or
// `window.farmdashSetLanHttpBasic(user, pass)`.

const STORAGE_KEY = "farmdash_lan_http_basic_v1";

function hostnameImpliesLocalDashboard() {
  try {
    const h = String(
      typeof window !== "undefined" && window.location?.hostname != null
        ? window.location.hostname
        : ""
    ).toLowerCase();
    return !h || h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
  } catch (_) {
    return true;
  }
}

function shouldAttachLanBasicToUrl(urlStr) {
  if (typeof window === "undefined") return false;
  if (hostnameImpliesLocalDashboard()) return false;
  try {
    const u =
      typeof urlStr === "string" ? new URL(urlStr, window.location.origin) : new URL(String(urlStr));
    if (u.origin !== window.location.origin) return false;
    return u.pathname.startsWith("/api/");
  } catch (_) {
    return false;
  }
}

/**
 * @param {string} user
 * @param {string} pass
 */
export function farmdashSetLanHttpBasic(user, pass) {
  const token = btoa(`${String(user)}:${String(pass)}`);
  sessionStorage.setItem(STORAGE_KEY, token);
}

export function farmdashClearLanHttpBasic() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function farmdashHasLanHttpBasic() {
  return !!sessionStorage.getItem(STORAGE_KEY);
}

export function installLanHttpBasicFetchPatch() {
  if (typeof window === "undefined" || window.__farmdashLanFetchPatched) return;
  window.__farmdashLanFetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = function patchedFetch(input, init) {
    const nextInit = init ? { ...init } : {};
    const headers = new Headers(nextInit.headers || {});
    const url = typeof input === "string" ? input : input.url;
    if (shouldAttachLanBasicToUrl(url) && !headers.has("Authorization")) {
      const tok = sessionStorage.getItem(STORAGE_KEY);
      if (tok) headers.set("Authorization", `Basic ${tok}`);
    }
    nextInit.headers = headers;
    return orig(input, nextInit);
  };
  window.farmdashSetLanHttpBasic = farmdashSetLanHttpBasic;
  window.farmdashClearLanHttpBasic = farmdashClearLanHttpBasic;
}
