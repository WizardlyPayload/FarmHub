import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModAbout,
  ModEmpty,
  ModPage,
  ModStatTiles,
  ModTable,
  asList,
  formatNumber,
  num,
  useCompanionPage,
  useMoney,
  yesNo,
  type CompanionPageProps,
  type ModStatTile,
} from "@/sections/mods/shared";

type IoRow = {
  fillType?: string;
  title?: string;
  litersPerMonth?: number;
  pricePer1000?: number;
  priceSource?: "purchase" | "peak";
  value?: number;
};

type LineRow = {
  farmId?: number;
  point?: string;
  recipe?: string;
  running?: boolean;
  cyclesPerMonth?: number;
  upkeepPerMonth?: number;
  inputCost?: number;
  outputValue?: number;
  profit?: number | null;
  inputs?: IoRow[];
  outputs?: IoRow[];
};

type OverrideRow = {
  factory?: string;
  line?: string;
  originalCyclesPerHour?: number;
  cyclesPerHour?: number;
  inputs?: number;
  outputs?: number;
  capacities?: number;
};

const DETAIL_LINES = 12;

function profitTone(value: unknown): "ok" | "danger" | undefined {
  const n = num(value);
  if (n == null) return undefined;
  return n > 0 ? "ok" : n < 0 ? "danger" : undefined;
}

