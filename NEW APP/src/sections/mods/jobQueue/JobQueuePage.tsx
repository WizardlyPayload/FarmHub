import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type QueueRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  position?: number;
  current?: boolean;
  jobType?: "FIELDWORK" | "GOTO";
  fieldId?: number;
  x?: number;
  z?: number;
  running?: boolean;
  waitReason?: "REFILL" | "BLOCKED";
};

function target(row: QueueRow): string {
  if (num(row.fieldId) !== null) {
    return `${tOr("companionPage.jobQueue.field", "Field")} ${formatNumber(row.fieldId, 0)}`;
  }
  return `${tOr("companionPage.jobQueue.position", "Map position")} ${formatNumber(row.x, 0)}, ${formatNumber(row.z, 0)}`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<QueueRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "vehicles", label: tOr("companionPage.jobQueue.vehicles", "Vehicles with queue state"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "entries", label: tOr("companionPage.jobQueue.entries", "Unfinished entries"), value: formatNumber(farmData.entryCount, 0) },
    { key: "armed", label: tOr("companionPage.jobQueue.armed", "Queues marked running"), value: formatNumber(farmData.armedCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.jobQueue.lead", "The saved plan for vehicles currently owned by this farm. Targets and the running flag do not prove a helper is working, a field is still owned, or a job has finished.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.jobQueue.tableTitle", "Vehicle job plans")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.jobQueue.vehicle", "Vehicle") },
            { key: "order", label: tOr("companionPage.jobQueue.order", "Order") },
            { key: "job", label: tOr("companionPage.jobQueue.job", "Planned job") },
            { key: "target", label: tOr("companionPage.jobQueue.target", "Saved target") },
            { key: "state", label: tOr("companionPage.jobQueue.state", "Queue state") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.vehicleId || index}:${row.position || index}`,
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              order: row.current
                ? tOr("companionPage.jobQueue.current", "Current entry")
                : formatNumber(row.position, 0),
              job: row.jobType === "FIELDWORK"
                ? tOr("companionPage.jobQueue.fieldwork", "Field work")
                : tOr("companionPage.jobQueue.goto", "Drive to"),
              target: target(row),
              state: [
                row.running
                  ? tOr("companionPage.jobQueue.running", "Marked running")
                  : tOr("companionPage.jobQueue.paused", "Not running"),
                row.waitReason === "REFILL"
                  ? tOr("companionPage.jobQueue.refill", "Waiting for refill")
                  : row.waitReason === "BLOCKED"
                    ? tOr("companionPage.jobQueue.blocked", "Waiting after obstruction")
                    : "",
              ].filter(Boolean).join(" · "),
            },
          }))}
          empty={tOr("companionPage.jobQueue.empty", "No unfinished Job Queue entries on this farm's vehicles.")}
        />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr("companionPage.jobQueue.partial", "Some queue entries were unavailable; farm totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
