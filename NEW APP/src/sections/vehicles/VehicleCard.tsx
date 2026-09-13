import { Badge } from "@/components/ui";
import { t } from "@/i18n/i18n";
import { vehicleNeedsAdsWarning } from "@/lib/vehicleAds";
import {
  getVehicleModelYear,
  isVehicleYearUnknown,
} from "@/lib/vehicleYears";
import {
  deriveStoreImageHint,
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
} from "@/lib/vehicles";

interface Props {
  vehicle: FleetVehicle;
  focused?: boolean;
  onSelect?: () => void;
  onShowOnMap?: () => void;
}

/** Lean fleet card — year badge only; ADS detail lives in the right inspector. */
export function VehicleCard({ vehicle, focused, onSelect, onShowOnMap }: Props) {
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
    <article
      class={`fd-vehicle-card${needsWarn ? " fd-vehicle-card--warn" : ""}${focused ? " fd-vehicle-card--focused" : ""}`}
      data-vehicle-id={vehicleRowKey(vehicle)}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.();
        }
      }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      <header class="fd-vehicle-card__header">
        <div class="fd-vehicle-card__identity">
          {display.isImage && display.imageUrl ? (
            <img
              class="fd-vehicle-card__thumb"
              src={display.imageUrl}
              alt={display.displayText}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = "none";
              }}
            />
          ) : (
            <div
              class="fd-vehicle-card__thumb fd-vehicle-card__thumb--fallback"
              style={{ background: display.background, color: display.textColor }}
            >
              {display.displayText}
            </div>
          )}
          <div>
            <h3 class="fd-vehicle-card__name" title={displayName}>
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
        {showFuel ? (
          <Badge tone={vehicle.engineOn ? "accent" : "default"}>
            {vehicle.engineOn ? t("vehicles.optStatusEngineOn") : t("vehicles.optStatusEngineOff")}
          </Badge>
        ) : null}
      </header>

      <div class="fd-vehicle-card__body">
        <div class="fd-vehicle-card__stat">
          <small class="fd-muted">{t("vehicles.cardOperatingTime")}</small>
          <strong>{formatOperatingTime(vehicle.operatingTime || 0)}</strong>
        </div>

        {showFuel && fuelPct != null ? (
          <BarRow
            label={t("vehicles.cardFuel")}
            pct={Math.round(fuelPct)}
            tone={getFuelBarTone(fuelPct)}
          />
        ) : null}

        <BarRow
          label={t("vehicles.cardCondition")}
          pct={conditionPct}
          tone={getDamageBarTone(damagePct)}
        />
      </div>

      <footer class="fd-vehicle-card__footer">
        <small class="fd-muted">
          {Math.round(vehicle.position?.x || 0)}, {Math.round(vehicle.position?.z || 0)}
        </small>
        <div class="fd-vehicle-card__footer-actions">
          {onShowOnMap && vehicleHasMapPosition(vehicle) ? (
            <button
              type="button"
              class="fd-vehicle-card__map-link"
              onClick={(e) => {
                e.stopPropagation();
                onShowOnMap();
              }}
            >
              {t("vehicles.showOnMap")}
            </button>
          ) : null}
          <Badge>{vehicle.typeName || vehicle.vehicleType || t("vehicles.optImplements")}</Badge>
        </div>
      </footer>
    </article>
  );
}

function BarRow({
  label,
  pct,
  tone,
}: {
  label: string;
  pct: number;
  tone: "accent" | "warn" | "danger";
}) {
  return (
    <div class="fd-vehicle-bar">
      <div class="fd-vehicle-bar__label">
        <small class="fd-muted">{label}</small>
        <small class="fd-muted">{pct}%</small>
      </div>
      <div class="fd-vehicle-bar__track">
        <div class={`fd-vehicle-bar__fill fd-vehicle-bar__fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
