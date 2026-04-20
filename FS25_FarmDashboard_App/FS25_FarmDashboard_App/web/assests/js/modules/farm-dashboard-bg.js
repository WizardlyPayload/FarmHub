// FS25 FarmDashboard | farm-dashboard-bg.js
// Full-screen dynamic backgrounds (section-tinted gradients). Optional PNGs were never shipped in-repo;
// to use images instead, add files under assests/img/Dashboard Pictures/ and switch bgStyle() below to url(...).

/** @type {Record<string, string>} CSS background-image values (gradients only — avoids 404s). */
export const FARM_DASHBOARD_BG_KEYS = {
  home: "linear-gradient(168deg, #0e1210 0%, #141a17 42%, #121a16 100%)",
  livestock: "linear-gradient(168deg, #0f172a 0%, #14532d 38%, #0e1210 100%)",
  vehicles: "linear-gradient(168deg, #0f172a 0%, #1e3a5f 40%, #0e1210 100%)",
  fields: "linear-gradient(168deg, #0f172a 0%, #1a3d2e 42%, #0e1210 100%)",
  economy: "linear-gradient(168deg, #0f172a 0%, #422006 40%, #0e1210 100%)",
  pastures: "linear-gradient(168deg, #0f172a 0%, #134e4a 40%, #0e1210 100%)",
  productions: "linear-gradient(168deg, #0f172a 0%, #3d2a0f 42%, #0e1210 100%)",
};

let _inited = false;
let _front = 0;
/** @type {HTMLElement[]} */
let _planes = [];

function bgStyle(key) {
  return FARM_DASHBOARD_BG_KEYS[key] || FARM_DASHBOARD_BG_KEYS.home;
}

export function initFarmDashboardBackground() {
  if (_inited) return;
  const root = document.getElementById("farm-dash-bg");
  if (!root) return;
  const a = root.querySelector(".farm-dash-bg-plane-a");
  const b = root.querySelector(".farm-dash-bg-plane-b");
  if (!a || !b) return;
  _planes = [a, b];
  a.style.backgroundImage = bgStyle("home");
  b.style.backgroundImage = bgStyle("home");
  a.classList.add("farm-dash-bg-plane--visible");
  _front = 0;
  _inited = true;
}

/**
 * @param {'home'|'livestock'|'vehicles'|'fields'|'economy'|'pastures'|'productions'} key
 */
export function setFarmDashboardBackground(key) {
  initFarmDashboardBackground();
  if (_planes.length < 2) return;
  const nextIdx = _front === 0 ? 1 : 0;
  const next = _planes[nextIdx];
  const cur = _planes[_front];
  const k = FARM_DASHBOARD_BG_KEYS[key] ? key : "home";
  next.style.backgroundImage = bgStyle(k);
  next.classList.add("farm-dash-bg-plane--visible");
  cur.classList.remove("farm-dash-bg-plane--visible");
  _front = nextIdx;
}