function IoTable({ rows, money, kind }: { rows: IoRow[]; money: (n: unknown) => string; kind: "input" | "output" }) {
  return (
    <ModTable
      columns={[
        {
          key: "fill",
          label:
            kind === "input"
              ? tOr("companionPage.factoryProfitCalculator.colInput", "Input")
              : tOr("companionPage.factoryProfitCalculator.colOutput", "Output"),
        },
        { key: "liters", label: tOr("companionPage.factoryProfitCalculator.colLitersMonth", "Per month"), align: "end" },
        { key: "price", label: tOr("companionPage.factoryProfitCalculator.colPrice", "Price / 1000 L"), align: "end" },
        { key: "value", label: tOr("companionPage.factoryProfitCalculator.colValue", "Value"), align: "end" },
      ]}
      rows={rows.map((row, i) => ({
        key: `${kind}-${row.fillType ?? i}`,
        cells: {
          fill: row.title || row.fillType || "—",
          liters: tOr("companionPage.factoryProfitCalculator.liters", "{{value}} L", { value: formatNumber(row.litersPerMonth, 0) }),
          price:
            num(row.pricePer1000) == null
              ? tOr("companionPage.factoryProfitCalculator.noPrice", "No price")
              : row.priceSource === "peak"
                ? tOr("companionPage.factoryProfitCalculator.pricePeak", "{{price}} (peak price)", { price: money(row.pricePer1000) })
                : tOr("companionPage.factoryProfitCalculator.pricePurchase", "{{price}} (cheapest to buy)", { price: money(row.pricePer1000) }),
          value: money(row.value),
        },
      }))}
    />
  );
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const lines = asList<LineRow>(page?.lines).filter((l) => num(l.farmId) === farmId);
  const overrides = asList<OverrideRow>(page?.overrides);
  const tiles: ModStatTile[] = farmData
    ? [
        {
          key: "lines",
          label: tOr("companionPage.factoryProfitCalculator.statLines", "Production lines"),
          value: formatNumber(farmData.lineCount, 0),
          hint: tOr("companionPage.factoryProfitCalculator.statRunningHint", "{{count}} running", { count: formatNumber(farmData.runningCount, 0) }),
        },
        {
          key: "runningProfit",
          label: tOr("companionPage.factoryProfitCalculator.statRunningProfit", "Running lines, per month"),
          value: money(farmData.runningProfit),
          tone: profitTone(farmData.runningProfit),
        },
        {
          key: "totalProfit",
          label: tOr("companionPage.factoryProfitCalculator.statTotalProfit", "If every line ran, per month"),
          value: money(farmData.totalProfit),
          tone: profitTone(farmData.totalProfit),
        },
        { key: "upkeep", label: tOr("companionPage.factoryProfitCalculator.statUpkeep", "Upkeep per month"), value: money(farmData.totalUpkeep) },
        {
          key: "profitable",
          label: tOr("companionPage.factoryProfitCalculator.statProfitable", "Profitable lines"),
          value: formatNumber(farmData.profitableCount, 0),
          hint: tOr("companionPage.factoryProfitCalculator.statLossHint", "{{count}} losing money", { count: formatNumber(farmData.lossCount, 0) }),
          tone: (num(farmData.lossCount) ?? 0) > 0 ? "warn" : undefined,
        },
        {
          key: "best",
          label: tOr("companionPage.factoryProfitCalculator.statBest", "Best line"),
          value: typeof farmData.bestLine === "string" ? farmData.bestLine : "—",
          hint:
            typeof farmData.worstLine === "string"
              ? tOr("companionPage.factoryProfitCalculator.statWorstHint", "Worst: {{line}}", { line: farmData.worstLine })
              : null,
        },
      ]
    : [];

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.factoryProfitCalculator.lead",
        "Factory Profit Calculator works out what each production line earns in a month: output value minus input cost and upkeep. This page shows the same projection for your farm's lines.",
      )}
    >
      <ModStatTiles tiles={tiles} />
      {page ? (
        <p class="fd-economy__muted">
          {tOr(
            "companionPage.factoryProfitCalculator.basisNote",
            "Like the mod, a month assumes the line runs all 24 hours of every day. Inputs are priced at the cheapest place to buy them (or their peak price when nowhere sells them) and outputs at their peak sale price, per 1000 L.",
          )}
        </p>
      ) : null}
      <Card title={tOr("companionPage.factoryProfitCalculator.linesTitle", "Monthly profit by line")}>
        <ModTable
          columns={[
            { key: "recipe", label: tOr("companionPage.factoryProfitCalculator.colRecipe", "Line") },
            { key: "point", label: tOr("companionPage.factoryProfitCalculator.colPoint", "Production") },
            { key: "running", label: tOr("companionPage.factoryProfitCalculator.colRunning", "Running"), align: "center" },
            { key: "cycles", label: tOr("companionPage.factoryProfitCalculator.colCycles", "Cycles / month"), align: "end" },
            { key: "cost", label: tOr("companionPage.factoryProfitCalculator.colInputCost", "Input cost"), align: "end" },
            { key: "value", label: tOr("companionPage.factoryProfitCalculator.colOutputValue", "Output value"), align: "end" },
            { key: "upkeep", label: tOr("companionPage.factoryProfitCalculator.colUpkeep", "Upkeep"), align: "end" },
            { key: "profit", label: tOr("companionPage.factoryProfitCalculator.colProfit", "Profit"), align: "end" },
          ]}
          rows={lines.map((line, i) => ({
            key: `${line.point ?? "p"}-${line.recipe ?? i}-${i}`,
            tone: profitTone(line.profit),
            cells: {
              recipe: line.recipe || "—",
              point: line.point || "—",
              running: yesNo(line.running),
              cycles: formatNumber(line.cyclesPerMonth, 0),
              cost: money(line.inputCost),
              value: money(line.outputValue),
              upkeep: money(line.upkeepPerMonth),
              profit: num(line.profit) == null ? tOr("companionPage.factoryProfitCalculator.unpriced", "Missing price") : money(line.profit),
            },
          }))}
          empty={
            page
              ? tOr("companionPage.factoryProfitCalculator.noLines", "No production lines owned by this farm.")
              : tOr("companionPage.factoryProfitCalculator.waitingLines", "Production lines appear after the next export.")
          }
        />
        {page?.coverage === "truncated" ? (
          <ModEmpty>{tOr("companionPage.factoryProfitCalculator.truncated", "Only the first production lines are listed.")}</ModEmpty>
        ) : null}
      </Card>
      {lines.length > 0 ? (
        <div class="fd-mod-page__grid">
          {lines.slice(0, DETAIL_LINES).map((line, i) => (
            <Card
              key={`${line.point ?? "p"}-${line.recipe ?? i}-${i}`}
              title={tOr("companionPage.factoryProfitCalculator.detailTitle", "{{recipe}} · {{point}}", {
                recipe: line.recipe || "—",
                point: line.point || "—",
              })}
            >
              <IoTable rows={asList<IoRow>(line.inputs)} money={money} kind="input" />
              <IoTable rows={asList<IoRow>(line.outputs)} money={money} kind="output" />
            </Card>
          ))}
        </div>
      ) : null}
      {overrides.length > 0 ? (
        <Card title={tOr("companionPage.factoryProfitCalculator.overridesTitle", "Admin overrides")}>
          <p class="fd-economy__muted">
            {tOr("companionPage.factoryProfitCalculator.overridesNote", "Lines whose speed or recipe was changed in the mod's admin screen.")}
          </p>
          <ModTable
            columns={[
              { key: "factory", label: tOr("companionPage.factoryProfitCalculator.colFactory", "Factory") },
              { key: "line", label: tOr("companionPage.factoryProfitCalculator.colRecipe", "Line") },
              { key: "cycles", label: tOr("companionPage.factoryProfitCalculator.colCyclesHour", "Cycles / hour"), align: "end" },
              { key: "changes", label: tOr("companionPage.factoryProfitCalculator.colChanges", "Changed inputs / outputs / storage"), align: "end" },
            ]}
            rows={overrides.map((row, i) => ({
              key: `${row.factory ?? "f"}-${row.line ?? i}-${i}`,
              cells: {
                factory: row.factory || "—",
                line: row.line || "—",
                cycles: tOr("companionPage.factoryProfitCalculator.cyclesChange", "{{from}} → {{to}}", {
                  from: formatNumber(row.originalCyclesPerHour, 2),
                  to: formatNumber(row.cyclesPerHour, 2),
                }),
                changes: `${formatNumber(row.inputs, 0)} / ${formatNumber(row.outputs, 0)} / ${formatNumber(row.capacities, 0)}`,
              },
            }))}
          />
        </Card>
      ) : null}
      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.factoryProfitCalculator.look1", "Open the calculator in game to see its monthly figures for each production."),
          tOr("companionPage.factoryProfitCalculator.look2", "Admins can change a line's speed and recipe amounts; those changes are listed above."),
          tOr("companionPage.factoryProfitCalculator.look3", "A line marked Missing price uses a fill type with no buying or sale price, so its profit is left blank."),
        ]}
      />
    </ModPage>
  );
}
