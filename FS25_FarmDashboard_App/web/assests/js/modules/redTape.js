// FS25 FarmDashboard | redTape.js | v1.1.0
// FS25_RedTape — rendered inside Economy when the mod export is active.

import { t } from "../i18n/i18n.js";

function escapeHtml(s) {
  if (s == null || s === "") return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function rtLabel(nameKey, fallback) {
  if (!nameKey) return escapeHtml(fallback || "—");
  const key = String(nameKey);
  if (key.startsWith("rt_") || key.includes(".")) {
    const out = t(key);
    if (out !== key) return escapeHtml(out);
  }
  return escapeHtml(key.replace(/^rt_/, "").replace(/_/g, " "));
}

function tierBadge(tier) {
  const tierStr = String(tier || "D").toUpperCase();
  const cls =
    tierStr === "A"
      ? "bg-success"
      : tierStr === "B"
        ? "bg-info text-dark"
        : tierStr === "C"
          ? "bg-warning text-dark"
          : "bg-danger";
  return `<span class="badge ${cls} fs-6">${escapeHtml(tierStr)}</span>`;
}

export function isRedTapeModActive(redTape) {
  return !!(redTape && redTape.enabled === true);
}

export function getRedTapeForActiveFarm(redTape, farmId) {
  if (!isRedTapeModActive(redTape)) return null;
  const fid = String(Number(farmId) || 1);
  return redTape.byFarm?.[fid] || redTape.byFarm?.[Number(fid)] || null;
}

function policyTable(policies) {
  const rows = Array.isArray(policies) ? policies : [];
  if (rows.length === 0) {
    return `<p class="text-muted small mb-0">${escapeHtml(t("redtape.noPolicies"))}</p>`;
  }
  return `<table class="table table-sm table-dark mb-0 small">
    <thead><tr>
      <th>${t("redtape.colPolicy")}</th>
      <th>${t("redtape.colWarnings")}</th>
      <th>${t("redtape.colWatched")}</th>
      <th>${t("redtape.colNextEval")}</th>
    </tr></thead>
    <tbody>${rows
      .map((p) => {
        const watched = p.watched
          ? `<span class="badge bg-warning text-dark">${t("redtape.watched")}</span>`
          : "—";
        const next = p.nextEvaluationMonth != null ? String(p.nextEvaluationMonth) : "—";
        return `<tr>
          <td>${rtLabel(p.nameKey, `Policy ${p.policyIndex ?? ""}`)}</td>
          <td>${Number(p.warnings) || 0}</td>
          <td>${watched}</td>
          <td>${escapeHtml(next)}</td>
        </tr>`;
      })
      .join("")}</tbody></table>`;
}

function schemeList(schemes, emptyKey) {
  const rows = Array.isArray(schemes) ? schemes : [];
  if (rows.length === 0) {
    return `<div class="p-3"><p class="text-muted small mb-0">${escapeHtml(t(emptyKey))}</p></div>`;
  }
  return `<ul class="list-group list-group-flush">${rows
    .map((s) => {
      const name = rtLabel(s.nameKey, `Scheme ${s.schemeIndex ?? ""}`);
      const tier = s.tier ? `<span class="badge bg-secondary ms-2">${escapeHtml(s.tier)}</span>` : "";
      return `<li class="list-group-item bg-dark text-light border-secondary d-flex justify-content-between align-items-center">
        <span>${name}${tier}</span>
        ${s.watched ? `<span class="badge bg-info text-dark">${t("redtape.watched")}</span>` : ""}
      </li>`;
    })
    .join("")}</ul>`;
}

function taxBlock(tax) {
  if (!tax) return "";
  const income = formatMoney(tax.currentMonthIncome);
  const expenses = formatMoney(tax.currentMonthExpenses);
  const stmts = Array.isArray(tax.statements) ? tax.statements : [];
  const stmtRows =
    stmts.length === 0
      ? `<tr><td colspan="4" class="text-muted small">${escapeHtml(t("redtape.noTaxStatements"))}</td></tr>`
      : stmts
          .map(
            (s) => `<tr>
            <td>${s.month ?? "—"}</td>
            <td class="text-end font-monospace">${formatMoney(s.totalTaxableIncome)}</td>
            <td class="text-end font-monospace">${formatMoney(s.totalTax)}</td>
            <td>${s.paid ? `<span class="badge bg-success">${t("redtape.paid")}</span>` : `<span class="badge bg-warning text-dark">${t("redtape.unpaid")}</span>`}</td>
          </tr>`
          )
          .join("");
  return `
    <div class="card bg-dark border-secondary mb-3">
      <div class="card-header"><strong>${t("redtape.taxTitle")}</strong></div>
      <div class="card-body">
        <p class="small text-muted mb-2">${t("redtape.taxCurrentMonth", { income, expenses })}</p>
        <table class="table table-sm table-dark mb-0 small">
          <thead><tr>
            <th>${t("redtape.colMonth")}</th>
            <th class="text-end">${t("redtape.colTaxable")}</th>
            <th class="text-end">${t("redtape.colTax")}</th>
            <th>${t("redtape.colStatus")}</th>
          </tr></thead>
          <tbody>${stmtRows}</tbody>
        </table>
      </div>
    </div>`;
}

function eventsBlock(events) {
  const rows = Array.isArray(events) ? events : [];
  if (rows.length === 0) return "";
  return `
    <div class="card bg-dark border-secondary mb-3">
      <div class="card-header"><strong>${t("redtape.eventsTitle")}</strong></div>
      <div class="card-body p-0">
        <ul class="list-group list-group-flush">${rows
          .map((ev) => {
            const label = rtLabel(ev.typeKey, ev.detail || t("redtape.eventFallback"));
            const when = [ev.month, ev.year].filter((x) => x != null).join("/") || "—";
            return `<li class="list-group-item bg-dark text-light border-secondary small">
              <span class="text-muted">${escapeHtml(when)}</span> — ${label}
            </li>`;
          })
          .join("")}</ul>
      </div>
    </div>`;
}

/** Red Tape tab body (Economy section). */
export function buildRedTapeTabHTML(dashboard) {
  const farmId = dashboard.activeFarmId ?? 1;
  const farm = getRedTapeForActiveFarm(dashboard.redTape, farmId);

  if (!farm) {
    return `<div class="alert alert-secondary">${escapeHtml(t("redtape.subtitleEmpty"))}</div>`;
  }

  const grants = Array.isArray(farm.grants) ? farm.grants : [];
  const grantHtml =
    grants.length === 0
      ? ""
      : `<div class="card bg-dark border-secondary mb-3">
        <div class="card-header"><strong>${t("redtape.grantsTitle")}</strong></div>
        <ul class="list-group list-group-flush">${grants
          .map(
            (g) => `<li class="list-group-item bg-dark text-light border-secondary small d-flex justify-content-between">
              <span>${escapeHtml(g.grantId || g.xmlFilename || "—")}</span>
              <span>${escapeHtml(g.status || "—")} · ${formatMoney(g.approvedAmount ?? g.requestedAmount)}</span>
            </li>`
          )
          .join("")}</ul>
      </div>`;

  return `
    <p class="text-muted small mb-3">${escapeHtml(
      t("redtape.subtitleFarm", { farmId, tier: farm.tier || "D" })
    )}</p>
    <div class="row mb-4">
      <div class="col-md-4 text-center">
        <p class="text-muted small mb-1">${t("redtape.tierLabel")}</p>
        ${tierBadge(farm.tier)}
      </div>
      <div class="col-md-4 text-center">
        <p class="text-muted small mb-1">${t("redtape.pointsLabel")}</p>
        <h3 class="text-farm-accent mb-0">${Number(farm.points) || 0}</h3>
      </div>
      <div class="col-md-4 text-center">
        <p class="text-muted small mb-1">${t("redtape.policiesLabel")}</p>
        <h3 class="text-farm-accent mb-0">${(farm.policies || []).length}</h3>
      </div>
    </div>
    <div class="card bg-dark border-secondary mb-3">
      <div class="card-header"><strong>${t("redtape.policiesTitle")}</strong></div>
      <div class="card-body">${policyTable(farm.policies)}</div>
    </div>
    <div class="row">
      <div class="col-md-6 mb-3">
        <div class="card bg-dark border-secondary h-100">
          <div class="card-header"><strong>${t("redtape.activeSchemesTitle")}</strong></div>
          <div class="card-body p-0">${schemeList(farm.activeSchemes, "redtape.noActiveSchemes")}</div>
        </div>
      </div>
      <div class="col-md-6 mb-3">
        <div class="card bg-dark border-secondary h-100">
          <div class="card-header"><strong>${t("redtape.availableSchemesTitle")}</strong></div>
          <div class="card-body p-0">${schemeList(farm.availableSchemes, "redtape.noAvailableSchemes")}</div>
        </div>
      </div>
    </div>
    ${taxBlock(farm.tax)}
    ${grantHtml}
    ${eventsBlock(farm.events)}`;
}

export function renderRedTapePanel(dashboard) {
  const el = document.getElementById("economy-redtape-panel");
  if (!el) return;
  el.innerHTML = buildRedTapeTabHTML(dashboard);
}
