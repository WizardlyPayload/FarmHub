import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.bhFuelTerminal";
type Bay = { mode?: number; loadedLiters?: number; receivedLiters?: number };
type Terminal = {
  farmId?: number; terminalId?: string; terminal?: string;
  power?: boolean; esd?: boolean; openTanks?: number;
  loadedLiters?: number; receivedLiters?: number; bays?: Bay[];
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const terminals = asList<Terminal>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "terminals", label: tOr(`${K}.terminals`, "Owned fuel terminals"), value: formatNumber(farmData.terminalCount, 0) },
    { key: "stopped", label: tOr(`${K}.stopped`, "Stopped"), value: formatNumber(farmData.stoppedCount, 0) },
    { key: "esd", label: tOr(`${K}.esdCount`, "Emergency shutdown"), value: formatNumber(farmData.esdCount, 0) },
    { key: "loaded", label: tOr(`${K}.loaded`, "Lifetime loaded (L)"), value: formatNumber(farmData.loadedLiters, 0) },
    { key: "received", label: tOr(`${K}.received`, "Lifetime received (L)"), value: formatNumber(farmData.receivedLiters, 0) },
  ] : [];
  const mode = (value?: number) => value === 3 ? tOr(`${K}.auto`, "Auto")
    : value === 2 ? tOr(`${K}.load`, "Load")
      : value === 1 ? tOr(`${K}.receive`, "Receive") : tOr(`${K}.paused`, "Paused");
  const status = (row: Terminal) => row.esd ? tOr(`${K}.esd`, "ESD tripped")
    : row.power ? tOr(`${K}.running`, "Powered") : tOr(`${K}.off`, "Stopped");
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current controls and lifetime diesel transfer counters for this farm's fuel terminals. Transfer litres do not prove a sale, purchase or income.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Owned terminal controls")}>
        <ModTable columns={[
          { key: "terminal", label: tOr(`${K}.terminal`, "Terminal") },
          { key: "status", label: tOr(`${K}.status`, "Status") },
          { key: "valves", label: tOr(`${K}.valves`, "Open tank valves") },
          { key: "bay1", label: tOr(`${K}.bay1`, "Bay 1") },
          { key: "bay2", label: tOr(`${K}.bay2`, "Bay 2") },
          { key: "loaded", label: tOr(`${K}.loaded`, "Lifetime loaded (L)"), align: "end" },
          { key: "received", label: tOr(`${K}.received`, "Lifetime received (L)"), align: "end" },
        ]} rows={terminals.map((row, index) => ({
          key: row.terminalId || String(index),
          cells: {
            terminal: row.terminal || tOr(`${K}.unnamed`, "Fuel terminal"),
            status: status(row),
            valves: `${formatNumber(row.openTanks, 0)} / 6`,
            bay1: mode(row.bays?.[0]?.mode), bay2: mode(row.bays?.[1]?.mode),
            loaded: formatNumber(row.loadedLiters, 0),
            received: formatNumber(row.receivedLiters, 0),
          },
        }))} empty={tOr(`${K}.empty`, "No owned fuel terminal has readable controls.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned terminal list is shown.")}</ModEmpty> : null}
        {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An owned terminal had ambiguous identity or unreadable state and was withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
