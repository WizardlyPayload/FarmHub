// FS25 FarmDashboard | vehicleAds.js — Advanced Damage System helpers for merged vehicle rows

import { t } from "../i18n/i18n.js";

function _safe(value) {
  const ns =
    (typeof globalThis !== "undefined" && globalThis.farmDashEscape) ||
    (typeof window !== "undefined" && window.farmDashEscape) ||
    null;
  if (ns && typeof ns.escapeHtml === "function") return ns.escapeHtml(value);
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function vehicleHasAds(vehicle) {
  return Boolean(vehicle?.ads?.enabled);
}

/** 0–1 condition (1 = excellent). ADS condition or inverse of vanilla damage. */
export function getVehicleConditionFraction(vehicle) {
  if (vehicleHasAds(vehicle) && Number.isFinite(Number(vehicle.ads.condition))) {
    return Math.min(1, Math.max(0, Number(vehicle.ads.condition)));
  }
  const damage = Number(vehicle?.damage);
  if (!Number.isFinite(damage)) return 1;
  return Math.min(1, Math.max(0, 1 - damage));
}

/** 0–1 wear/damage for filters (inverse of condition). */
export function getVehicleDamageFraction(vehicle) {
  return 1 - getVehicleConditionFraction(vehicle);
}

export function isVehicleHighWear(vehicle) {
  return getVehicleDamageFraction(vehicle) > 0.2;
}

export function getAdsIntervalRatio(vehicle) {
  const ratio = Number(vehicle?.ads?.intervalRatio);
  return Number.isFinite(ratio) ? ratio : null;
}

export function isVehicleAdsOverdue(vehicle) {
  const ratio = getAdsIntervalRatio(vehicle);
  return ratio != null && ratio > 1;
}

export function countActiveAdsBreakdowns(vehicle) {
  const parts = getAdsBreakdownParts(vehicle);
  if (parts.length > 0) return parts.length;
  const n = Number(vehicle?.ads?.breakdownCount);
  return Number.isFinite(n) ? n : 0;
}

export function getAdsBreakdownParts(vehicle) {
  const list = vehicle?.ads?.breakdownParts;
  if (Array.isArray(list) && list.length > 0) {
    return list.filter((p) => p.isVisible !== false);
  }
  const ids = vehicle?.ads?.breakdowns;
  if (Array.isArray(ids) && ids.length > 0) {
    return ids.map((id) => ({
      id: String(id),
      partKey: null,
      stage: 0,
      isActive: true,
      isVisible: true,
      repairPrice: null,
    }));
  }
  return [];
}

export function hasVisibleAdsBreakdowns(vehicle) {
  return getAdsBreakdownParts(vehicle).length > 0;
}

export function isVehicleInAdsService(vehicle) {
  return Boolean(vehicle?.ads?.inService);
}

export function formatAdsStateLabel(state) {
  if (!state || typeof state !== "string") return "";
  const localized = t(state);
  if (localized && localized !== state) return localized;
  return state.replace(/^ads_spec_state_/, "").replace(/_/g, " ");
}

/** ADS system key ("engine") → localized name via the mod's own l10n keys. */
export function formatAdsSystemLabel(systemKey) {
  if (!systemKey || typeof systemKey !== "string") return "";
  const adsKey = systemKey.startsWith("ads_spec_system_")
    ? systemKey
    : `ads_spec_system_${systemKey}`;
  const localized = t(adsKey);
  if (localized && localized !== adsKey) return localized;
  return systemKey.replace(/^ads_spec_system_/, "").replace(/_/g, " ");
}

export function getWorstAdsSystems(vehicle, limit = 3) {
  const systems = vehicle?.ads?.systems;
  if (!systems || typeof systems !== "object") return [];
  return Object.entries(systems)
    .map(([key, row]) => ({
      key,
      condition: Number(row?.condition),
      stress: Number(row?.stress),
    }))
    .filter((row) => Number.isFinite(row.condition))
    .sort((a, b) => a.condition - b.condition)
    .slice(0, limit);
}

export function summarizeAdsFleet(vehicles) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const summary = {
    enabled: false,
    vehicleCount: 0,
    inServiceCount: 0,
    breakdownVehicleCount: 0,
    overdueMaintenanceCount: 0,
    needsRepairCount: 0,
  };
  for (const v of list) {
    if (!vehicleHasAds(v)) continue;
    summary.enabled = true;
    summary.vehicleCount += 1;
    if (isVehicleInAdsService(v)) summary.inServiceCount += 1;
    if (hasVisibleAdsBreakdowns(v) || countActiveAdsBreakdowns(v) > 0) {
      summary.breakdownVehicleCount += 1;
    }
    if (isVehicleAdsOverdue(v)) summary.overdueMaintenanceCount += 1;
    if (vehicleNeedsAdsWarning(v)) summary.needsRepairCount += 1;
  }
  return summary;
}

