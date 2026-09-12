import { t } from "@/i18n/i18n";
import {
  formatMileageKm,
  getVehicleOdoKm,
  getVehicleTripKm,
  vehicleHasMileage,
  type MileageVehicle,
} from "@/lib/vehicleMileage";
import "@/sections/vehicles/vehicles.css";

interface Props {
  vehicle: MileageVehicle;
}

/** Vehicle Mileage detail for the right inspector (shown when mileage.enabled). */
export function MileageVehiclePanel({ vehicle }: Props) {
  if (!vehicleHasMileage(vehicle)) return null;

  const odoKm = getVehicleOdoKm(vehicle);
  const tripKm = getVehicleTripKm(vehicle);

  return (
    <section class="fd-mileage-panel" aria-label={t("vehicles.mileagePanelTitle")}>
      <header class="fd-ads-panel__header">
        <span class="fd-mileage-panel__title">{t("vehicles.mileagePanelTitle")}</span>
      </header>
      <dl class="fd-mileage-panel__stats">
        <div>
          <dt>{t("vehicles.mileageOdo")}</dt>
          <dd>
            {odoKm != null ? t("vehicles.mileageKm", { km: formatMileageKm(odoKm) }) : "—"}
          </dd>
        </div>
        <div>
          <dt>{t("vehicles.mileageTrip")}</dt>
          <dd>
            {tripKm != null ? t("vehicles.mileageKm", { km: formatMileageKm(tripKm) }) : "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
