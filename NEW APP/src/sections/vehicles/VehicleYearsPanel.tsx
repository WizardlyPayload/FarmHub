import { Badge } from "@/components/ui";
import { t } from "@/i18n/i18n";
import {
  getVehicleDecadeLabel,
  getVehicleModelYear,
  isVehicleYearUnknown,
  vehicleHasYears,
  type VehicleYearsVehicle,
} from "@/lib/vehicleYears";
import { vehicleHasAds } from "@/lib/vehicleAds";
import "@/sections/vehicles/vehicles.css";

interface Props {
  vehicle: VehicleYearsVehicle;
}

/**
 * Vehicle Years detail for the right inspector.
 * Hidden when ADS is also on the vehicle (legacy parity — year still shows as badge via ADS).
 */
export function VehicleYearsPanel({ vehicle }: Props) {
  if (!vehicleHasYears(vehicle)) return null;
  if (vehicleHasAds(vehicle as { ads?: { enabled?: boolean } })) return null;

  const year = getVehicleModelYear(vehicle);
  const decade = getVehicleDecadeLabel(vehicle);
  const vy = vehicle.vehicleYears!;

  return (
    <section class="fd-vy-panel" aria-label={t("vehicles.yearsPanelTitle")}>
      <header class="fd-ads-panel__header">
        <span class="fd-vy-panel__title">{t("vehicles.yearsPanelTitle")}</span>
        {isVehicleYearUnknown(vehicle) ? (
          <Badge>{t("vehicles.yearUnknownShort")}</Badge>
        ) : year != null ? (
          <Badge tone="accent">{year}</Badge>
        ) : null}
      </header>
      <dl class="fd-vy-panel__stats">
        {decade ? (
          <div>
            <dt>{t("vehicles.yearsDecade")}</dt>
            <dd>{decade}</dd>
          </div>
        ) : null}
        {vy.reliability != null ? (
          <div>
            <dt>{t("vehicles.yearsReliability")}</dt>
            <dd>{Number(vy.reliability).toFixed(2)}</dd>
          </div>
        ) : null}
        {vy.maintainability != null ? (
          <div>
            <dt>{t("vehicles.yearsMaintainability")}</dt>
            <dd>{Number(vy.maintainability).toFixed(2)}</dd>
          </div>
        ) : null}
        {vy.storeName ? (
          <div>
            <dt>{t("vehicles.yearsStoreName")}</dt>
            <dd>{String(vy.storeName)}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
