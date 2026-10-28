import { tOr } from "@/i18n/i18n";
import type { DashboardPayload } from "@/types/dashboard";
import "./beans-alpacas.css";

type PumpState = NonNullable<DashboardPayload["pumpsAndHoses"]>;

export function PumpsAndHosesPanel({ state, farmId }: {
  state: PumpState | null | undefined;
  farmId: number;
}) {
  if (!state?.enabled) return null;
  const row = state.authoritative && state.vehicleCoverage === "complete"
    ? state.byFarm?.[String(farmId)] : undefined;
  return (
    <section class="fd-overview__dlc" aria-label={tOr("pumpsAndHoses.title", "Pumps N' Hoses")}>
      <div class="fd-overview__dlc-head">
        <h2>{tOr("pumpsAndHoses.title", "Pumps N' Hoses")}</h2>
        <p>{tOr("pumpsAndHoses.description", "Vehicle pump status for the selected farm. These counts do not measure delivered slurry or hose connections.")}</p>
      </div>
      {row ? (
        <div class="fd-overview__dlc-grid">
          <div><h3>{tOr("pumpsAndHoses.owned", "Owned vehicle pumps")}</h3><p>{row.ownedVehiclePumps ?? "—"}</p></div>
          <div><h3>{tOr("pumpsAndHoses.active", "Switched on")}</h3><p>{row.activeVehiclePumps ?? "—"}</p></div>
          <div><h3>{tOr("pumpsAndHoses.circulating", "Circulating")}</h3><p>{row.circulatingVehiclePumps ?? "—"}</p></div>
        </div>
      ) : (
        <p class="fd-overview__dlc-frost">{tOr("pumpsAndHoses.unavailable", "Vehicle pump status is unavailable in this snapshot.")}</p>
      )}
    </section>
  );
}
