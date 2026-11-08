import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.twoRotorRakeControl";
type Row = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  leftTarget?: string; rightTarget?: string;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" && farmData.independentCount != null ? [
    { key: "active", label: tOr(`${K}.active`, "Owned rakes in independent mode"), value: formatNumber(farmData.independentCount, 0) },
    { key: "split", label: tOr(`${K}.split`, "Different left/right targets"), value: formatNumber(farmData.splitTargetCount, 0) },
  ] : [];
  const target = (value?: string) => tOr(`${K}.target.${value || "unknown"}`, value || "—");
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Shows the current target for each rotor while independent control is active. A target does not prove the rotor reached it or that the rake worked a field.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Independent rotor targets")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Rake") },
          { key: "left", label: tOr(`${K}.left`, "Left target") },
          { key: "right", label: tOr(`${K}.right`, "Right target") },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: { vehicle: row.vehicle || "—", left: target(row.leftTarget), right: target(row.rightTarget) },
        }))} empty={tOr(`${K}.empty`, "No owned rake has independent rotor control active.")} />
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "A rake had ambiguous identity or unreadable targets and was withheld; totals are withheld.")}</ModEmpty> : null}
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned rake list is shown; totals are withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
