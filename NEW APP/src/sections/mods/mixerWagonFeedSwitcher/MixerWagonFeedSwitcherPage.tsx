import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.mixerWagonFeedSwitcher";

type MixGroup = { name?: string; litres?: number };
type WagonRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  mode?: number;
  recipe?: string;
  outputFillType?: string;
  groupTotalLitres?: number;
  groups?: MixGroup[];
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<WagonRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "custom", label: tOr(`${K}.custom`, "Owned wagons with custom recipe"), value: formatNumber(farmData.customRecipeCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current custom recipe choices and mod-tracked mix groups on this farm's mixer wagons. A recipe or mix reading does not prove feed was produced, delivered or accepted by animals.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Mixer wagon recipes")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Mixer wagon") },
          { key: "recipe", label: tOr(`${K}.recipe`, "Selected recipe") },
          { key: "output", label: tOr(`${K}.output`, "Recipe output") },
          { key: "mix", label: tOr(`${K}.mix`, "Mod-tracked groups") },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: {
            vehicle: row.vehicle || "—",
            recipe: row.recipe || tOr(`${K}.mode`, "Mode {{number}}", { number: row.mode ?? "—" }),
            output: row.outputFillType || "—",
            mix: asList<MixGroup>(row.groups).map((group) =>
              `${group.name || "—"} ${formatNumber(group.litres, 0)} L`).join(" · ") || "—",
          },
        }))} empty={tOr(`${K}.empty`, "No owned mixer wagon has a readable custom recipe selection.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned mixer wagon state is shown.")}</ModEmpty> : null}
        {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "A mixer wagon had ambiguous identity or unreadable mix state and was withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
