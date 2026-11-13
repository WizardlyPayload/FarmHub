import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.automaticTramlineSystem";
type SeederRow = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  mode?: string; currentPass?: number; passSequence?: number;
  totalHectares?: number; sessionHectares?: number;
};

function hectares(value: unknown): string {
  return num(value) == null ? "—" : `${formatNumber(value, 2)} ha`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<SeederRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const complete = page?.coverage === "complete" && farmData;
  const tiles: ModStatTile[] = complete ? [
    { key: "seeders", label: tOr(`${K}.seeders`, "Owned compatible seeders"), value: formatNumber(farmData.seederCount, 0) },
    { key: "recorded", label: tOr(`${K}.recorded`, "Seeders with recorded area"), value: formatNumber(farmData.recordedSeederCount, 0) },
    { key: "session", label: tOr(`${K}.sessionTotal`, "Session sowing area"), value: hectares(farmData.sessionHectares) },
    { key: "total", label: tOr(`${K}.lifetimeTotal`, "Recorded sowing area"), value: hectares(farmData.totalHectares) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "This mod's current mode and recorded sowing area on your owned seeders. Area is recorded per machine, not per field; it does not prove that a tramline was cut or a job was completed.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Owned seeder tramline records")}>
        <ModTable columns={[
          { key: "seeder", label: tOr(`${K}.seeder`, "Seeder") },
          { key: "mode", label: tOr(`${K}.mode`, "Mode") },
          { key: "pass", label: tOr(`${K}.pass`, "Current pass") },
          { key: "session", label: tOr(`${K}.session`, "Session area") },
          { key: "total", label: tOr(`${K}.total`, "Recorded area") },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: {
            seeder: row.vehicle || row.vehicleId || "—",
            mode: row.mode || "—",
            pass: num(row.currentPass) == null || num(row.passSequence) == null
              ? "—" : `${formatNumber(row.currentPass, 0)} / ${formatNumber(row.passSequence, 0)}`,
            session: hectares(row.sessionHectares),
            total: hectares(row.totalHectares),
          },
        }))} empty={tOr(`${K}.empty`, "No owned compatible seeder has a readable record.")} />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some seeder records were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
