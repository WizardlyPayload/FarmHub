import { useEffect, useMemo, useState } from "preact/hooks";
import { Badge } from "@/components/ui";
import { t } from "@/i18n/i18n";
import {
  countActiveAdsBreakdowns,
  formatAdsConditionLabel,
  formatAdsServiceLabel,
  isVehicleAdsOverdue,
  summarizeAdsFleet,
  vehicleHasAds,
  vehicleNeedsAdsWarning,
} from "@/lib/vehicleAds";
import {
  getDisplayFleet,
  isStorageItem,
  normalizeVehicleList,
  resolveVehicleDisplayName,
  vehicleMatchesActiveFarm,
  vehicleMatchesDeepLinkId,
  vehicleRowKey,
  type FleetVehicle,
} from "@/lib/vehicles";
import { useDashboardStore } from "@/store/dashboard-store";
import "@/sections/vehicles/vehicles.css";

function motorizedAdsFleet(vehicles: unknown, farmId: number): FleetVehicle[] {
  return normalizeVehicleList(vehicles).filter((v) => {
    if (!vehicleMatchesActiveFarm(v, farmId)) return false;
    if (isStorageItem(v)) return false;
    if (!v.isMotorized) return false;
    return vehicleHasAds(v) || vehicleNeedsAdsWarning(v);
  });
}

/** Motorized-only ADS list; select opens the shared right inspector in Shell. */
export function AdsSection() {
  const payload = useDashboardStore((s) => s.payload);
  const farmId = useDashboardStore((s) => s.activeFarmId) ?? 1;
  const sectionParams = useDashboardStore((s) => s.sectionParams);
  const setSectionParams = useDashboardStore((s) => s.setSectionParams);
  const [selectedId, setSelectedId] = useState<string | null>(sectionParams.id || null);

  useEffect(() => {
    setSelectedId(sectionParams.id ? String(sectionParams.id) : null);
  }, [sectionParams.id]);

  const fleet = useMemo(() => motorizedAdsFleet(payload?.vehicles, farmId), [payload?.vehicles, farmId]);
  const summary = useMemo(
    () => summarizeAdsFleet(getDisplayFleet(payload?.vehicles, farmId)),
    [payload?.vehicles, farmId],
  );

  const select = (v: FleetVehicle) => {
    const id = vehicleRowKey(v);
    setSelectedId(id);
    setSectionParams({ ...sectionParams, id });
  };

  return (
    <div class="fd-vehicles fd-vehicles--ads">
      <header class="fd-vehicles__header">
        <h2>{t("nav.mod.ads")}</h2>
        <p class="fd-muted">{t("ads.subtitle")}</p>
      </header>

      <div class="fd-vehicles__summary fd-vehicles__summary--ads">
        <div class="fd-vehicles-summary-card">
          <span class="fd-vehicles-summary-card__title">{t("vehicles.adsInService")}</span>
          <strong class="fd-vehicles-summary-card__value">{summary.inServiceCount}</strong>
        </div>
        <div class="fd-vehicles-summary-card is-danger">
          <span class="fd-vehicles-summary-card__title">{t("vehicles.adsBreakdowns")}</span>
          <strong class="fd-vehicles-summary-card__value">{summary.breakdownVehicleCount}</strong>
        </div>
        <div class="fd-vehicles-summary-card is-warn">
          <span class="fd-vehicles-summary-card__title">{t("vehicles.adsNeedsRepair")}</span>
          <strong class="fd-vehicles-summary-card__value">{summary.needsRepairCount}</strong>
        </div>
      </div>

      {fleet.length === 0 ? (
        <div class="fd-vehicles__empty">
          <h3>{t("ads.emptyTitle")}</h3>
          <p class="fd-muted">{t("ads.emptyBody")}</p>
        </div>
      ) : (
        <div class="fd-ads-list fd-ads-list--full">
          <p class="fd-muted">{t("ads.selectHint")}</p>
          {fleet.map((v) => {
            const id = vehicleRowKey(v);
            const active =
              Boolean(selectedId) &&
              (id === selectedId || vehicleMatchesDeepLinkId(v, selectedId));
            const breakdowns = countActiveAdsBreakdowns(v);
            const overdue = isVehicleAdsOverdue(v);
            return (
              <button
                type="button"
                key={id}
                class={`fd-ads-list__item${active ? " is-active" : ""}${vehicleNeedsAdsWarning(v) ? " is-warn" : ""}`}
                onClick={() => select(v)}
              >
                <strong>{resolveVehicleDisplayName(v)}</strong>
                <span class="fd-muted">
                  {formatAdsConditionLabel(v.ads?.condition)} · {formatAdsServiceLabel(v.ads?.serviceLevel)}
                </span>
                <span class="fd-ads-list__badges">
                  {breakdowns > 0 ? <Badge tone="danger">{breakdowns}</Badge> : null}
                  {overdue ? <Badge tone="warn">{t("vehicles.adsOverdue")}</Badge> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
