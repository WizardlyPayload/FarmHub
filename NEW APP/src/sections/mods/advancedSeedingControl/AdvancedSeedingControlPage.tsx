import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.advancedSeedingControl";
type SeederRow = {
  farmId?: number; vehicleId?: string; vehicle?: string; mode?: number;
  followUpWidth?: number; trackWidth?: number; currentLane?: number;
  fertilizerEnabled?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<SeederRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const mode = (value: number | undefined) => value === 0 ? tOr(`${K}.modeOff`, "Off")
    : value === 1 ? tOr(`${K}.modeAuto`, "Auto")
    : value === 2 ? tOr(`${K}.modeManual`, "Manual") : "—";
  const tiles: ModStatTile[] = farmData ? [
    { key: "seeders", label: tOr(`${K}.seeders`, "Owned ASC seeders"), value: formatNumber(farmData.seederCount, 0) },
    { key: "active", label: tOr(`${K}.active`, "Mode enabled"), value: formatNumber(farmData.modeOnCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Current tramline choices on seeders owned by this farm. These settings do not prove a pass was completed or a tramline was made in a field.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Owned seeder settings")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr(`${K}.vehicle`, "Seeder") },
            { key: "mode", label: tOr(`${K}.mode`, "Mode") },
            { key: "lane", label: tOr(`${K}.lane`, "Current lane") },
            { key: "follow", label: tOr(`${K}.follow`, "Follow-up width (m)") },
            { key: "track", label: tOr(`${K}.track`, "Track width (m)") },
            { key: "fertilizer", label: tOr(`${K}.fertilizer`, "Starter fertilizer") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              mode: mode(row.mode),
              lane: formatNumber(row.currentLane, 0),
              follow: formatNumber(row.followUpWidth, 1),
              track: formatNumber(row.trackWidth, 2),
              fertilizer: row.fertilizerEnabled === true ? tOr(`${K}.on`, "On") : tOr(`${K}.off`, "Off"),
            },
          }))}
          empty={tOr(`${K}.empty`, "No owned seeder has a readable Advanced Seeding Control state.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only the first owned seeders are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some owned seeder settings could not be read.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
