import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.upgradableFactories";
type Row = {
  farmId?: number; placeableId?: string; production?: string;
  level?: number; maxLevel?: number; configuredMultiplier?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "factories", label: tOr(`${K}.factories`, "Owned factories"), value: formatNumber(farmData.productionCount, 0) },
    { key: "upgraded", label: tOr(`${K}.upgraded`, "Factories above level 0"), value: formatNumber(farmData.upgradedCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current upgrade levels for this farm's production points. The multiplier is this mod's configured factor; it does not prove actual throughput or output.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Factory upgrades")}>
        <ModTable columns={[
          { key: "production", label: tOr(`${K}.production`, "Production") },
          { key: "level", label: tOr(`${K}.level`, "Current level"), align: "end" },
          { key: "max", label: tOr(`${K}.max`, "Maximum level"), align: "end" },
          { key: "multiplier", label: tOr(`${K}.multiplier`, "Configured multiplier"), align: "end" },
        ]} rows={rows.map((row, index) => ({
          key: `${row.placeableId || index}`,
          cells: {
            production: row.production || "—",
            level: formatNumber(row.level, 0),
            max: formatNumber(row.maxLevel, 0),
            multiplier: row.configuredMultiplier == null ? "—" : `×${formatNumber(row.configuredMultiplier, 2)}`,
          },
        }))} empty={tOr(`${K}.empty`, "No readable owned factory upgrade levels are available.")} />
        <ModEmpty>{tOr(`${K}.note`, "Other mods may also change effective production rates and costs. These levels are not a record of purchases, completed output or realized profit.")}</ModEmpty>
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned factory list is shown; totals are withheld.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "A factory had ambiguous ownership, identity or level and was withheld; totals are withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
