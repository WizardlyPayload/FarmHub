import { t } from "@/i18n/i18n";
import type { FleetVehicle } from "@/lib/vehicles";
import { formatDistance, useVehicleCompanions, vehicleDistance } from "@/sections/vehicles/vehicleCompanions";
import "@/sections/vehicles/vehicles.css";

interface Props {
  vehicle: FleetVehicle;
}

/** Vehicle Mileage detail for the right inspector, in the game's distance unit. */
export function MileageVehiclePanel({ vehicle }: Props) {
  const companions = useVehicleCompanions();
  const { odoKm, tripKm } = vehicleDistance(companions, vehicle);
  if (odoKm == null && tripKm == null) return null;
  const miles = companions.mileage.miles;

  return (
    <section class="fd-mileage-panel" aria-label={t("vehicles.mileagePanelTitle")} data-fold="vehicleMileage">
      <header class="fd-ads-panel__header">
        <span class="fd-mileage-panel__title">{t("vehicles.mileagePanelTitle")}</span>
      </header>
      <dl class="fd-mileage-panel__stats">
        <div>
          <dt>{t("vehicles.mileageOdo")}</dt>
          <dd>{formatDistance(odoKm, miles)}</dd>
        </div>
        <div>
          <dt>{t("vehicles.mileageTrip")}</dt>
          <dd>{formatDistance(tripKm, miles)}</dd>
        </div>
      </dl>
    </section>
  );
}
