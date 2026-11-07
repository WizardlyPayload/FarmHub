import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.agroRealisticHealthLoss";
type Timer = {
  placeableId?: string; placeableName?: string; clusterId?: number;
  animals?: number; hoursAtZero?: number; thresholdHours?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const timers = asList<Timer>(page?.timers);
  const tiles: ModStatTile[] = farmData ? [
    { key: "active", label: tOr(`${K}.active`, "Active zero-health timers"),
      value: formatNumber(farmData.activeTimerCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Current zero-health hour counters for this farm's animal clusters. If health stays at zero for 24 counted hours, the mod removes about half that cluster's animals. This is not a history of losses or a guaranteed future loss.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Animal clusters with active timers")}>
        <ModTable
          columns={[
            { key: "pen", label: tOr(`${K}.pen`, "Husbandry") },
            { key: "cluster", label: tOr(`${K}.cluster`, "Cluster ID"), align: "end" },
            { key: "animals", label: tOr(`${K}.animals`, "Animals now"), align: "end" },
            { key: "hours", label: tOr(`${K}.hours`, "Hours counted at zero"), align: "end" },
          ]}
          rows={timers.map((timer, index) => ({
            key: `${timer.placeableId ?? index}|${timer.clusterId ?? index}`,
            cells: {
              pen: timer.placeableName || timer.placeableId || "—",
              cluster: formatNumber(timer.clusterId, 0),
              animals: formatNumber(timer.animals, 0),
              hours: `${formatNumber(timer.hoursAtZero, 0)} / ${formatNumber(timer.thresholdHours, 0)}`,
            },
          }))}
          empty={tOr(`${K}.empty`, "No active zero-health timer was captured for this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`,
          "Only part of the active timer list could be shown.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
