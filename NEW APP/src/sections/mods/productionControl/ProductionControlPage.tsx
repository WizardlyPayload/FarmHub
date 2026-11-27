import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty,
  ModPage,
  ModStatTiles,
  ModTable,
  asList,
  formatNumber,
  num,
  useCompanionPage,
  useMoney,
  type CompanionPageProps,
  type ModStatTile,
} from "@/sections/mods/shared";

type Line = {
  farmId?: number;
  point?: string;
  recipe?: string;
  productivityPercent?: number;
  baseCyclesPerMonth?: number;
  cyclesPerMonth?: number;
  baseCostPerMonth?: number;
  costPerMonth?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const lines = asList<Line>(page?.lines).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "lines", label: tOr("companionPage.productionControl.lines", "Production lines"), value: formatNumber(farmData.lineCount, 0) },
    { key: "changed", label: tOr("companionPage.productionControl.changed", "Speed changed"), value: formatNumber(farmData.changedCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.productionControl.lead", "See the speed selected in game for each of your production lines and its resulting cycles and operating cost. Change the speed in the game.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.productionControl.tableTitle", "Production line speeds")}>
        <ModTable
          columns={[
            { key: "point", label: tOr("companionPage.productionControl.point", "Production") },
            { key: "recipe", label: tOr("companionPage.productionControl.recipe", "Line") },
            { key: "speed", label: tOr("companionPage.productionControl.speed", "Speed"), align: "end" },
            { key: "cycles", label: tOr("companionPage.productionControl.cycles", "Cycles / month"), align: "end" },
            { key: "cost", label: tOr("companionPage.productionControl.cost", "Operating cost / active month"), align: "end" },
          ]}
          rows={lines.map((line, index) => ({
            key: `${line.point ?? "point"}-${line.recipe ?? index}`,
            tone: line.productivityPercent !== 100 ? "ok" as const : undefined,
            cells: {
              point: line.point || "—",
              recipe: line.recipe || "—",
              speed: tOr("companionPage.productionControl.percent", "{{value}}%", { value: formatNumber(line.productivityPercent, 0) }),
              cycles: tOr("companionPage.productionControl.fromTo", "{{before}} → {{after}}", {
                before: formatNumber(line.baseCyclesPerMonth, 2), after: formatNumber(line.cyclesPerMonth, 2),
              }),
              cost: tOr("companionPage.productionControl.fromTo", "{{before}} → {{after}}", {
                before: money(line.baseCostPerMonth), after: money(line.costPerMonth),
              }),
            },
          }))}
          empty={tOr("companionPage.productionControl.empty", "No readable production lines for this farm yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.productionControl.truncated", "Only the first production lines are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