export function formatIntervalRatioPercent(ratio) {
  if (!Number.isFinite(ratio)) return "—";
  return `${Math.round(ratio * 100)}%`;
}

/** Qualitative ADS service label from 0–1 service level (mirrors ADS_Utils.formatService). */
export function formatAdsServiceLabel(service) {
  const s = Number(service);
  if (!Number.isFinite(s)) return "—";
  const consumed = 1 - s;
  if (consumed > 0.55) return t("vehicles.adsStateOverdue");
  if (consumed > 0.45) return t("vehicles.adsStateRequired");
  if (consumed > 0.35) return t("vehicles.adsStateRecommended");
  if (consumed > 0.1) return t("vehicles.adsStateGood");
  return t("vehicles.adsStateOptimal");
}

/** Qualitative ADS condition label from 0–1 condition (mirrors ADS_Utils.formatCondition). */
export function formatAdsConditionLabel(condition) {
  const c = Number(condition);
  if (!Number.isFinite(c)) return "—";
  const damage = 1 - c;
  if (damage > 0.8) return t("vehicles.adsStateTerrible");
  if (damage > 0.6) return t("vehicles.adsStateBad");
  if (damage > 0.4) return t("vehicles.adsStateNormal");
  if (damage > 0.2) return t("vehicles.adsStateGood");
  return t("vehicles.adsStateExcellent");
}

export function formatAdsMaintainabilityLabel(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "—";
  if (v < 1.0) return t("vehicles.adsMaintLow");
  if (v < 1.1) return t("vehicles.adsMaintAverage");
  if (v < 1.2) return t("vehicles.adsMaintHigh");
  return t("vehicles.adsMaintWorkhorse");
}

const ADS_INSPECTION_FIELD_I18N = {
  engineOil: "vehicles.adsInspEngineOil",
  coolant: "vehicles.adsInspCoolant",
  hydraulicFluid: "vehicles.adsInspHydraulicFluid",
  transmissionOil: "vehicles.adsInspTransmissionOil",
  radiator: "vehicles.adsInspRadiator",
  airIntake: "vehicles.adsInspAirIntake",
  airFilter: "vehicles.adsInspAirFilter",
  lubrication: "vehicles.adsInspLubrication",
};

