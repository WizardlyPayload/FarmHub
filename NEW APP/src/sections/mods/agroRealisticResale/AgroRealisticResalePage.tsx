import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.agroRealisticResale";
type Land = {
  farmlandId?: number; recordedStartPeriod?: number;
  elapsedPeriods?: number; resaleFactor?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const lands = asList<Land>(page?.lands);
  const tiles: ModStatTile[] = farmData ? [
    { key: "count", label: tOr(`${K}.recordedLand`, "Owned land with a recorded start"),
      value: formatNumber(farmData.recordedLandCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Resale factors from this mod's saved history for land this farm owns now. A migrated history start may be later than the real purchase. These factors are not a confirmed sale payment.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Owned land resale factors")}>
        <ModTable
          columns={[
            { key: "land", label: tOr(`${K}.land`, "Farmland") },
            { key: "start", label: tOr(`${K}.start`, "Recorded start period"), align: "end" },
            { key: "elapsed", label: tOr(`${K}.elapsed`, "Periods since recorded start"), align: "end" },
            { key: "factor", label: tOr(`${K}.factor`, "Resale price factor"), align: "end" },
          ]}
          rows={lands.map((land, index) => ({
            key: `${land.farmlandId ?? index}`,
            cells: {
              land: formatNumber(land.farmlandId, 0),
              start: formatNumber(land.recordedStartPeriod, 0),
              elapsed: formatNumber(land.elapsedPeriods, 0),
              factor: land.resaleFactor == null ? "—" : `${formatNumber(land.resaleFactor * 100, 0)}%`,
            },
          }))}
          empty={tOr(`${K}.empty`, "No recorded history for this farm's owned land was captured.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`,
          "Only part of the land history could be listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`,
          "Some land history entries were invalid.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
