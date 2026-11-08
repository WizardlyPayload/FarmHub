import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type ServiceRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  operatingHours?: number;
  lastServiceHours?: number;
  sinceServiceHours?: number;
  serviceRecorded?: boolean;
};

function hours(value: number | undefined): string {
  const n = num(value);
  return n === null ? "—" : tOr("companionPage.majorService.hours", "{{hours}} h", { hours: formatNumber(n, 1) });
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<ServiceRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "vehicles", label: tOr("companionPage.majorService.vehicles", "Vehicles with service data"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "recorded", label: tOr("companionPage.majorService.recorded", "Service timestamp recorded"), value: formatNumber(farmData.recordedCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.majorService.lead", "Operating hours since each vehicle's last recorded major service. A timestamp does not show what was charged or repaired.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.majorService.tableTitle", "Current vehicle service readings")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.majorService.vehicle", "Vehicle") },
            { key: "operating", label: tOr("companionPage.majorService.operating", "Operating time"), align: "end" },
            { key: "last", label: tOr("companionPage.majorService.last", "Last major service at"), align: "end" },
            { key: "since", label: tOr("companionPage.majorService.since", "Hours since service"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              operating: hours(row.operatingHours),
              last: row.serviceRecorded ? hours(row.lastServiceHours) : tOr("companionPage.majorService.notRecorded", "Not recorded"),
              since: row.serviceRecorded ? hours(row.sinceServiceHours) : "—",
            },
          }))}
          empty={tOr("companionPage.majorService.empty", "No current owned vehicle has a Major Service reading yet.")}
        />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr("companionPage.majorService.partial", "Some vehicle service readings were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
