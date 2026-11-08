import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.adjustProductionPoints";

type AdjustmentRow = {
  farmId?: number;
  placeableId?: string;
  name?: string;
  kind?: "cycles" | "fillCapacity" | "totalCapacity";
  item?: string;
  fillTypeIndex?: number;
  baseline?: number;
  saved?: number;
  current?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<AdjustmentRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "points", label: tOr(`${K}.points`, "Owned production points"), value: formatNumber(farmData.ownedPointCount, 0) },
    { key: "rates", label: tOr(`${K}.rates`, "Changed recipe rates"), value: formatNumber(farmData.changedRateCount, 0) },
    { key: "limits", label: tOr(`${K}.limits`, "Adjusted storage limits"), value: formatNumber(farmData.adjustedCapacityCount, 0) },
    { key: "mismatches", label: tOr(`${K}.mismatches`, "Saved/live differences"), value: formatNumber(farmData.mismatchCount, 0) },
  ] : [];

  const label = (row: AdjustmentRow) => {
    if (row.kind === "cycles") return tOr(`${K}.recipe`, "{{name}} · cycles/month", { name: row.item || "—" });
    if (row.kind === "totalCapacity") return tOr(`${K}.total`, "Total storage capacity · L");
    return tOr(`${K}.fill`, "{{name}} capacity · L", {
      name: row.item || tOr(`${K}.fillNumber`, "Fill type #{{number}}", { number: row.fillTypeIndex ?? "—" }),
    });
  };

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Changed recipe rates and saved storage limits for production points this farm owns. For rates, the reference is the original recipe rate; for storage, it is the mod's saved limit. Other production mods may also change live values. These settings do not prove output or sales.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Production point adjustments")}>
        <ModTable columns={[
          { key: "point", label: tOr(`${K}.point`, "Production") },
          { key: "setting", label: tOr(`${K}.setting`, "Setting") },
          { key: "reference", label: tOr(`${K}.reference`, "Original / saved"), align: "end" },
          { key: "current", label: tOr(`${K}.current`, "Live value"), align: "end" },
        ]} rows={rows.map((row, index) => ({
          key: `${row.placeableId || "point"}-${row.kind}-${row.item || row.fillTypeIndex || index}`,
          tone: row.kind !== "cycles" && num(row.saved) !== num(row.current) ? "warn" as const : undefined,
          cells: {
            point: row.name || tOr(`${K}.unnamed`, "Unnamed production"),
            setting: label(row),
            reference: formatNumber(row.kind === "cycles" ? row.baseline : row.saved, 2),
            current: formatNumber(row.current, 2),
          },
        }))} empty={tOr(`${K}.empty`, "No changed recipe rate or adjusted storage limit is readable for this farm.")} />
      </Card>
      {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned production adjustments is shown.")}</ModEmpty> : null}
      {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An adjustment was unreadable, duplicated, or its saved limit differs from the live capacity. Check the game before relying on it.")}</ModEmpty> : null}
    </ModPage>
  );
}
