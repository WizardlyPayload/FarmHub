import { tOr } from "@/i18n/i18n";
import type { DashboardPayload } from "@/types/dashboard";
import "./beans-alpacas.css";

type EmergencyState = NonNullable<DashboardPayload["emergencyPack"]>;

const statusLabels: Record<string, string> = {
  none: "No incident",
  pending: "Incident pending",
  starting: "Incident starting",
  running: "Incident in progress",
  closing: "Incident ending",
  aborting: "Incident being cancelled",
};

const typeLabels: Record<string, string> = {
  fire: "Fire",
  tree: "Fallen tree",
  oilSpill: "Oil spill",
};

export function EmergencyPackPanel({ state, farmId }: {
  state: EmergencyState | null | undefined;
  farmId: number;
}) {
  if (!state?.enabled) return null;
  const incident = state.authoritative && state.farmId === farmId ? state.incident : undefined;
  const status = incident?.status && statusLabels[incident.status];
  const type = incident?.type && typeLabels[incident.type];
  return (
    <section class="fd-overview__dlc" aria-label={tOr("emergencyPack.title", "Emergency Pack")}>
      <div class="fd-overview__dlc-head">
        <h2>{tOr("emergencyPack.title", "Emergency Pack")}</h2>
        <p>{tOr("emergencyPack.description", "Current incident state for the selected farm.")}</p>
      </div>
      <p class="fd-overview__dlc-frost">{status
        ? `${type ? `${type}: ` : ""}${status}`
        : tOr("emergencyPack.unavailable", "Incident status is unavailable in this snapshot.")}</p>
    </section>
  );
}
