import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.sowingMachineRollerReady";

type SeederRow = { farmId?: number; vehicleId?: string; vehicle?: string; rollerOn?: boolean };

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<SeederRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "eligible", label: tOr(`${K}.eligible`, "Eligible owned seeders"), value: formatNumber(farmData.eligibleCount, 0) },
    { key: "enabled", label: tOr(`${K}.enabled`, "Roller switched on"), value: formatNumber(farmData.enabledCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Current roller switch on eligible seeders owned by this farm. A switch set to On does not prove any field was rolled or yield gained.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Owned seeder roller settings")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr(`${K}.vehicle`, "Seeder") },
            { key: "roller", label: tOr(`${K}.roller`, "Roller switch") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              roller: row.rollerOn === true ? tOr(`${K}.on`, "On") : tOr(`${K}.off`, "Off"),
            },
          }))}
          empty={tOr(`${K}.empty`, "No eligible owned seeder has a readable roller switch.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only the first eligible owned seeders are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Some eligible seeders had an unreadable roller switch.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
