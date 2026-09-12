/** Local config host vs remote LAN / demo viewer. */

export function isFarmDashLocalConfigHost(): boolean {
  if (typeof window !== "undefined" && typeof window.__farmDashRemoteViewer === "boolean") {
    return !window.__farmDashRemoteViewer;
  }
  return hostnameImpliesLocalConfigHost();
}

function hostnameImpliesLocalConfigHost(): boolean {
  try {
    const h = String(window.location?.hostname ?? "").toLowerCase();
    if (!h) return true;
    if (h === "demo.farmdashboard.co.uk") return false;
    if (window.location.protocol === "file:") return true;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
  } catch {
    return true;
  }
}

export function isPublicDemoHost(): boolean {
  try {
    return String(window.location?.hostname ?? "").toLowerCase() === "demo.farmdashboard.co.uk";
  } catch {
    return false;
  }
}
