import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.greenhouseAutomaticWatering";

type WateringRow = {
  farmId?: number;
  placeableId?: string;
  name?: string;
  enabled?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<WateringRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "eligible", label: tOr(`${K}.eligible`, "Owned water-using productions"), value: formatNumber(farmData.eligibleCount, 0) },
    { key: "enabled", label: tOr(`${K}.enabled`, "Auto watering on"), value: formatNumber(farmData.enabledCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "The automatic-watering switch on this farm's water-using production buildings. This setting does not prove that water was added or money charged.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Automatic watering settings")}>
        <ModTable columns={[
          { key: "building", label: tOr(`${K}.building`, "Production building") },
          { key: "setting", label: tOr(`${K}.setting`, "Automatic watering") },
        ]} rows={rows.map((row, index) => ({
          key: row.placeableId || String(index),
          cells: {
            building: row.name || tOr(`${K}.unnamed`, "Unnamed production"),
            setting: row.enabled === true ? tOr(`${K}.on`, "On") : tOr(`${K}.off`, "Off"),
          },
        }))} empty={tOr(`${K}.empty`, "No owned water-using production has a readable automatic-watering switch.")} />
      </Card>
      {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned production list is shown.")}</ModEmpty> : null}
      {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An owned production's switch was unreadable and was withheld.")}</ModEmpty> : null}
    </ModPage>
  );
}