const ADS_INSPECTION_STATUS_I18N = {
  ads_inspection_ok: "vehicles.adsInspStatusOk",
  ads_inspection_status_not_required: "vehicles.adsInspStatusNotRequired",
  ads_inspection_status_slightly_low: "vehicles.adsInspStatusSlightlyLow",
  ads_inspection_status_slightly_darkened: "vehicles.adsInspStatusSlightlyDarkened",
  ads_inspection_status_slight_moisture: "vehicles.adsInspStatusSlightMoisture",
  ads_inspection_status_slightly_dirty: "vehicles.adsInspStatusSlightlyDirty",
  ads_inspection_status_slightly_dry: "vehicles.adsInspStatusSlightlyDry",
  ads_inspection_status_low: "vehicles.adsInspStatusLow",
  ads_inspection_status_darkened: "vehicles.adsInspStatusDarkened",
  ads_inspection_status_seepage: "vehicles.adsInspStatusSeepage",
  ads_inspection_status_dirty: "vehicles.adsInspStatusDirty",
  ads_inspection_status_dry: "vehicles.adsInspStatusDry",
  ads_inspection_status_very_low: "vehicles.adsInspStatusVeryLow",
  ads_inspection_status_contaminated: "vehicles.adsInspStatusContaminated",
  ads_inspection_status_active_leak: "vehicles.adsInspStatusActiveLeak",
  ads_inspection_status_heavily_clogged: "vehicles.adsInspStatusHeavilyClogged",
  ads_inspection_status_very_dry: "vehicles.adsInspStatusVeryDry",
  ads_inspection_status_critically_low: "vehicles.adsInspStatusCriticallyLow",
  ads_inspection_status_critical_condition: "vehicles.adsInspStatusCriticalCondition",
  ads_inspection_status_severe_leak: "vehicles.adsInspStatusSevereLeak",
  ads_inspection_status_critically_clogged: "vehicles.adsInspStatusCriticallyClogged",
  ads_inspection_status_critically_dry: "vehicles.adsInspStatusCriticallyDry",
};

function translateAdsNoteKey(noteKey) {
  if (!noteKey) return "";
  const localized = t(String(noteKey));
  if (localized && localized !== noteKey) return localized;
  return translateAdsInspectionStatus(noteKey);
}

export function translateAdsInspectionStatus(statusKey) {
  if (!statusKey) return "—";
  const i18nKey = ADS_INSPECTION_STATUS_I18N[statusKey];
  if (i18nKey) return t(i18nKey);
  return statusKey.replace(/^ads_inspection_/, "").replace(/_/g, " ");
}

export function getAdsInspectionSeverity(row) {
  const n = Number(row?.severity);
  if (Number.isFinite(n)) return n;
  const key = row?.statusKey;
  if (key === "ads_inspection_ok" || key === "ads_inspection_status_not_required") {
    return 0;
  }
  if (key && key.includes("critical")) return 4;
  if (key && (key.includes("very_") || key.includes("heavily") || key.includes("active_leak"))) {
    return 3;
  }
  if (key && (key.includes("low") || key.includes("dirty") || key.includes("dry") || key.includes("dark"))) {
    return 2;
  }
  if (key && key.includes("slightly")) return 1;
  return 0;
}

export function getWorstAdsInspectionSeverity(vehicle) {
  const inspection = vehicle?.ads?.inspection;
  if (!inspection || typeof inspection !== "object") return 0;
  let worst = 0;
  for (const row of Object.values(inspection)) {
    worst = Math.max(worst, getAdsInspectionSeverity(row));
  }
  return worst;
}

export function vehicleNeedsAdsWarning(vehicle) {
  if (!vehicleHasAds(vehicle)) return false;
  if (hasVisibleAdsBreakdowns(vehicle)) return true;
  if (countActiveAdsBreakdowns(vehicle) > 0) return true;
  if (isVehicleAdsOverdue(vehicle)) return true;
  if (getWorstAdsInspectionSeverity(vehicle) >= 2) return true;
  return false;
}

/** ADS warnings, or high vanilla wear when ADS is not active on the vehicle. */
export function isVehicleInNeedOfRepair(vehicle) {
  if (vehicleHasAds(vehicle)) return vehicleNeedsAdsWarning(vehicle);
  return isVehicleHighWear(vehicle);
}

function adsSeverityClass(severity) {
  if (severity >= 4) return "text-danger fw-semibold";
  if (severity >= 2) return "text-warning fw-semibold";
  if (severity >= 1) return "text-warning-emphasis";
  return "text-success";
}

function formatAdsDateLabel(dateValue) {
  if (!dateValue || typeof dateValue !== "object") return t("vehicles.adsDateNever");
  const year = Number(dateValue.year);
  const month = Number(dateValue.month);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return t("vehicles.adsDateNever");
  }
  return t("vehicles.adsDateMonthYear", { month, year });
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return String(Math.round(n));
  }
}

