// FS25 FarmDashboard | productions.js | v2.0.0
// Production chains: fill levels + active slots for the active farm.

import { t } from "../i18n/i18n.js";

function escapeHtml(s) {
  if (s == null || s === "") return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Normalize Lua/JSON chains to an array */
export function normalizeProductionChains(production) {
  if (!production) return [];
  const c = production.chains;
  if (Array.isArray(c)) return c;
  if (c && typeof c === "object") return Object.values(c);
  return [];
}

export function getOwnedChainsForFarm(production, farmId) {
  const all = normalizeProductionChains(production);
  if (all.length === 0) return [];

  let fid = Number(farmId);
  if (!Number.isFinite(fid) || fid <= 0) fid = 1;

  // Strict: only chains whose ownerFarmId matches the selected farm (no fallback to “all map” chains).
  return all.filter((ch) => Number(ch.ownerFarmId) === fid);
}

export function getOwnedProductionChainCount() {
  return getOwnedChainsForFarm(this.production, this.activeFarmId ?? 1).length;
}

/** Format storage level: FS often uses liters; some buffers use 0–1 fill ratio */
function formatFillAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n >= 0 && n <= 1.0001) return `${(n * 100).toFixed(0)}%`;
  if (Math.abs(n) >= 1000)
    return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} L`;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} L`;
}

function fillRowsFromMap(map) {
  if (!map || typeof map !== "object") return "";
  const keys = Object.keys(map).sort((a, b) => a.localeCompare(b));
  if (keys.length === 0)
    return `<tr><td colspan="2" class="text-muted small">${escapeHtml(t("productions.noFillData"))}</td></tr>`;
  return keys
    .map(
      (k) =>
        `<tr><td>${escapeHtml(k)}</td><td class="text-end font-monospace">${formatFillAmount(map[k])}</td></tr>`
    )
    .join("");
}

function recipeRows(inputs, outputs) {
  const ins = Array.isArray(inputs) ? inputs : [];
  const outs = Array.isArray(outputs) ? outputs : [];
  const lines = [];
  ins.forEach((row) => {
    const amt = row.recipeAmount != null ? row.recipeAmount : "—";
    lines.push(
      `<tr><td><span class="badge bg-secondary">${escapeHtml(t("productions.badgeIn"))}</span></td><td>${escapeHtml(row.fillType || "?")}</td><td class="text-end small text-muted">${escapeHtml(String(amt))}${escapeHtml(t("productions.perCycle"))}</td></tr>`
    );
  });
  outs.forEach((row) => {
    const amt = row.recipeAmount != null ? row.recipeAmount : "—";
    lines.push(
      `<tr><td><span class="badge bg-farm-accent text-dark">${escapeHtml(t("productions.badgeOut"))}</span></td><td>${escapeHtml(row.fillType || "?")}</td><td class="text-end small text-muted">${escapeHtml(String(amt))}${escapeHtml(t("productions.perCycle"))}</td></tr>`
    );
  });
  if (lines.length === 0)
    return `<tr><td colspan="3" class="text-muted small">${escapeHtml(t("productions.noRecipeRows"))}</td></tr>`;
  return lines.join("");
}

