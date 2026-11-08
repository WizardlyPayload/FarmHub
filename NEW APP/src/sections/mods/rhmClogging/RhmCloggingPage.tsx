import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type KnifeRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  knifeSharpnessPercent?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<KnifeRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "vehicles", label: tOr("companionPage.rhmClogging.vehicles", "Forage harvesters with knife readings"), value: formatNumber(farmData.vehicleCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.rhmClogging.lead", "Current knife sharpness for this farm's forage harvesters. A reading does not prove a sharpening action, harvest, crop loss or fuel use.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.rhmClogging.tableTitle", "Owned forage-harvester knives")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.rhmClogging.vehicle", "Forage harvester") },
            { key: "sharpness", label: tOr("companionPage.rhmClogging.sharpness", "Knife sharpness"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              sharpness: num(row.knifeSharpnessPercent) === null ? "—"
                : `${formatNumber(row.knifeSharpnessPercent, 1)}%`,
            },
          }))}
          empty={tOr("companionPage.rhmClogging.empty", "No owned forage harvester has a readable knife condition.")}
        />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr("companionPage.rhmClogging.partial", "Some knife readings were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