function humanizeAdsKey(key) {
  return String(key)
    .replace(/^ads_breakdowns_part_/, "")
    .replace(/^ads_breakdowns_severity_/, "")
    .replace(/^ads_spec_system_/, "")
    .replace(/^ads_/, "")
    .replace(/_/g, " ");
}

function translateAdsPartKey(partKey, fallbackId) {
  if (partKey && typeof partKey === "string") {
    const localized = t(partKey);
    if (localized && localized !== partKey) return localized;
    if (partKey.startsWith("ads_")) return humanizeAdsKey(partKey);
  }
  if (fallbackId) {
    return humanizeAdsKey(String(fallbackId));
  }
  return "—";
}

/** ADS registry severity keys → dashboard i18n keys (mirrors ADS_WorkshopDialog labels). */
const ADS_STAGE_SEVERITY_I18N = {
  ads_breakdowns_severity_minor: "vehicles.adsStageMinor",
  ads_breakdowns_severity_moderate: "vehicles.adsStageModerate",
  ads_breakdowns_severity_major: "vehicles.adsStageMajor",
  ads_breakdowns_severity_critical: "vehicles.adsStageCritical",
  ads_breakdowns_severity_permanent: "vehicles.adsStagePermanent",
  ads_breakdowns_quick_fix_stage: "vehicles.adsStageQuickFix",
  ads_breakdowns_defected_parts_stage: "vehicles.adsStageDefectiveParts",
};

function translateAdsStageSeverity(stageSeverityKey, stageNum) {
  if (stageSeverityKey) {
    // Native ADS l10n first (extract-ads-i18n.mjs), then our own keys, then humanize.
    const localized = t(String(stageSeverityKey));
    if (localized && localized !== stageSeverityKey) return localized;
    const mapped = ADS_STAGE_SEVERITY_I18N[String(stageSeverityKey)];
    if (mapped) return t(mapped);
    if (String(stageSeverityKey).startsWith("ads_")) {
      return humanizeAdsKey(stageSeverityKey);
    }
    return String(stageSeverityKey).replace(/^ads_/, "").replace(/_/g, " ");
  }
  const stage = Number(stageNum);
  if (!Number.isFinite(stage) || stage <= 0) return "—";
  if (stage >= 4) return t("vehicles.adsStageMajor");
  if (stage >= 3) return t("vehicles.adsStageModerate");
  return t("vehicles.adsStageMinor");
}

function buildAdsMetricRow(label, value, valueClass = "text-light") {
  return `<div class="d-flex justify-content-between align-items-start mb-1 ads-metric-row">
    <small class="text-muted">${_safe(label)}</small>
    <small class="${valueClass} text-end ms-2">${_safe(value)}</small>
  </div>`;
}

function buildAdsInspectionRow(fieldKey, row) {
  const labelKey = ADS_INSPECTION_FIELD_I18N[fieldKey];
  const label = labelKey ? t(labelKey) : fieldKey;
  const severity = getAdsInspectionSeverity(row);
  const status = translateAdsInspectionStatus(row?.statusKey);
  return buildAdsMetricRow(label, status, adsSeverityClass(severity));
}

