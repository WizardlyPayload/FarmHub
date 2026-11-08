import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.helperSilageCompacting";
type Row = { farmId?: number; vehicleId?: string; vehicle?: string; workerState?: string };

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "assigned", label: tOr(`${K}.assigned`, "Owned tractors at bunkers"), value: formatNumber(farmData.assignedVehicleCount, 0) },
    { key: "running", label: tOr(`${K}.running`, "Helpers running"), value: formatNumber(farmData.runningVehicleCount, 0) },
    { key: "waiting", label: tOr(`${K}.waiting`, "Helpers waiting"), value: formatNumber(farmData.waitingVehicleCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current Helper Silage Compacting assignment and AI state on your tractors. Running or waiting does not prove compaction progress or completed work.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Owned bunker helpers")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Tractor") },
          { key: "state", label: tOr(`${K}.state`, "Helper state") },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: {
            vehicle: row.vehicle || row.vehicleId || "—",
            state: row.workerState ? tOr(`${K}.state${row.workerState}`, row.workerState) : "—",
          },
        }))} empty={tOr(`${K}.empty`, "No owned tractor has an assigned bunker helper reading.")} />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some helper states were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
