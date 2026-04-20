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
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
  } catch (e) {
    return true;
  }
}

/** Block Settings modal when opened programmatically (e.g. AI upsell) on remote viewers. */
export function installFarmDashRemoteViewerGuards() {
  if (typeof document === "undefined") return;
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
