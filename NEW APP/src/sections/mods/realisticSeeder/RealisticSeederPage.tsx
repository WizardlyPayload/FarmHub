import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type SeederRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  unloadMode?: number;
  fillUnitNumber?: number;
  unloadingLeft?: boolean;
  fertilizerAllowed?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<SeederRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "seeders", label: tOr("companionPage.realisticSeeder.seeders", "Owned supported seeders"), value: formatNumber(farmData.seederCount, 0) },
    { key: "changed", label: tOr("companionPage.realisticSeeder.changed", "With nondefault choices"), value: formatNumber(farmData.nondefaultCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.realisticSeeder.lead", "Current Realistic Seeder options on machines owned by this farm. These choices do not prove seed or fertilizer application, field work or output.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.realisticSeeder.tableTitle", "Seeder setup")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.realisticSeeder.vehicle", "Machine") },
            { key: "mode", label: tOr("companionPage.realisticSeeder.mode", "Unload mode") },
            { key: "unit", label: tOr("companionPage.realisticSeeder.unit", "Selected fill unit") },
            { key: "side", label: tOr("companionPage.realisticSeeder.side", "Unload side") },
            { key: "fertilizer", label: tOr("companionPage.realisticSeeder.fertilizer", "Fertilizer mode") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              mode: row.unloadMode === 1
                ? tOr("companionPage.realisticSeeder.pallets", "Pallets")
                : row.unloadMode === 2 ? tOr("companionPage.realisticSeeder.bigBags", "Big bags") : "—",
              unit: typeof row.fillUnitNumber === "number" ? String(row.fillUnitNumber) : "—",
              side: row.unloadingLeft === true
                ? tOr("companionPage.realisticSeeder.left", "Left")
                : row.unloadingLeft === false ? tOr("companionPage.realisticSeeder.right", "Right") : "—",
              fertilizer: row.fertilizerAllowed === true
                ? tOr("companionPage.realisticSeeder.enabled", "Enabled")
                : row.fertilizerAllowed === false ? tOr("companionPage.realisticSeeder.disabled", "Disabled") : "—",
            },
          }))}
          empty={tOr("companionPage.realisticSeeder.empty", "No owned machine has an active Realistic Seeder setup reading.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.realisticSeeder.truncated", "Only the first owned seeders are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
