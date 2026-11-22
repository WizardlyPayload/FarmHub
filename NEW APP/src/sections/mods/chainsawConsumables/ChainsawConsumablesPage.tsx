import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.chainsawConsumables";
type SawRow = {
  farmId?: number;
  toolId?: string;
  tool?: string;
  fuelLitres?: number;
  chainOilLitres?: number;
  sharpnessPercent?: number;
  chainLifePercent?: number;
  enginePercent?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<SawRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = typeof farmData?.sawCount === "number" ? [
    { key: "saws", label: tOr(`${K}.saws`, "Owned chainsaws"), value: formatNumber(farmData.sawCount, 0) },
  ] : [];
  const percent = (value: number | undefined) => typeof value === "number" ? `${formatNumber(value, 0)}%` : "—";
  const litres = (value: number | undefined) => typeof value === "number" ? `${formatNumber(value, 2)} L` : "—";
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current mod-tracked fuel, chain oil and condition on chainsaws this farm owns. These levels do not prove fuel consumed, work completed or service paid for.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Chainsaw condition")}>
        <ModTable columns={[
          { key: "tool", label: tOr(`${K}.tool`, "Chainsaw") },
          { key: "fuel", label: tOr(`${K}.fuel`, "Fuel") },
          { key: "oil", label: tOr(`${K}.oil`, "Chain oil") },
          { key: "sharp", label: tOr(`${K}.sharpness`, "Sharpness") },
          { key: "chain", label: tOr(`${K}.chainLife`, "Chain life") },
          { key: "engine", label: tOr(`${K}.engine`, "Engine condition") },
        ]} rows={rows.map((row, index) => ({
          key: row.toolId || String(index),
          cells: {
            tool: row.tool || tOr(`${K}.unnamed`, "Unnamed saw"),
            fuel: litres(row.fuelLitres), oil: litres(row.chainOilLitres),
            sharp: percent(row.sharpnessPercent), chain: percent(row.chainLifePercent),
            engine: percent(row.enginePercent),
          },
        }))} empty={tOr(`${K}.empty`, "No owned chainsaw has readable mod condition yet.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned chainsaw condition is shown.")}</ModEmpty> : null}
        {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "A saw had ambiguous identity or unreadable condition and was withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
