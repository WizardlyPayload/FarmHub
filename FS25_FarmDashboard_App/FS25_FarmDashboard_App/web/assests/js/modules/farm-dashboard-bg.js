// FS25 FarmDashboard | farm-dashboard-bg.js
// Full-screen dynamic backgrounds (category art + home overhead).

/** Encode space so CSS `url(...)` and fetch resolve reliably in Electron/browser. */
const IMG_BASE = "assests/img/Dashboard%20PIctures";

/** @type {Record<string, string>} */
export const FARM_DASHBOARD_BG_KEYS = {
  home: `${IMG_BASE}/Background.png`,
  livestock: `${IMG_BASE}/livestock.png`,
  vehicles: `${IMG_BASE}/vehicles.png`,
  fields: `${IMG_BASE}/fields.png`,
  economy: `${IMG_BASE}/economy.png`,
  pastures: `${IMG_BASE}/pastures.png`,
  productions: `${IMG_BASE}/productions.png`,
};

let _inited = false;
let _front = 0;
/** @type {HTMLElement[]} */
let _planes = [];

function bgUrl(key) {
  const path = FARM_DASHBOARD_BG_KEYS[key] || FARM_DASHBOARD_BG_KEYS.home;
  return `url("${path}")`;
}

export function initFarmDashboardBackground() {
  if (_inited) return;
  const root = document.getElementById("farm-dash-bg");
  if (!root) return;
  const a = root.querySelector(".farm-dash-bg-plane-a");
  const b = root.querySelector(".farm-dash-bg-plane-b");
  if (!a || !b) return;
  _planes = [a, b];
  a.style.backgroundImage = bgUrl("home");
  b.style.backgroundImage = bgUrl("home");
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
  next.style.backgroundImage = bgUrl(k);
  next.classList.add("farm-dash-bg-plane--visible");
  cur.classList.remove("farm-dash-bg-plane--visible");
  _front = nextIdx;
}
