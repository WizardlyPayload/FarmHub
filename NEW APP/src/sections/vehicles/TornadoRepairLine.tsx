import { t } from "@/i18n/i18n";
import type { FleetVehicle } from "@/lib/vehicles";

function remainingTime(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const leftoverMinutes = minutes % 60;
  if (hours < 24) return `${hours}h${leftoverMinutes ? ` ${leftoverMinutes}m` : ""}`;
  const days = Math.floor(hours / 24);
  const leftoverHours = hours % 24;
  return `${days}d${leftoverHours ? ` ${leftoverHours}h` : ""}`;
}

/** Tornado Physics visual-part repair timer, sampled at the last game export. */
export function TornadoRepairLine({ vehicle }: { vehicle: FleetVehicle }) {
  const ms = Number(vehicle.tornadoRepair?.remainingMs);
  if (!vehicle.tornadoRepair || !Number.isFinite(ms) || ms < 0) return null;
  const label = ms === 0
    ? t("vehicles.stormPartsRepairDue")
    : t("vehicles.stormPartsRepairTime", { time: remainingTime(ms) });
  return <small class="fd-vehicles__attached fd-muted" data-fold="tornadoRepair" title={label}>{label}</small>;
}
