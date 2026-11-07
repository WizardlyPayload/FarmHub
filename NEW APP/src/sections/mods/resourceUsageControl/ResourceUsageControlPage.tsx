import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.resourceUsageControl";
type Override = { name?: string; multiplier?: number };

export function Page({ entry }: CompanionPageProps) {
  const { page } = useCompanionPage(entry.key);
  const crops = asList<Override>(page?.cropOverrides);
  const resources = asList<Override>(page?.resourceOverrides);
  const mode = page?.individualMode === true
    ? tOr(`${K}.individual`, "Individual") : tOr(`${K}.global`, "Global");
  const tiles: ModStatTile[] = page ? [
    { key: "mode", label: tOr(`${K}.mode`, "Policy mode"), value: mode },
    { key: "global", label: tOr(`${K}.globalMultiplier`, "Global multiplier"), value: `${formatNumber(page.globalMultiplier, 2)}×` },
    { key: "seed", label: tOr(`${K}.seedMultiplier`, "Seed multiplier"), value: page.seedMultiplier == null ? "—" : `${formatNumber(page.seedMultiplier, 2)}×` },
    { key: "changed", label: tOr(`${K}.changed`, "Changed named overrides"), value: formatNumber(page.changedOverrideCount, 0) },
  ] : [];
  const table = (rows: Override[], title: string, key: string) => (
    <Card title={title}>
      <ModTable
        columns={[
          { key: "name", label: tOr(`${K}.name`, "Crop or resource") },
          { key: "multiplier", label: tOr(`${K}.multiplier`, "Multiplier"), align: "end" },
        ]}
        rows={rows.map((row, index) => ({
          key: `${key}-${row.name ?? index}`,
          cells: { name: row.name || "—", multiplier: `${formatNumber(row.multiplier, 2)}×` },
        }))}
        empty={tOr(`${K}.empty`, "No changed override is active in this mode.")}
      />
    </Card>
  );
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "These are live seed and spray usage settings shared by every farm in this save. They are not a record of supplies applied, money spent or crop yield.")}>
      <ModStatTiles tiles={tiles} />
      {page?.individualMode === true && page?.seedPerCropEnabled === true
        ? table(crops, tOr(`${K}.crops`, "Changed crop seed multipliers"), "crop") : null}
      {page?.individualMode === true && page?.resourceCategoryEnabled === true
        ? table(resources, tOr(`${K}.resources`, "Changed spray resource multipliers"), "resource") : null}
      {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`,
        "Only part of the active policy could be listed.")}</ModEmpty> : null}
      {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`,
        "Some policy values were invalid or unreadable.")}</ModEmpty> : null}
    </ModPage>
  );
}
