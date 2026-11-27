import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.animalPlanner";

type PlannerRow = {
  farmId?: number;
  penId?: string;
  name?: string;
  kind?: string;
  item?: string;
  fillTypeIndex?: number;
  amount?: number;
  enabled?: boolean;
  mode?: number;
  featureEnabled?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<PlannerRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "pens", label: tOr(`${K}.pens`, "Owned pens"), value: formatNumber(farmData.ownedPenCount, 0) },
    { key: "adjustments", label: tOr(`${K}.adjustments`, "Capacity additions"), value: formatNumber(farmData.adjustmentCount, 0) },
    { key: "routes", label: tOr(`${K}.routes`, "Non-store routes"), value: formatNumber(farmData.routeCount, 0) },
  ] : [];
  const fillLabel = (row: PlannerRow) => row.item || tOr(`${K}.fillNumber`, "Fill type #{{number}}", { number: row.fillTypeIndex ?? "—" });
  const setting = (row: PlannerRow) => {
    switch (row.kind) {
      case "animalOffset": return tOr(`${K}.animalCapacity`, "Animal capacity addition");
      case "foodOffset": return tOr(`${K}.foodCapacity`, "Food capacity addition");
      case "sharedOffset": return tOr(`${K}.sharedCapacity`, "Shared storage addition");
      case "fillTypeOffsets": return tOr(`${K}.fillCapacity`, "{{name}} capacity addition", { name: fillLabel(row) });
      case "virtualFillTypeOffsets": return tOr(`${K}.virtualCapacity`, "{{name}} virtual pallet capacity addition", { name: fillLabel(row) });
      case "distributionEnabled": return tOr(`${K}.distributionSwitch`, "Distribution switch");
      case "autoSellEnabled": return tOr(`${K}.autoSellSwitch`, "Automatic sale switch");
      default: return tOr(`${K}.route`, "{{name}} output route", { name: fillLabel(row) });
    }
  };
  const value = (row: PlannerRow) => {
    if (row.kind === "distributionEnabled" || row.kind === "autoSellEnabled") {
      return row.enabled ? tOr(`${K}.on`, "On") : tOr(`${K}.off`, "Off");
    }
    if (row.kind === "route") {
      const modes: Record<number, string> = {
        1: tOr(`${K}.distribute`, "Distribute"),
        2: tOr(`${K}.unload`, "Unload"),
        3: tOr(`${K}.sell`, "Automatic sale"),
      };
      const mode = modes[row.mode ?? -1] || "—";
      return row.featureEnabled === false
        ? tOr(`${K}.routeDisabled`, "{{mode}} (feature switch off)", { mode }) : mode;
    }
    const suffix = row.kind === "animalOffset" ? tOr(`${K}.animals`, "animals") : "L";
    return tOr(`${K}.addition`, "+{{amount}} {{unit}}", { amount: formatNumber(row.amount, 0), unit: suffix });
  };

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Saved capacity additions, logistics switches and output-route choices for pens this farm currently owns. These settings do not prove that animals produced, goods moved or sales occurred.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Animal Planner settings")}>
        <ModTable columns={[
          { key: "pen", label: tOr(`${K}.pen`, "Pen") },
          { key: "setting", label: tOr(`${K}.setting`, "Setting") },
          { key: "value", label: tOr(`${K}.value`, "Saved choice"), align: "end" },
        ]} rows={rows.map((row, index) => ({
          key: `${row.penId || "pen"}-${row.kind}-${row.fillTypeIndex || index}`,
          tone: row.kind === "route" && row.featureEnabled === false ? "warn" as const : undefined,
          cells: {
            pen: row.name || tOr(`${K}.unnamed`, "Unnamed pen"),
            setting: setting(row),
            value: value(row),
          },
        }))} empty={tOr(`${K}.empty`, "No configured capacity addition, feature switch or non-store output route is readable for this farm.")} />
      </Card>
      {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned pen settings is shown.")}</ModEmpty> : null}
      {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "A pen had an ambiguous identity or an unreadable setting and was withheld.")}</ModEmpty> : null}
    </ModPage>
  );
}
