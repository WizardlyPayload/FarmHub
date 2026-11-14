import { t } from "@/i18n/i18n";
import type { FleetVehicle } from "@/lib/vehicles";

/** A compact base-game attachment snapshot for tractors. */
export function AttachedEquipmentLine({ vehicle }: { vehicle: FleetVehicle }) {
  if (vehicle.vehicleType !== "tractor" || !Array.isArray(vehicle.attachedEquipment)) return null;
  const names = vehicle.attachedEquipment.filter((name) => typeof name === "string" && name.trim());
  if (names.length === 0) return null;
  const count = Math.max(names.length, Number(vehicle.attachedImplementsCount || 0));
  const hidden = Math.max(0, count - names.length);
  const detail = `${names.join(", ")}${hidden ? ` +${hidden}` : ""}`;
  const label = t(count === 1 ? "vehicles.cardImplementsOne" : "vehicles.cardImplementsMany", { count });
  return (
    <small class="fd-vehicles__attached fd-muted" title={`${label}: ${detail}`}>
      {label}: {detail}
    </small>
  );
}
