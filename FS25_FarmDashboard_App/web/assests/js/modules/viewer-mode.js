// FS25 FarmDashboard | viewer-mode.js
// LAN / tablet clients use the host PC’s IP — hide server manager & settings; config stays on localhost.

/**
 * True when this page is opened on the machine that should manage servers (localhost / loopback, or Electron file://).
 * False for another device on the network (e.g. tablet at http://192.168.x.x:8766).
 */
export function isFarmDashLocalConfigHost() {
  if (typeof window !== "undefined" && typeof window.__farmDashRemoteViewer === "boolean") {
    return !window.__farmDashRemoteViewer;
  }
  return _hostnameImpliesLocalConfigHost();
}

function _hostnameImpliesLocalConfigHost() {
  try {
    const h = String(typeof window !== "undefined" && window.location?.hostname != null
      ? window.location.hostname
      : "").toLowerCase();
    if (!h) return true;
    if (h === "demo.farmdashboard.co.uk") return false;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
  } catch (e) {
    return true;
  }
}

function maybeInstallPublicDemoBanner() {
  try {
    const h = String(window.location?.hostname || "").toLowerCase();
    if (h !== "demo.farmdashboard.co.uk") return;
    if (document.getElementById("farmdash-public-demo-banner")) return;
    const bar = document.createElement("div");
    bar.id = "farmdash-public-demo-banner";
    bar.className = "farmdash-public-demo-banner";
    bar.setAttribute("role", "status");
    bar.innerHTML =
      '<span><strong>Live demo</strong> — read-only view of a real multiplayer farm. Data updates while we play.</span>' +
      '<a href="https://www.farmdashboard.co.uk/demo.html" target="_blank" rel="noopener">About this demo</a>' +
      '<a href="https://discord.gg/D4sEHM59" target="_blank" rel="noopener noreferrer">Discord</a>';
    document.body.prepend(bar);
  } catch (_) {
    /* ignore */
  }
}

/** Block Settings modal when opened programmatically on remote viewers. */
export function installFarmDashRemoteViewerGuards() {
  if (typeof document === "undefined") return;
  maybeInstallPublicDemoBanner();
  if (isFarmDashLocalConfigHost()) return;
  const modalEl = document.getElementById("appSettingsModal");
  if (!modalEl) return;
  modalEl.addEventListener(
    "show.bs.modal",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );
}