function buildAdsBreakdownsHtml(vehicle) {
  const parts = getAdsBreakdownParts(vehicle);
  if (parts.length === 0) return "";

  const rows = parts
    .map((part) => {
      const partName = translateAdsPartKey(part.partKey, part.id);
      const stageLabel = translateAdsStageSeverity(part.stageSeverityKey, part.stage);
      const stage = Number(part.stage);
      const stageClass =
        stage >= 4 ? "text-danger" : stage >= 3 ? "text-warning" : "text-light";
      const price =
        part.repairPrice != null ? formatMoney(part.repairPrice) : "—";
      return `<tr class="${part.isActive === false ? "opacity-75" : ""}">
        <td><small class="text-light fw-semibold">${_safe(partName)}</small></td>
        <td><small class="${stageClass}">${_safe(stageLabel)}</small></td>
        <td class="text-end"><small class="text-muted">${_safe(price)}</small></td>
      </tr>`;
    })
    .join("");

  return `
    <div class="ads-breakdown-block mt-2">
      <small class="text-danger fw-semibold d-block mb-1">
        <i class="bi bi-exclamation-triangle-fill me-1"></i>${t("vehicles.adsBreakdownPartsTitle")}
      </small>
      <div class="table-responsive">
        <table class="table table-sm table-borderless mb-0 ads-breakdown-table">
          <thead>
            <tr>
              <th><small class="text-muted">${t("vehicles.adsBreakdownColPart")}</small></th>
              <th><small class="text-muted">${t("vehicles.adsBreakdownColStage")}</small></th>
              <th class="text-end"><small class="text-muted">${t("vehicles.adsBreakdownColPrice")}</small></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/** Two-column ADS panel for vehicle cards (workshop + pre-shift inspection). */
export function buildAdsVehiclePanelHtml(vehicle) {
  if (!vehicleHasAds(vehicle)) return "";

  const ads = vehicle.ads;
  const badges = [];
  const needsWarning = vehicleNeedsAdsWarning(vehicle);

  if (isVehicleInAdsService(vehicle)) {
    const stateLabel = formatAdsStateLabel(ads.state);
    badges.push(
      `<span class="badge bg-info text-dark me-1">${_safe(
        t("vehicles.adsBadgeInService", {
          state: stateLabel || t("vehicles.adsServiceUnknown"),
        })
      )}</span>`
    );
  }
  const breakdowns = countActiveAdsBreakdowns(vehicle);
  if (breakdowns > 0 || hasVisibleAdsBreakdowns(vehicle)) {
    badges.push(
      `<span class="badge bg-danger me-1">${_safe(
        t("vehicles.adsBadgeBreakdowns", { count: breakdowns || getAdsBreakdownParts(vehicle).length })
      )}</span>`
    );
  }
  if (isVehicleAdsOverdue(vehicle)) {
    badges.push(
      `<span class="badge bg-warning text-dark me-1">${_safe(t("vehicles.adsBadgeOverdue"))}</span>`
    );
  }
  if (needsWarning && breakdowns === 0 && !hasVisibleAdsBreakdowns(vehicle)) {
    badges.push(
      `<span class="badge bg-warning text-dark me-1">${_safe(t("vehicles.adsBadgeInspectionWarn"))}</span>`
    );
  }

  const conditionLabel =
    ads.inspectedCondition != null
      ? formatAdsConditionLabel(ads.inspectedCondition)
      : formatAdsConditionLabel(ads.condition);
  const serviceLabel =
    ads.inspectedService != null
      ? formatAdsServiceLabel(ads.inspectedService)
      : formatAdsServiceLabel(ads.serviceLevel);

  const opHours =
    ads.realOperatingHours != null
      ? t("vehicles.adsOperatingHours", { hours: ads.realOperatingHours })
      : null;

  const intervalLine =
    ads.hoursSinceMaintenance != null && ads.maintenanceInterval != null
      ? t("vehicles.adsIntervalHours", {
          current: ads.hoursSinceMaintenance,
          interval: ads.maintenanceInterval,
        })
      : getAdsIntervalRatio(vehicle) != null
        ? t("vehicles.adsServiceInterval", {
            pct: formatIntervalRatioPercent(getAdsIntervalRatio(vehicle)),
          })
        : null;

  const valueLine =
    ads.sellValue != null && ads.purchaseValue != null
      ? `${formatMoney(ads.sellValue)} / ${formatMoney(ads.purchaseValue)}`
      : ads.sellValue != null
        ? formatMoney(ads.sellValue)
        : null;

  const workshopRows = [
    buildAdsMetricRow(t("vehicles.adsWsCondition"), conditionLabel, "text-success"),
    buildAdsMetricRow(t("vehicles.adsWsService"), serviceLabel, "text-success"),
    opHours ? buildAdsMetricRow(t("vehicles.adsWsOperatingHours"), opHours) : "",
    intervalLine ? buildAdsMetricRow(t("vehicles.adsWsServiceInterval"), intervalLine) : "",
    ads.maintainability != null
      ? buildAdsMetricRow(
          t("vehicles.adsWsMaintainability"),
          formatAdsMaintainabilityLabel(ads.maintainability),
          "text-warning"
        )
      : "",
    ads.ageMonths != null
      ? buildAdsMetricRow(
          t("vehicles.adsWsAge"),
          t("vehicles.adsAgeMonths", { months: ads.ageMonths })
        )
      : "",
    valueLine ? buildAdsMetricRow(t("vehicles.adsWsValue"), valueLine) : "",
    buildAdsMetricRow(
      t("vehicles.adsWsLastMaintenance"),
      formatAdsDateLabel(ads.lastMaintenanceDate)
    ),
  ]
    .filter(Boolean)
    .join("");

  const inspection = ads.inspection || {};
  const inspectionOrder = [
    "engineOil",
    "coolant",
    "hydraulicFluid",
    "transmissionOil",
    "radiator",
    "airIntake",
    "airFilter",
    "lubrication",
  ];
  const inspectionRows = inspectionOrder
    .map((key) => (inspection[key] ? buildAdsInspectionRow(key, inspection[key]) : ""))
    .filter(Boolean)
    .join("");

  const notes = Array.isArray(ads.inspectionNotes) ? ads.inspectionNotes : [];
  const notesHtml =
    notes.length > 0
      ? `<div class="mt-2 pt-2 border-top border-secondary">
          <small class="text-muted d-block mb-1">${t("vehicles.adsInspNotesTitle")}</small>
          ${notes
            .slice(0, 3)
            .map((noteKey) => `<small class="text-warning d-block">• ${_safe(translateAdsNoteKey(noteKey))}</small>`)
            .join("")}
        </div>`
      : "";

  const breakdownsHtml = buildAdsBreakdownsHtml(vehicle);

  const worstSystems = getWorstAdsSystems(vehicle, 2);
  const systemsHtml =
    worstSystems.length > 0
      ? `<div class="mt-2 pt-2 border-top border-secondary">
          <small class="text-muted d-block mb-1">${t("vehicles.adsWeakestSystems")}</small>
          ${worstSystems
            .map((row) => {
              const pct = Math.round(row.condition * 100);
              return `<div class="d-flex justify-content-between"><small class="text-muted">${_safe(formatAdsSystemLabel(row.key))}</small><small class="text-muted">${pct}%</small></div>`;
            })
            .join("")}
        </div>`
      : "";

  return `
    <div class="mb-3 border border-secondary rounded p-2 ads-vehicle-panel${needsWarning ? " ads-vehicle-panel--warn" : ""}">
      <div class="d-flex flex-wrap align-items-center gap-1 mb-2">
        <small class="text-farm-accent fw-semibold me-1">
          <i class="bi bi-gear-wide-connected me-1"></i>${t("vehicles.adsPanelTitle")}
        </small>
        ${badges.join("")}
      </div>
      <div class="row g-2 ads-panel-columns">
        <div class="col-md-6">
          <small class="text-farm-accent fw-semibold d-block mb-1">${t("vehicles.adsWsColumnTitle")}</small>
          ${workshopRows}
        </div>
        <div class="col-md-6">
          <small class="text-farm-accent fw-semibold d-block mb-1">${t("vehicles.adsInspColumnTitle")}</small>
          ${inspectionRows || `<small class="text-muted">${t("vehicles.adsInspUnavailable")}</small>`}
          ${notesHtml}
        </div>
      </div>
      ${breakdownsHtml}
      ${systemsHtml}
    </div>`;
}
