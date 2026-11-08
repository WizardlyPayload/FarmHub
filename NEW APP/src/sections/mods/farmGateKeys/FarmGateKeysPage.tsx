import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.farmGateKeys";
type GateRow = {
  farmId?: number; gateId?: string; gate?: string;
  placeableId?: string; source?: string; locked?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<GateRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "locks", label: tOr(`${K}.heldLocks`, "Gate locks held by this farm"), value: formatNumber(farmData.heldLockCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current locks this farm placed on animated gates. The lock holder may differ from the gate's property owner; no entry or access history is recorded.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Locked gates")}>
        <ModTable
          columns={[
            { key: "gate", label: tOr(`${K}.gate`, "Gate ID") },
            { key: "source", label: tOr(`${K}.source`, "Source") },
            { key: "placeable", label: tOr(`${K}.placeable`, "Placeable ID") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.gateId || String(index),
            cells: {
              gate: row.gate || row.gateId || "—",
              source: row.source === "map" ? tOr(`${K}.map`, "Map object") : tOr(`${K}.placeableGate`, "Placeable"),
              placeable: row.placeableId || "—",
            },
          }))}
          empty={tOr(`${K}.empty`, "No readable gate locks held by this farm.")}
        />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some gate lock states were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
