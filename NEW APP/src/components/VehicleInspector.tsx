import { Badge, Button } from "@/components/ui";
import { t } from "@/i18n/i18n";
import { AdsVehiclePanel } from "@/sections/vehicles/AdsVehiclePanel";
import { MileageVehiclePanel } from "@/sections/vehicles/MileageVehiclePanel";
import { VehicleYearsPanel } from "@/sections/vehicles/VehicleYearsPanel";
import {
  getVehicleModelYear,
  isVehicleYearUnknown,
} from "@/lib/vehicleYears";
import {
  formatOperatingTime,
  generateVehicleDisplay,
  getDamageBarTone,
  getFuelBarTone,
  getVehicleConditionFraction,
  getVehicleDamageFraction,
  getVehicleFuelPercentage,
  resolveVehicleBrandLabel,
  resolveVehicleDisplayName,
  shouldShowFuel,
  vehicleHasMapPosition,
  vehicleRowKey,
  type FleetVehicle,
  deriveStoreImageHint,
} from "@/lib/vehicles";
import { vehicleNeedsAdsWarning } from "@/lib/vehicleAds";

interface Props {
  vehicle: FleetVehicle | null;
  onClose: () => void;
  onShowOnMap?: () => void;
}

/** Right-rail vehicle inspector with full ADS (+ Vehicle Years when ADS absent). */
export function VehicleInspector({ vehicle, onClose, onShowOnMap }: Props) {
  if (!vehicle) return null;

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
  const modelYear = getVehicleModelYear(vehicle);
  const needsWarn = vehicleNeedsAdsWarning(vehicle);

  return (
    <aside class="fd-inspector" aria-label={t("vehicles.detailTitle")}>
      <header class="fd-inspector__header">
        <div class="fd-inspector__identity">
          {display.isImage && display.imageUrl ? (
            <img class="fd-inspector__thumb" src={display.imageUrl} alt="" />
          ) : (
            <div
              class="fd-inspector__thumb fd-inspector__thumb--fallback"
              style={{ background: display.background, color: display.textColor }}
            >
              {display.displayText}
            </div>
          )}
          <div>
            <h3 class="fd-inspector__title">
              {displayName}
              {modelYear != null ? (
                <Badge tone="accent">{modelYear}</Badge>
              ) : isVehicleYearUnknown(vehicle) ? (
                <Badge>{t("vehicles.yearUnknownShort")}</Badge>
              ) : null}
              {needsWarn ? <Badge tone="danger">!</Badge> : null}
            </h3>
            <small class="fd-muted">{brandName || "—"}</small>
          </div>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label={t("common.close")}>
          ×
        </Button>
      </header>

      <div class="fd-inspector__body">
        <div class="fd-inspector__stat">
          <small class="fd-muted">{t("vehicles.cardOperatingTime")}</small>
          <strong>{formatOperatingTime(vehicle.operatingTime || 0)}</strong>
        </div>
        {showFuel && fuelPct != null ? (
          <div class="fd-vehicle-bar">
            <div class="fd-vehicle-bar__label">
              <small class="fd-muted">{t("vehicles.cardFuel")}</small>
              <small class="fd-muted">{Math.round(fuelPct)}%</small>
            </div>
            <div class="fd-vehicle-bar__track">
              <div
                class={`fd-vehicle-bar__fill fd-vehicle-bar__fill--${getFuelBarTone(fuelPct)}`}
                style={{ width: `${Math.round(fuelPct)}%` }}
              />
            </div>
          </div>
        ) : null}
        <div class="fd-vehicle-bar">
          <div class="fd-vehicle-bar__label">
            <small class="fd-muted">{t("vehicles.cardCondition")}</small>
            <small class="fd-muted">{conditionPct}%</small>
          </div>
          <div class="fd-vehicle-bar__track">
            <div
              class={`fd-vehicle-bar__fill fd-vehicle-bar__fill--${getDamageBarTone(damagePct)}`}
              style={{ width: `${conditionPct}%` }}
            />
          </div>
        </div>

        <AdsVehiclePanel vehicle={vehicle} />
        <VehicleYearsPanel vehicle={vehicle} />
        <MileageVehiclePanel vehicle={vehicle} />

        {onShowOnMap && vehicleHasMapPosition(vehicle) ? (
          <Button variant="ghost" onClick={onShowOnMap}>
            {t("vehicles.showOnMap")}
          </Button>
        ) : null}
        <small class="fd-muted">
          id {vehicleRowKey(vehicle)} · {vehicle.typeName || vehicle.vehicleType || "—"}
        </small>
      </div>
    </aside>
  );
}
