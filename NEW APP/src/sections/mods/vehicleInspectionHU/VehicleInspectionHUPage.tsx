import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type InspectionRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  className?: string;
  intervalMonths?: number;
  customIntervalMonths?: number;
  remainingMonths?: number;
  decommissioned?: boolean;
};

function status(months: number | undefined): string {
  const remaining = num(months);
  if (remaining === null) return "—";
  if (remaining < 0) return tOr("companionPage.vehicleInspectionHU.overdue", "Overdue by {{months}} months", { months: formatNumber(-remaining, 0) });
  if (remaining === 0) return tOr("companionPage.vehicleInspectionHU.due", "Due now");
  return tOr("companionPage.vehicleInspectionHU.remaining", "{{months}} months left", { months: formatNumber(remaining, 0) });
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<InspectionRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "registered", label: tOr("companionPage.vehicleInspectionHU.registered", "In register"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "due", label: tOr("companionPage.vehicleInspectionHU.dueCount", "Due now"), value: formatNumber(farmData.dueCount, 0) },
    { key: "overdue", label: tOr("companionPage.vehicleInspectionHU.overdueCount", "Overdue"), value: formatNumber(farmData.overdueCount, 0) },
    { key: "decommissioned", label: tOr("companionPage.vehicleInspectionHU.decommissionedCount", "Decommissioned"), value: formatNumber(farmData.decommissionedCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.vehicleInspectionHU.lead", "See inspection deadlines for your currently owned vehicles. Inspections and interval changes happen in the game.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.vehicleInspectionHU.tableTitle", "Vehicle inspection register")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.vehicleInspectionHU.vehicle", "Vehicle") },
            { key: "class", label: tOr("companionPage.vehicleInspectionHU.class", "Class") },
            { key: "interval", label: tOr("companionPage.vehicleInspectionHU.interval", "Interval"), align: "end" },
            { key: "status", label: tOr("companionPage.vehicleInspectionHU.status", "Status"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            tone: num(row.remainingMonths) !== null && num(row.remainingMonths)! <= 0 ? "warn" as const : undefined,
            cells: {
              vehicle: row.vehicle || "—",
              class: row.className || "—",
              interval: tOr("companionPage.vehicleInspectionHU.months", "{{months}} months", { months: formatNumber(row.customIntervalMonths ?? row.intervalMonths, 0) }),
              status: row.decommissioned ? `${status(row.remainingMonths)} · ${tOr("companionPage.vehicleInspectionHU.decommissioned", "Decommissioned")}` : status(row.remainingMonths),
            },
          }))}
          empty={tOr("companionPage.vehicleInspectionHU.empty", "No inspection records for this farm's current vehicles yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.vehicleInspectionHU.truncated", "Only the first registered vehicles are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
