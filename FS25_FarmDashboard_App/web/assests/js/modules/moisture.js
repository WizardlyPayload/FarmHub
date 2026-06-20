// FS25 FarmDashboard | moisture.js | v1.0.0
// MoistureSystem helpers — grades, rot labels, environment gauge copy.

import { t } from "../i18n/i18n.js";

export function formatMoisturePercent(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

export function moistureGradeLabel(grade) {
  if (grade == null || grade === "") return "—";
  const g = String(grade).toLowerCase();
  const letterToKey = { a: "premium", b: "good", c: "average", d: "poor" };
  const slug = letterToKey[g] || g;
  const key = `moisture.grade.${slug}`;
  const out = t(key);
  return out === key ? String(grade) : out;
}

export function moistureRotLabel(rot) {
  if (!rot) return "";
  const norm = String(rot).toLowerCase().replace(/_/g, "");
  const alias =
    norm === "rottingslowly" || norm === "rottingquickly" ? "rotting" : norm;
  const key = `moisture.rot.${alias}`;
  const out = t(key);
  return out === key ? String(rot) : out;
}

export function moistureRotBadgeClass(rot) {
  const r = String(rot || "").toLowerCase().replace(/_/g, "");
  if (r === "rotting" || r === "rottingslowly" || r === "rottingquickly") return "bg-danger";
  if (r === "gettingwet") return "bg-warning text-dark";
  return "bg-secondary";
}

export function buildMoistureEnvironmentHtml(weather) {
  const m = weather?.moisture;
  if (!m?.enabled) return "";
  const pct = formatMoisturePercent(m.currentPercent);
  const env = m.environment ? String(m.environment) : "";
  const drying =
    Number(m.dryingActiveCount) > 0
      ? t("moisture.dryingActive", { count: m.dryingActiveCount })
      : "";
  const rotOff = m.baleRotEnabled === false ? t("moisture.baleRotDisabled") : "";
  const bits = [
    `<span class="badge bg-info text-dark">${t("moisture.envMoisture", { pct })}</span>`,
  ];
  if (env) bits.push(`<span class="badge bg-secondary">${env}</span>`);
  if (drying) bits.push(`<span class="badge bg-success">${drying}</span>`);
  if (rotOff) bits.push(`<span class="badge bg-outline-light border border-secondary">${rotOff}</span>`);
  return `<div class="d-flex flex-wrap gap-2 mb-3">${bits.join("")}</div>`;
}

export function buildBaleMoistureSummaryHtml(baleInventory, farmId) {
  const inv = baleInventory && typeof baleInventory === "object" ? baleInventory : {};
  const fid = String(Number(farmId) || 1);
  const farmRow =
    inv.moisture?.byFarm?.[fid] ||
    inv.moisture?.byFarm?.[Number(fid)] ||
    null;
  if (!farmRow || farmRow.enabled === false) return "";

  const grades = farmRow.gradeCounts || {};
  const gradeBits = Object.keys(grades)
    .sort()
    .map(
      (g) =>
        `<span class="badge bg-secondary me-1">${moistureGradeLabel(g)}: ${grades[g]}</span>`
    )
    .join("");

  const rotN = Number(farmRow.rottingCount) || 0;
  const wetN = Number(farmRow.gettingWetCount) || 0;
  const warn =
    rotN > 0 || wetN > 0
      ? `<p class="small text-warning mb-2">${t("moisture.baleRotSummary", {
          rotting: rotN,
          wet: wetN,
        })}</p>`
      : "";

  const worst = Array.isArray(farmRow.worst) ? farmRow.worst : [];
  const worstRows =
    worst.length === 0
      ? ""
      : `<table class="table table-sm table-dark mb-0 mt-2 small">
        <thead><tr>
          <th>${t("moisture.colFill")}</th>
          <th>${t("moisture.colMoisture")}</th>
          <th>${t("moisture.colGrade")}</th>
          <th>${t("moisture.colRot")}</th>
        </tr></thead>
        <tbody>${worst
          .map((row) => {
            const rot = row.rotStatus ? moistureRotLabel(row.rotStatus) : "—";
            const rotCls = row.rotStatus ? moistureRotBadgeClass(row.rotStatus) : "bg-secondary";
            return `<tr>
              <td>${row.fillType || "—"}</td>
              <td class="font-monospace">${formatMoisturePercent(row.moisturePct)}</td>
              <td>${moistureGradeLabel(row.grade)}</td>
              <td><span class="badge ${rotCls}">${rot}</span></td>
            </tr>`;
          })
          .join("")}</tbody></table>`;

  return `
    <div class="card bg-dark border-secondary mb-4">
      <div class="card-body">
        <h6 class="text-farm-accent mb-2"><i class="bi bi-droplet-half me-2"></i>${t(
          "moisture.baleSummaryTitle"
        )}</h6>
        ${gradeBits ? `<div class="mb-2">${gradeBits}</div>` : ""}
        ${warn}
        ${worstRows}
      </div>
    </div>`;
}
