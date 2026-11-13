import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModPage, ModStatTiles, ModTable, formatNumber,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.grapeOliveYieldSettings";

export function Page({ entry }: CompanionPageProps) {
  const { page } = useCompanionPage(entry.key);
  const tiles: ModStatTile[] = page && page.grapeMultiplier != null && page.oliveMultiplier != null ? [
    { key: "grape", label: tOr(`${K}.grape`, "Grape multiplier"), value: `${formatNumber(page.grapeMultiplier, 2)}×` },
    { key: "olive", label: tOr(`${K}.olive`, "Olive multiplier"), value: `${formatNumber(page.oliveMultiplier, 2)}×` },
  ] : [];
  const rows = page && page.grapeMultiplier != null && page.oliveMultiplier != null ? [
    { key: "grape", label: tOr(`${K}.grape`, "Grape"), multiplier: page.grapeMultiplier, rate: page.grapeLitresPerSqm },
    { key: "olive", label: tOr(`${K}.olive`, "Olive"), multiplier: page.oliveMultiplier, rate: page.oliveLitresPerSqm },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "These live settings apply to grapes and olives across the whole save. The game yield parameter may also reflect other mods. This page does not measure a harvest or predict yield from a field.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Current crop yield rules")}>
        <ModTable
          columns={[
            { key: "crop", label: tOr(`${K}.crop`, "Crop") },
            { key: "multiplier", label: tOr(`${K}.multiplier`, "Mod setting"), align: "end" },
            { key: "rate", label: tOr(`${K}.rate`, "Current game parameter"), align: "end" },
          ]}
          rows={rows.map((row) => ({
            key: row.key,
            cells: {
              crop: row.label,
              multiplier: `${formatNumber(row.multiplier, 2)}×`,
              rate: row.rate == null ? "—" : `${formatNumber(row.rate, 3)} L/m²`,
            },
          }))}
          empty={tOr(`${K}.empty`, "The active server yield rule is not available.")}
        />
      </Card>
    </ModPage>
  );
}
