import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type MixerRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  elapsedSeconds?: number;
  requiredSeconds?: number;
  progressPercent?: number;
  currentFillLitres?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<MixerRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "wagons", label: tOr("companionPage.enhancedMixerWagons.wagons", "Owned mixer wagons"), value: formatNumber(farmData.wagonCount, 0) },
    { key: "progress", label: tOr("companionPage.enhancedMixerWagons.inProgress", "Timers in progress"), value: formatNumber(farmData.inProgressCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.enhancedMixerWagons.lead", "Current mixing timer on this farm's mixer wagons. Timer progress is not feed produced or delivered.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.enhancedMixerWagons.tableTitle", "Mixer wagon timers")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.enhancedMixerWagons.vehicle", "Mixer wagon") },
            { key: "elapsed", label: tOr("companionPage.enhancedMixerWagons.elapsed", "Elapsed") },
            { key: "required", label: tOr("companionPage.enhancedMixerWagons.required", "Required") },
            { key: "progress", label: tOr("companionPage.enhancedMixerWagons.progress", "Timer progress") },
            { key: "fill", label: tOr("companionPage.enhancedMixerWagons.fill", "Current load") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              elapsed: typeof row.elapsedSeconds === "number" ? `${formatNumber(row.elapsedSeconds, 1)} s` : "—",
              required: typeof row.requiredSeconds === "number" ? `${formatNumber(row.requiredSeconds, 0)} s` : "—",
              progress: typeof row.progressPercent === "number" ? `${formatNumber(row.progressPercent, 0)}%` : "—",
              fill: typeof row.currentFillLitres === "number" ? `${formatNumber(row.currentFillLitres, 0)} L` : "—",
            },
          }))}
          empty={tOr("companionPage.enhancedMixerWagons.empty", "No owned mixer wagon has a readable timer yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.enhancedMixerWagons.truncated", "Only the first owned mixer wagons are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
