// FS25 FarmDashboard | lan-http-auth.js
// Patches global fetch to send HTTP Basic for same-origin /api/* on LAN/tablet hosts.
// Credentials: sessionStorage + localStorage (Safari on iPhone often breaks tab-only storage; localStorage keeps sign-in stable).

const STORAGE_KEY = "farmdash_lan_http_basic_v1";

function getLanHttpBasicStoredToken() {
  try {
    return (
      sessionStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem(STORAGE_KEY) ||
      ""
    );
  } catch (_) {
    try {
      return sessionStorage.getItem(STORAGE_KEY) || "";
    } catch (_) {
      return "";
    }
  }
}

function setLanHttpBasicStoredToken(token) {
  if (!token) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch (_) {
    /* ignore */
  }
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch (_) {
    /* ignore — private mode may block localStorage */
  }
}

function clearLanHttpBasicStoredToken() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    /* ignore */
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    /* ignore */
  }
}

/** Pending `farmdashWaitForLanHttpBasicIfNeeded()` resolvers (real tablets waiting on the overlay). */
const _lanGateWaiters = [];

function encodeBasicCredentials(user, pass) {
  const str = `${String(user)}:${String(pass)}`;
  try {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 1) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin);
  } catch (_) {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (_) {
      return "";
    }
  }
}

function resolveLanGateWaiters() {
  while (_lanGateWaiters.length > 0) {
    const r = _lanGateWaiters.shift();
    try {
      r();
    } catch (_) {
      /* ignore */
    }
  }
}

function setLanAuthPendingUi(pending) {
  try {
    if (!document.body || !window.__farmDashRemoteViewer) return;
    document.body.classList.toggle("farmdash-lan-auth-pending", !!pending);
  } catch (_) {
    /* ignore */
  }
}

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
  const tok = encodeBasicCredentials(user, pass);
  if (tok) setLanHttpBasicStoredToken(tok);
}

export function farmdashClearLanHttpBasic() {
  clearLanHttpBasicStoredToken();
}

export function farmdashHasLanHttpBasic() {
  return !!getLanHttpBasicStoredToken();
}

/**
 * Resolved before any bootstrap `fetch`/dashboard init on remote viewers once credentials exist
 * or when not a remote hostname.
 */
export function farmdashWaitForLanHttpBasicIfNeeded() {
  if (typeof window === "undefined") return Promise.resolve();
  if (!window.__farmDashRemoteViewer) return Promise.resolve();
  if (farmdashHasLanHttpBasic()) return Promise.resolve();
  return new Promise((resolve) => {
    _lanGateWaiters.push(resolve);
  });
}

function sameOriginHttpBase() {
  if (
    typeof window !== "undefined" &&
    window.location &&
    /^https?:$/i.test(window.location.protocol || "")
  ) {
    return window.location.origin;
  }
  return "";
}

async function probeServersWithoutExtraAuth() {
  try {
    const base = sameOriginHttpBase();
    const r = await fetch(`${base}/api/servers`, { cache: "no-store", method: "GET" });
    return r.ok;
  } catch (_) {
    return false;
  }
}

async function verifyLanCredentialsWithFetch() {
  const base = sameOriginHttpBase();
  const r = await fetch(`${base}/api/servers`, { cache: "no-store", method: "GET" });
  return r.ok;
}

/**
 * Registers early (same module phase as patch). Listener order must run before app.js DOMContentLoaded.
 */
export function farmdashBootstrapLanViewerAuth() {
  if (typeof document === "undefined") return;

  function openOverlay(show) {
    const ov = document.getElementById("farmdash-lan-auth-overlay");
    if (!ov) return;
    if (show) {
      ov.classList.remove("d-none");
      ov.setAttribute("aria-hidden", "false");
      setLanAuthPendingUi(true);
    } else {
      ov.classList.add("d-none");
      ov.setAttribute("aria-hidden", "true");
      setLanAuthPendingUi(false);
    }
  }

  function attachHandlersOnce() {
    const btn = document.getElementById("farmdash-lan-auth-submit");
    const userEl = document.getElementById("farmdash-lan-auth-user");
    const passEl = document.getElementById("farmdash-lan-auth-pass");
    const errEl = document.getElementById("farmdash-lan-auth-error");

    async function submit() {
      const uEl = document.getElementById("farmdash-lan-auth-user");
      const pEl = document.getElementById("farmdash-lan-auth-pass");
      const b = document.getElementById("farmdash-lan-auth-submit");
      if (!uEl || !pEl || !b) return;
      const u = String(uEl.value || "").trim();
      const p = String(pEl.value || "");
      if (!u || !p) return;
      if (errEl) {
        errEl.classList.add("d-none");
        errEl.textContent = "";
      }
      b.disabled = true;
      try {
        farmdashSetLanHttpBasic(u, p);
        const ok = await verifyLanCredentialsWithFetch();
        if (!ok) {
          farmdashClearLanHttpBasic();
          if (errEl) {
            errEl.textContent =
              "That username/password was rejected by the host. Check LAN login in Farm Dashboard Settings on the PC.";
            errEl.classList.remove("d-none");
          }
          return;
        }
        openOverlay(false);
        resolveLanGateWaiters();
      } catch (_) {
        farmdashClearLanHttpBasic();
        if (errEl) {
          errEl.textContent =
            "Could not reach the dashboard API from this browser. Check Wi‑Fi and that the PC app is running.";
          errEl.classList.remove("d-none");
        }
      } finally {
        b.disabled = false;
      }
    }

    if (btn && !btn.dataset.farmdashLanAuthBound) {
      btn.dataset.farmdashLanAuthBound = "1";
      btn.addEventListener("click", submit);
    }
    if (passEl && !passEl.dataset.farmdashLanAuthBound) {
      passEl.dataset.farmdashLanAuthBound = "1";
      passEl.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") submit();
      });
    }
    if (userEl && !userEl.dataset.farmdashLanAuthBound) {
      userEl.dataset.farmdashLanAuthBound = "1";
      userEl.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          passEl?.focus();
        }
      });
    }
  }

  async function onReady() {
    try {
      if (!window.__farmDashRemoteViewer) {
        resolveLanGateWaiters();
        return;
      }
      attachHandlersOnce();
      if (farmdashHasLanHttpBasic()) {
        openOverlay(false);
        resolveLanGateWaiters();
        return;
      }
      // Host trusts this TCP client without Basic (e.g. this PC opened via its own LAN IP — see main.js).
      if (await probeServersWithoutExtraAuth()) {
        openOverlay(false);
        resolveLanGateWaiters();
        return;
      }
      openOverlay(true);
      try {
        document.getElementById("farmdash-lan-auth-pass")?.focus();
      } catch (_) {}
    } catch (e) {
      console.warn("[farmdash-lan-auth]", e);
    }
  }

  function onReadySafe() {
    void onReady();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReadySafe);
  } else {
    setTimeout(onReadySafe, 0);
  }
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
      const tok = getLanHttpBasicStoredToken();
      if (tok) headers.set("Authorization", `Basic ${tok}`);
    }
    nextInit.headers = headers;
    return orig(input, nextInit);
  };
  window.farmdashSetLanHttpBasic = farmdashSetLanHttpBasic;
  window.farmdashClearLanHttpBasic = farmdashClearLanHttpBasic;
}
