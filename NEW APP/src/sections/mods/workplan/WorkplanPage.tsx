import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.workplan";
type PlanRow = {
  farmId?: number; fieldId?: number; currentCrop?: string; currentCropIndex?: number;
  plannedCrop?: string; plannedCropIndex?: number;
  tasks?: Record<string, number>;
  fertilizer1Type?: number; fertilizer2Type?: number;
};

const TASKS: [string, string][] = [
  ["lime", "Lime"], ["mulching", "Mulch"], ["plow", "Plow"],
  ["roller", "Roll"], ["fertilizer1", "Fertilise 1"],
  ["fertilizer2", "Fertilise 2"], ["weedGrooming", "Weed groom"],
  ["weedSpray", "Weed spray"], ["stone", "Stones"],
];
const FERTILIZER_TYPES: Record<number, string> = {
  1: "Artificial", 2: "Liquid", 3: "Sowing fertiliser", 4: "Manure",
  5: "Liquid manure", 6: "Digestate", 7: "Intercrop",
};

function taskName(row: PlanRow, key: string, fallback: string): string {
  const base = tOr(`${K}.${key}`, fallback);
  const type = key === "fertilizer1" ? num(row.fertilizer1Type)
    : key === "fertilizer2" ? num(row.fertilizer2Type) : null;
  return type != null && FERTILIZER_TYPES[type] ? `${base} (${FERTILIZER_TYPES[type]})` : base;
}

function taskList(row: PlanRow, states: number[]): string {
  const parts = TASKS.flatMap(([key, fallback]) => {
    const state = num(row.tasks?.[key]);
    if (state == null || !states.includes(state)) return [];
    const name = taskName(row, key, fallback);
    if (state === 2) return [`${name}: ${tOr(`${K}.notRequired`, "not required")}`];
    if (state === 4) return [`${name}: ${tOr(`${K}.yes`, "yes")}`];
    if (state === 5) return [`${name}: ${tOr(`${K}.no`, "no")}`];
    return [name];
  });
  return parts.length ? parts.join(", ") : "—";
}

function crop(name: string | undefined, index: number | undefined): string {
  return name || (num(index) == null ? "—" : `#${formatNumber(index, 0)}`);
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<PlanRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    ...(num(farmData.ownedPlanCount) == null ? [] : [{ key: "plans", label: tOr(`${K}.count`, "Current owned field plans"), value: formatNumber(farmData.ownedPlanCount, 0) }]),
    ...(num(farmData.withheldOwnership) == null ? [] : [{ key: "withheld", label: tOr(`${K}.withheld`, "Ownership not confirmed"), value: formatNumber(farmData.withheldOwnership, 0) }]),
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Workplan's saved entries for fields this farm still owns. These are manually recorded plans and task statuses, not proof that the underlying field work happened. Crop names are the game's internal fruit names when available.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Recorded field plans")}>
        <ModTable columns={[
          { key: "field", label: tOr(`${K}.field`, "Field") },
          { key: "crops", label: tOr(`${K}.crops`, "Current / planned crop") },
          { key: "required", label: tOr(`${K}.required`, "Marked required") },
          { key: "complete", label: tOr(`${K}.complete`, "Marked complete") },
          { key: "other", label: tOr(`${K}.other`, "Other saved statuses") },
        ]} rows={rows.map((row, index) => ({ key: `${row.fieldId ?? index}`, cells: {
          field: formatNumber(row.fieldId, 0),
          crops: `${crop(row.currentCrop, row.currentCropIndex)} / ${crop(row.plannedCrop, row.plannedCropIndex)}`,
          required: taskList(row, [1]), complete: taskList(row, [3]), other: taskList(row, [2, 4, 5]),
        } }))} empty={page?.coverage === "truncated"
          ? tOr(`${K}.truncated`, "Only part of the saved plan register was scanned or displayed.")
          : page?.coverage === "partial"
            ? tOr(`${K}.partial`, "Invalid entries and plans whose current field ownership could not be confirmed were withheld.")
            : tOr(`${K}.empty`, "No Workplan entry is recorded for a currently owned field.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the saved plan register was scanned or displayed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Invalid entries and plans whose current field ownership could not be confirmed were withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
