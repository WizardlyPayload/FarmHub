import { Badge } from "@/components/ui";
import { t } from "@/i18n/i18n";
import {
  ADS_INSPECTION_FIELD_I18N,
  ADS_INSPECTION_ORDER,
  adsSeverityTone,
  countActiveAdsBreakdowns,
  formatAdsConditionLabel,
  formatAdsDateLabel,
  formatAdsMaintainabilityLabel,
  formatAdsMoney,
  formatAdsPercent,
  formatAdsServiceLabel,
  formatAdsStateLabel,
  formatAdsSystemLabel,
  formatAdsTempC,
  formatIntervalRatioPercent,
  getAdsBreakdownParts,
  getAdsInspectionSeverity,
  getAdsIntervalRatio,
  getAdsSystemsOrdered,
  hasVisibleAdsBreakdowns,
  isVehicleAdsOverdue,
  isVehicleInAdsService,
  translateAdsInspectionStatus,
  translateAdsNoteKey,
  translateAdsPartKey,
  translateAdsStageSeverity,
  vehicleHasAds,
  vehicleNeedsAdsWarning,
  type AdsVehicle,
} from "@/lib/vehicleAds";

interface Props {
  vehicle: AdsVehicle;
}

export function AdsVehiclePanel({ vehicle }: Props) {
  if (!vehicleHasAds(vehicle)) return null;
  const ads = vehicle.ads!;
  const needsWarning = vehicleNeedsAdsWarning(vehicle);
  const breakdowns = countActiveAdsBreakdowns(vehicle);
  const parts = getAdsBreakdownParts(vehicle);

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
      ? `${formatAdsMoney(ads.sellValue)} / ${formatAdsMoney(ads.purchaseValue)}`
      : ads.sellValue != null
        ? formatAdsMoney(ads.sellValue)
        : null;

  const inspection = ads.inspection || {};
  const notes = Array.isArray(ads.inspectionNotes) ? ads.inspectionNotes : [];
  const hasInspectionData = ADS_INSPECTION_ORDER.some((k) => inspection[k]);
  const systems = getAdsSystemsOrdered(vehicle);

  return (
    <div class={`fd-ads-panel${needsWarning ? " fd-ads-panel--warn" : ""}`}>
      <div class="fd-ads-panel__header">
        <span class="fd-ads-panel__title">{t("vehicles.adsPanelTitle")}</span>
        {isVehicleInAdsService(vehicle) ? (
          <Badge tone="accent">
            {t("vehicles.adsBadgeInService", {
              state: formatAdsStateLabel(ads.state) || t("vehicles.adsServiceUnknown"),
            })}
          </Badge>
        ) : null}
        {breakdowns > 0 || hasVisibleAdsBreakdowns(vehicle) ? (
          <Badge tone="danger">
            {t("vehicles.adsBadgeBreakdowns", {
              count: breakdowns || parts.length,
            })}
          </Badge>
        ) : null}
        {isVehicleAdsOverdue(vehicle) ? (
          <Badge tone="warn">{t("vehicles.adsBadgeOverdue")}</Badge>
        ) : null}
        {needsWarning && breakdowns === 0 && !hasVisibleAdsBreakdowns(vehicle) ? (
          <Badge tone="warn">{t("vehicles.adsBadgeInspectionWarn")}</Badge>
        ) : null}
      </div>

      <div class="fd-ads-panel__columns">
        <div>
          <div class="fd-ads-panel__col-title">{t("vehicles.adsWsColumnTitle")}</div>
          <MetricRow label={t("vehicles.adsWsCondition")} value={conditionLabel} />
          <MetricRow label={t("vehicles.adsWsService")} value={serviceLabel} />
          {opHours ? <MetricRow label={t("vehicles.adsWsOperatingHours")} value={opHours} /> : null}
          {intervalLine ? (
            <MetricRow label={t("vehicles.adsWsServiceInterval")} value={intervalLine} />
          ) : null}
          {ads.maintainability != null ? (
            <MetricRow
              label={t("vehicles.adsWsMaintainability")}
              value={formatAdsMaintainabilityLabel(ads.maintainability)}
            />
          ) : null}
          {ads.reliability != null ? (
            <MetricRow label={t("vehicles.adsWsReliability")} value={formatAdsPercent(ads.reliability)} />
          ) : null}
          {ads.year != null ? (
            <MetricRow label={t("vehicles.adsWsYear")} value={String(ads.year)} />
          ) : null}
          {ads.ageMonths != null ? (
            <MetricRow
              label={t("vehicles.adsWsAge")}
              value={t("vehicles.adsAgeMonths", { months: ads.ageMonths })}
            />
          ) : null}
          {valueLine ? <MetricRow label={t("vehicles.adsWsValue")} value={valueLine} /> : null}
          {ads.maintenanceSpend != null ? (
            <MetricRow
              label={t("vehicles.adsWsMaintenanceSpend")}
              value={formatAdsMoney(ads.maintenanceSpend)}
            />
          ) : null}
          <MetricRow
            label={t("vehicles.adsWsLastMaintenance")}
            value={formatAdsDateLabel(ads.lastMaintenanceDate)}
          />
          <MetricRow
            label={t("vehicles.adsWsLastInspection")}
            value={formatAdsDateLabel(ads.lastInspectionDate)}
          />
          {ads.engineTemp != null ? (
            <MetricRow label={t("vehicles.adsWsEngineTemp")} value={formatAdsTempC(ads.engineTemp)} />
          ) : null}
          {ads.transTemp != null ? (
            <MetricRow label={t("vehicles.adsWsTransTemp")} value={formatAdsTempC(ads.transTemp)} />
          ) : null}
          {ads.batterySoc != null ? (
            <MetricRow label={t("vehicles.adsWsBattery")} value={formatAdsPercent(ads.batterySoc)} />
          ) : null}
          {ads.radiatorClogging != null ? (
            <MetricRow
              label={t("vehicles.adsWsRadiatorClog")}
              value={formatAdsPercent(ads.radiatorClogging)}
            />
          ) : null}
          {ads.airIntakeClogging != null ? (
            <MetricRow
              label={t("vehicles.adsWsAirIntakeClog")}
              value={formatAdsPercent(ads.airIntakeClogging)}
            />
          ) : null}
          {ads.lubricationLevel != null ? (
            <MetricRow
              label={t("vehicles.adsWsLubrication")}
              value={formatAdsPercent(ads.lubricationLevel)}
            />
          ) : null}
        </div>
        <div>
          <div class="fd-ads-panel__col-title">{t("vehicles.adsInspColumnTitle")}</div>
          {hasInspectionData ? (
            ADS_INSPECTION_ORDER.map((key) => {
              const row = inspection[key];
              const labelKey = ADS_INSPECTION_FIELD_I18N[key];
              if (!row) {
                return (
                  <MetricRow key={key} label={labelKey ? t(labelKey) : key} value="—" />
                );
              }
              return (
                <MetricRow
                  key={key}
                  label={labelKey ? t(labelKey) : key}
                  value={translateAdsInspectionStatus(row.statusKey)}
                  tone={adsSeverityTone(getAdsInspectionSeverity(row))}
                />
              );
            })
          ) : (
            <small class="fd-muted">{t("vehicles.adsInspUnavailable")}</small>
          )}
          {notes.length > 0 ? (
            <div class="fd-ads-panel__notes">
              <small class="fd-muted">{t("vehicles.adsInspNotesTitle")}</small>
              {notes.map((noteKey) => (
                <small key={noteKey} class="fd-ads-panel__note">
                  • {translateAdsNoteKey(noteKey)}
                </small>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {parts.length > 0 ? (
        <div class="fd-ads-breakdown">
          <div class="fd-ads-breakdown__title">{t("vehicles.adsBreakdownPartsTitle")}</div>
          <table class="fd-ads-breakdown__table">
            <thead>
              <tr>
                <th>{t("vehicles.adsBreakdownColPart")}</th>
                <th>{t("vehicles.adsBreakdownColStage")}</th>
                <th>{t("vehicles.adsBreakdownColPrice")}</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part, idx) => {
                const stage = Number(part.stage);
                return (
                  <tr key={part.id || part.partKey || `part-${idx}`}>
                    <td>{translateAdsPartKey(part.partKey, part.id)}</td>
                    <td class={stage >= 4 ? "is-danger" : stage >= 3 ? "is-warn" : ""}>
                      {translateAdsStageSeverity(part.stageSeverityKey, part.stage)}
                    </td>
                    <td>
                      {part.repairPrice != null ? formatAdsMoney(part.repairPrice) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {systems.length > 0 ? (
        <div class="fd-ads-panel__systems">
          <div class="fd-ads-panel__col-title">{t("vehicles.adsSystemsTitle")}</div>
          <div class="fd-ads-panel__system-head">
            <small class="fd-muted">{t("vehicles.adsSystemColName")}</small>
            <small class="fd-muted">{t("vehicles.adsSystemColCondition")}</small>
            <small class="fd-muted">{t("vehicles.adsSystemColStress")}</small>
          </div>
          {systems.map((row) => {
            const conditionTone =
              row.condition == null
                ? null
                : row.condition < 0.35
                  ? "danger"
                  : row.condition < 0.55
                    ? "warn"
                    : "accent";
            return (
              <div key={row.key} class="fd-ads-panel__system-row fd-ads-panel__system-row--full">
                <small>{formatAdsSystemLabel(row.key) || row.key}</small>
                <small class={conditionTone ? `fd-ads-metric__value is-${conditionTone}` : undefined}>
                  {formatAdsPercent(row.condition)}
                </small>
                <small>{formatAdsPercent(row.stress)}</small>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MetricRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "warn" | "danger";
}) {
  return (
    <div class="fd-ads-metric">
      <small class="fd-muted">{label}</small>
      <small class={`fd-ads-metric__value${tone && tone !== "default" ? ` is-${tone}` : ""}`}>
        {value}
      </small>
    </div>
  );
}
