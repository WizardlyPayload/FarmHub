import { Badge } from "@/components/ui";
import { t } from "@/i18n/i18n";
import {
  countActiveAdsBreakdowns,
  formatAdsServiceLabel,
  isVehicleAdsOverdue,
  isVehicleInAdsService,
  vehicleHasAds,
  vehicleNeedsAdsWarning,
} from "@/lib/vehicleAds";
import {
  fleetHasMileage,
  formatMileageKm,
  getVehicleOdoKm,
  vehicleHasMileage,
} from "@/lib/vehicleMileage";
import {
  deriveStoreImageHint,
  generateVehicleDisplay,
  getVehicleConditionFraction,
  getVehicleDamageFraction,
  getVehicleFuelPercentage,
  getVehicleYearLabel,
  resolveVehicleBrandLabel,
  resolveVehicleDisplayName,
  shouldShowFuel,
  vehicleRowKey,
  type FleetVehicle,
} from "@/lib/vehicles";

interface Props {
  vehicles: FleetVehicle[];
  focusedId?: string | null;
  onFocus?: (vehicle: FleetVehicle) => void;
}

export function VehicleTable({ vehicles, focusedId, onFocus }: Props) {
  const showMileage = fleetHasMileage(vehicles);

  return (
    <div class="fd-vehicles__table-wrap">
      <table class="fd-table fd-vehicles__table">
        <thead>
          <tr>
            <th class="fd-vehicles__col-thumb" aria-label={t("vehicles.colImage")} />
            <th>{t("vehicles.colName")}</th>
            <th>{t("vehicles.colBrand")}</th>
            <th>{t("vehicles.colType")}</th>
            <th>{t("vehicles.colYear")}</th>
            <th>{t("vehicles.colFuel")}</th>
            <th>{t("vehicles.colCondition")}</th>
            <th>{t("vehicles.colDamage")}</th>
            <th>{t("vehicles.colAds")}</th>
            {showMileage ? <th class="fd-vehicles__col-mileage">{t("vehicles.colMileage")}</th> : null}
            <th>{t("vehicles.colStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((v) => (
            <VehicleTableRow
              key={vehicleRowKey(v)}
              vehicle={v}
              focused={Boolean(focusedId && vehicleRowKey(v) === focusedId)}
              showMileage={showMileage}
              onFocus={onFocus}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VehicleTableRow({
  vehicle,
  focused,
  showMileage,
  onFocus,
}: {
  vehicle: FleetVehicle;
  focused?: boolean;
  showMileage?: boolean;
  onFocus?: (vehicle: FleetVehicle) => void;
}) {
  const brandName = resolveVehicleBrandLabel(vehicle.brand);
  const displayName = resolveVehicleDisplayName(vehicle);
  const display = generateVehicleDisplay(displayName, brandName, String(vehicle.typeName || ""), {
    storeName: vehicle.storeName || vehicle.vehicleYears?.storeName || null,
    storeImage: deriveStoreImageHint(vehicle),
  });
  const fuelPct = getVehicleFuelPercentage(vehicle);
  const showFuel = shouldShowFuel(vehicle);
  const damagePct = Math.round(getVehicleDamageFraction(vehicle) * 100);
  const conditionPct = Math.round(getVehicleConditionFraction(vehicle) * 100);
  const yearLabel = getVehicleYearLabel(vehicle);
  const rowKey = vehicleRowKey(vehicle);
  const odoKm = showMileage && vehicleHasMileage(vehicle) ? getVehicleOdoKm(vehicle) : null;

  const status =
    vehicle.engineOn || (Number(vehicle.speed) || 0) > 0.5
      ? t("vehicles.optStatusEngineOn")
      : t("vehicles.optStatusEngineOff");

  const adsBits: string[] = [];
  if (vehicleHasAds(vehicle)) {
    if (isVehicleInAdsService(vehicle)) adsBits.push(t("vehicles.adsInService"));
    if (isVehicleAdsOverdue(vehicle)) adsBits.push(t("vehicles.adsBadgeOverdue"));
    const breakdowns = countActiveAdsBreakdowns(vehicle);
    if (breakdowns > 0) {
      adsBits.push(t("vehicles.adsBadgeBreakdowns", { count: breakdowns }));
    } else if (vehicleNeedsAdsWarning(vehicle)) {
      adsBits.push(t("vehicles.adsBadgeInspectionWarn"));
    } else if (vehicle.ads?.serviceLevel != null) {
      adsBits.push(formatAdsServiceLabel(vehicle.ads.serviceLevel));
    }
  }

  return (
    <tr
      class={`fd-vehicles__row${focused ? " is-focused" : ""}${vehicleNeedsAdsWarning(vehicle) ? " is-warn" : ""}`}
      data-vehicle-id={rowKey}
      onClick={() => onFocus?.(vehicle)}
    >
      <td class="fd-vehicles__col-thumb">
        {display.isImage && display.imageUrl ? (
          <img
            class="fd-vehicles__table-thumb"
            src={display.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span
            class="fd-vehicles__table-thumb fd-vehicles__table-thumb--fallback"
            style={{ background: display.background, color: display.textColor }}
          >
            {display.displayText.slice(0, 3)}
          </span>
        )}
      </td>
      <td>
        <strong>{displayName}</strong>
        {focused ? <Badge tone="accent">{t("vehicles.focusHint")}</Badge> : null}
      </td>
      <td>{brandName || "—"}</td>
      <td>{String(vehicle.typeName || vehicle.vehicleType || "—")}</td>
      <td>{yearLabel}</td>
      <td>{showFuel && fuelPct != null ? `${Math.round(fuelPct)}%` : "—"}</td>
      <td>{conditionPct}%</td>
      <td class={damagePct > 20 ? "is-warn" : ""}>{damagePct}%</td>
      <td>{adsBits.length > 0 ? adsBits.join(" · ") : "—"}</td>
      {showMileage ? (
        <td class="fd-vehicles__col-mileage">
          {odoKm != null ? t("vehicles.mileageKm", { km: formatMileageKm(odoKm) }) : "—"}
        </td>
      ) : null}
      <td>{status}</td>
    </tr>
  );
}
