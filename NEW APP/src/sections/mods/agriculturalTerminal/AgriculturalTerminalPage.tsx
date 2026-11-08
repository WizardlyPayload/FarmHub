import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type TerminalRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  number?: number;
  current?: boolean;
  paused?: boolean;
  startingParcel?: number;
  areaHa?: number;
  workHours?: number;
  openHours?: number;
  fuelLiters?: number;
  distanceKm?: number;
  harvestTonnes?: number;
  harvestHa?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<TerminalRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "terminals", label: tOr("companionPage.agriculturalTerminal.vehicles", "Owned vehicles with a terminal"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "records", label: tOr("companionPage.agriculturalTerminal.records", "Records on those vehicles"), value: formatNumber(farmData.recordCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.agriculturalTerminal.lead", "Current and recent work records attached to vehicles this farm owns now. A record may predate purchase, so these are vehicle readings rather than farm totals. Harvest mass is counted from grain entering the tank, not sales or a complete yield ledger.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.agriculturalTerminal.tableTitle", "Terminal work records")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.agriculturalTerminal.vehicle", "Vehicle") },
            { key: "record", label: tOr("companionPage.agriculturalTerminal.record", "Job record") },
            { key: "work", label: tOr("companionPage.agriculturalTerminal.work", "Recorded work") },
            { key: "harvest", label: tOr("companionPage.agriculturalTerminal.harvest", "Tank intake") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.vehicleId || index}:${row.number || index}`,
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              record: [
                `${tOr("companionPage.agriculturalTerminal.job", "Job")} ${formatNumber(row.number, 0)}`,
                row.current
                  ? row.paused
                    ? tOr("companionPage.agriculturalTerminal.paused", "Open · paused")
                    : tOr("companionPage.agriculturalTerminal.open", "Open")
                  : tOr("companionPage.agriculturalTerminal.closed", "Closed"),
                num(row.startingParcel) !== null
                  ? `${tOr("companionPage.agriculturalTerminal.parcel", "Started on parcel")} ${formatNumber(row.startingParcel, 0)}`
                  : "",
              ].filter(Boolean).join(" · "),
              work: [
                `${tOr("companionPage.agriculturalTerminal.area", "Area")} ${formatNumber(row.areaHa, 2)} ha`,
                `${tOr("companionPage.agriculturalTerminal.workTime", "Working")} ${formatNumber(row.workHours, 2)} h`,
                `${tOr("companionPage.agriculturalTerminal.engineTime", "Job engine time")} ${formatNumber(row.openHours, 2)} h`,
                `${tOr("companionPage.agriculturalTerminal.fuel", "Fuel")} ${formatNumber(row.fuelLiters, 2)} L`,
                `${tOr("companionPage.agriculturalTerminal.travel", "Travel")} ${formatNumber(row.distanceKm, 2)} km`,
              ].join(" · "),
              harvest: `${formatNumber(row.harvestTonnes, 2)} t · ${formatNumber(row.harvestHa, 2)} ha`,
            },
          }))}
          empty={tOr("companionPage.agriculturalTerminal.empty", "No Agricultural Terminal work records on this farm's current vehicles.")}
        />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr("companionPage.agriculturalTerminal.partial", "Some vehicle records were unavailable; counts are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