function buildChainCard(chain) {
  const name = escapeHtml(chain.name || t("productions.defaultChainName"));
  const cidRaw = String(chain.id ?? "");
  const farmId = Number(chain.ownerFarmId);
  const idFarmLine = escapeHtml(t("productions.idFarmLine", { id: cidRaw, farmId }));
  const chainActive = chain.isActive === true;
  const inMap = chain.inputFillLevels || {};
  const outMap = chain.outputFillLevels || {};
  const prods = Array.isArray(chain.productions) ? chain.productions : [];

  const prodBlocks = prods
    .map((p, idx) => {
      const active = p.isActive === true;
      const st = escapeHtml(String(p.status || "—"));
      const pname = escapeHtml(p.name || t("productions.slotFallback", { n: idx + 1 }));
      const cph =
        p.cyclesPerHour != null && Number(p.cyclesPerHour) > 0
          ? `<span class="small text-muted ms-2">${Number(p.cyclesPerHour).toFixed(2)} / h</span>`
          : "";
      const activeBadge = active
        ? `<span class="badge bg-success">${escapeHtml(t("productions.badgeActive"))}</span>`
        : `<span class="badge bg-secondary">${escapeHtml(t("productions.badgeInactive"))}</span>`;
      return `
        <div class="border border-secondary rounded p-2 mb-2 bg-dark">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-1">
            <strong class="text-farm-accent">${pname}</strong>
            <span>
              ${activeBadge}
              <span class="badge bg-outline-light border border-secondary text-light">${st}</span>
              ${cph}
            </span>
          </div>
          <table class="table table-sm table-dark mb-0 mt-2 small">
            <thead><tr><th style="width:8rem"></th><th>${escapeHtml(t("productions.fillType"))}</th><th class="text-end">${escapeHtml(t("productions.recipe"))}</th></tr></thead>
            <tbody>${recipeRows(p.inputs, p.outputs)}</tbody>
          </table>
        </div>`;
    })
    .join("");

  const chainState = chainActive
    ? `<span class="badge bg-success">${escapeHtml(t("productions.chainRunning"))}</span>`
    : `<span class="badge bg-secondary">${escapeHtml(t("productions.chainStopped"))}</span>`;

  return `
    <div class="card bg-secondary border-farm-accent mb-4 shadow-sm">
      <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h5 class="mb-0 text-farm-accent"><i class="bi bi-building-gear me-2"></i>${name}</h5>
          <small class="text-muted">${idFarmLine}</small>
        </div>
        <div>
          ${chainState}
        </div>
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <h6 class="text-muted mb-2"><i class="bi bi-box-arrow-in-down me-1"></i>${escapeHtml(t("productions.inputStorage"))}</h6>
            <table class="table table-sm table-dark mb-0">
              <thead><tr><th>${escapeHtml(t("productions.fillType"))}</th><th class="text-end">${escapeHtml(t("productions.level"))}</th></tr></thead>
              <tbody>${fillRowsFromMap(inMap)}</tbody>
            </table>
          </div>
          <div class="col-md-6">
            <h6 class="text-muted mb-2"><i class="bi bi-box-arrow-up me-1"></i>${escapeHtml(t("productions.outputStorage"))}</h6>
            <table class="table table-sm table-dark mb-0">
              <thead><tr><th>${escapeHtml(t("productions.fillType"))}</th><th class="text-end">${escapeHtml(t("productions.level"))}</th></tr></thead>
              <tbody>${fillRowsFromMap(outMap)}</tbody>
            </table>
          </div>
        </div>
        <h6 class="text-muted mt-4 mb-2"><i class="bi bi-diagram-3 me-1"></i>${escapeHtml(t("productions.productionSlots"))}</h6>
        ${prodBlocks || `<p class="text-muted small mb-0">${escapeHtml(t("productions.noSlotData"))}</p>`}
      </div>
    </div>`;
}

export function buildProductionsPageHTML(dashboard) {
  const farmId = dashboard.activeFarmId ?? 1;
  const chains = getOwnedChainsForFarm(dashboard.production, farmId);

  if (chains.length === 0) {
    return `
      <div class="row mb-4">
        <div class="col-12 text-center">
          <h2 class="text-farm-accent"><i class="bi bi-building-gear me-2"></i>${escapeHtml(t("productions.title"))}</h2>
          <p class="lead text-muted">${escapeHtml(t("productions.subtitleEmpty"))}</p>
          <p class="text-muted small">${escapeHtml(t("productions.hintEmpty"))}</p>
        </div>
      </div>`;
  }

  const cards = chains.map((c) => buildChainCard(c)).join("");
  const chainSummary =
    chains.length === 1
      ? t("productions.chainCountOne", { count: chains.length, farmId })
      : t("productions.chainCountMany", { count: chains.length, farmId });
  return `
    <div class="row mb-3">
      <div class="col-12 text-center">
        <h2 class="text-farm-accent"><i class="bi bi-building-gear me-2"></i>${escapeHtml(t("productions.title"))}</h2>
        <p class="text-muted mb-0">${escapeHtml(chainSummary)}</p>
      </div>
    </div>
    <div class="row">
      <div class="col-12">${cards}</div>
    </div>`;
}

function setProductionsSectionHtml(dashboard) {
  const el = document.getElementById("section-content-dynamic");
  if (el) el.innerHTML = buildProductionsPageHTML(dashboard);
}

export function showProductionsSection() {
  this.currentSection = "productions";
  setProductionsSectionHtml(this);
  document.getElementById("section-content")?.classList.remove("d-none");
  document.getElementById("landing-page")?.classList.add("d-none");
  document.getElementById("dashboard-content")?.classList.add("d-none");
  this.updateNavbar();
}

/** Call after realtime production JSON updates */
export function refreshProductionsIfVisible() {
  if (this.currentSection !== "productions") return;
  setProductionsSectionHtml(this);
}
