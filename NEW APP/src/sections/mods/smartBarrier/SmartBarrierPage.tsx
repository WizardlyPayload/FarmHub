import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.smartBarrier";
type BarrierRow = {
  farmId?: number; barrierId?: string; barrier?: string; automatic?: boolean;
  scheduleEnabled?: boolean; scheduleStartHour?: number; scheduleEndHour?: number;
  position?: "open" | "closed" | "partway"; warning?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<BarrierRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "owned", label: tOr(`${K}.owned`, "Owned barriers shown"), value: formatNumber(farmData.barrierCount, 0) },
    { key: "automatic", label: tOr(`${K}.automaticCount`, "Automatic mode"), value: formatNumber(farmData.automaticCount, 0) },
    { key: "open", label: tOr(`${K}.openCount`, "Arms open at last reading"), value: formatNumber(farmData.openCount, 0) },
    { key: "warning", label: tOr(`${K}.warningCount`, "Closing warnings at last reading"), value: formatNumber(farmData.warningCount, 0) },
  ] : [];
  const position = (row: BarrierRow) => row.position === "open"
    ? tOr(`${K}.open`, "Open") : row.position === "closed"
      ? tOr(`${K}.closed`, "Closed") : tOr(`${K}.partway`, "Partway");
  const schedule = (row: BarrierRow) => row.scheduleEnabled === true
    ? `${formatNumber(row.scheduleStartHour, 0)}–${formatNumber(row.scheduleEndHour, 0)}`
    : tOr(`${K}.noSchedule`, "No schedule");
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Last exported arm position and saved automatic mode for barriers this farm owns. Check the reading time before using it to plan access; scheduled hours do not prove a gate opened or a vehicle passed.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Owned barrier state")}>
        <ModTable columns={[
          { key: "barrier", label: tOr(`${K}.barrier`, "Barrier") },
          { key: "mode", label: tOr(`${K}.mode`, "Mode") },
          { key: "hours", label: tOr(`${K}.hours`, "Scheduled hours") },
          { key: "position", label: tOr(`${K}.position`, "Arm at last reading") },
          { key: "warning", label: tOr(`${K}.warning`, "Close warning") },
        ]} rows={rows.map((row, index) => ({
          key: row.barrierId || String(index),
          cells: {
            barrier: row.barrier || tOr(`${K}.unnamed`, "Unnamed barrier"),
            mode: row.automatic === true ? tOr(`${K}.auto`, "Automatic") : tOr(`${K}.manual`, "Manual"),
            hours: schedule(row), position: position(row),
            warning: row.warning === true ? tOr(`${K}.yes`, "Yes") : tOr(`${K}.no`, "No"),
          },
        }))} empty={tOr(`${K}.empty`, "No owned barrier has readable live state.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned barrier list is shown.")}</ModEmpty> : null}
        {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An owned barrier had ambiguous identity or unreadable state and was withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
