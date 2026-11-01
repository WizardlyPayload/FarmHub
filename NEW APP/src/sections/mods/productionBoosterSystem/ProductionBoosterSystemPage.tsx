import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type OutputRow = {
  farmId?: number;
  point?: string;
  recipe?: string;
  output?: string;
  baseLitres?: number;
  actualLitres?: number;
  bonusLitres?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<OutputRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "lines", label: tOr("companionPage.productionBoosterSystem.lines", "Lines with recorded output"), value: formatNumber(farmData.activeLineCount, 0) },
    { key: "outputs", label: tOr("companionPage.productionBoosterSystem.outputs", "Output types listed"), value: formatNumber(farmData.outputCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.productionBoosterSystem.lead", "Cumulative output recorded by Production Booster System for this farm's production lines. Extra output is the mod's tracked difference from its base amount. These figures do not record sales, delivery or profit.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.productionBoosterSystem.tableTitle", "Recorded production output")}>
        <ModTable
          columns={[
            { key: "point", label: tOr("companionPage.productionBoosterSystem.point", "Production") },
            { key: "recipe", label: tOr("companionPage.productionBoosterSystem.recipe", "Line") },
            { key: "output", label: tOr("companionPage.productionBoosterSystem.output", "Output") },
            { key: "base", label: tOr("companionPage.productionBoosterSystem.base", "Base tracked (L)"), align: "end" },
            { key: "actual", label: tOr("companionPage.productionBoosterSystem.actual", "Actual tracked (L)"), align: "end" },
            { key: "bonus", label: tOr("companionPage.productionBoosterSystem.bonus", "Extra tracked (L)"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.point ?? "point"}-${row.recipe ?? "line"}-${row.output ?? index}`,
            tone: num(row.bonusLitres) != null && num(row.bonusLitres)! > 0 ? "ok" as const : undefined,
            cells: {
              point: row.point || "—",
              recipe: row.recipe || "—",
              output: row.output || "—",
              base: formatNumber(row.baseLitres, 2),
              actual: formatNumber(row.actualLitres, 2),
              bonus: formatNumber(row.bonusLitres, 2),
            },
          }))}
          empty={tOr("companionPage.productionBoosterSystem.empty", "No recorded output is readable for this farm yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.productionBoosterSystem.truncated", "Only part of the production output history is listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.productionBoosterSystem.partial", "Some production output statistics could not be read.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
