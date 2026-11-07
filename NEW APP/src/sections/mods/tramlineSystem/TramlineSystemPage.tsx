import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.tramlineSystem";
type SeederRow = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  mode?: number; createTramLines?: boolean; currentLane?: number;
  passSequence?: number; tramlineDistance?: number; sprayerProfileWidth?: number;
  sessionHectares?: number; totalHectares?: number;
};

function mode(value: number | undefined): string {
  return value === 0 ? tOr(`${K}.manual`, "Manual")
    : value === 1 ? tOr(`${K}.semi`, "Semi-auto")
    : value === 2 ? tOr(`${K}.auto`, "Auto") : "—";
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<SeederRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "seeders", label: tOr(`${K}.seeders`, "Owned Tramline System seeders"), value: formatNumber(farmData.seederCount, 0) },
    { key: "enabled", label: tOr(`${K}.enabledCount`, "Tramlines enabled"), value: formatNumber(farmData.tramlinesEnabledCount, 0) },
    { key: "worked", label: tOr(`${K}.recordedAreaCount`, "Seeders with recorded area"), value: formatNumber(farmData.recordedAreaCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Saved tramline settings and this mod's recorded sowing hectares on owned seeders. A lane setting does not prove a tramline was made or a field job finished.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Owned seeder tramline state")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr(`${K}.vehicle`, "Seeder") },
            { key: "mode", label: tOr(`${K}.mode`, "Mode") },
            { key: "enabled", label: tOr(`${K}.enabled`, "Create tramlines") },
            { key: "lane", label: tOr(`${K}.lane`, "Current lane") },
            { key: "passes", label: tOr(`${K}.passes`, "Pass sequence") },
            { key: "distance", label: tOr(`${K}.distance`, "Tramline distance") },
            { key: "session", label: tOr(`${K}.session`, "Session area") },
            { key: "total", label: tOr(`${K}.total`, "Total area") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              mode: mode(row.mode),
              enabled: row.createTramLines == null ? "—"
                : row.createTramLines ? tOr(`${K}.yes`, "Yes") : tOr(`${K}.no`, "No"),
              lane: formatNumber(row.currentLane, 0),
              passes: formatNumber(row.passSequence, 0),
              distance: num(row.tramlineDistance) == null ? "—" : `${formatNumber(row.tramlineDistance, 1)} m`,
              session: num(row.sessionHectares) == null ? "—" : `${formatNumber(row.sessionHectares, 2)} ha`,
              total: num(row.totalHectares) == null ? "—" : `${formatNumber(row.totalHectares, 2)} ha`,
            },
          }))}
          empty={tOr(`${K}.empty`, "No owned seeder has a readable Tramline System state.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only the first owned seeders are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some settings or counters were unavailable.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
