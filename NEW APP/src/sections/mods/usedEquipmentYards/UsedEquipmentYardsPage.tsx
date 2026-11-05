import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type YardCreditRow = { farmId?: number; yardId?: number; yard?: string; credit?: number };

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<YardCreditRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "yards", label: tOr("companionPage.usedEquipmentYards.yards", "Yards with credit"),
      value: formatNumber(farmData.creditedYards, 0) },
    { key: "credit", label: tOr("companionPage.usedEquipmentYards.total", "Available yard credit"),
      value: money(farmData.totalCredit) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.usedEquipmentYards.lead", "Credit your farm has earned at used equipment yards and can spend there. Yard stock is a market listing, not equipment owned by your farm.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.usedEquipmentYards.tableTitle", "Farm credit by yard")}>
        <ModTable
          columns={[
            { key: "yard", label: tOr("companionPage.usedEquipmentYards.yard", "Yard") },
            { key: "credit", label: tOr("companionPage.usedEquipmentYards.credit", "Available credit"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.yardId ?? index}-${index}`,
            cells: { yard: row.yard || `#${formatNumber(row.yardId, 0)}`, credit: money(row.credit) },
          }))}
          empty={tOr("companionPage.usedEquipmentYards.empty", "This farm has no credit at a current used equipment yard.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.usedEquipmentYards.truncated", "Only some yards were read; the total is withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
