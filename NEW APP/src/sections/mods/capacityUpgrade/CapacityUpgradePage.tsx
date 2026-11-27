import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type UpgradeRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  fillUnitIndex?: number;
  factor?: number;
  effect?: "capacity" | "usage-slowed";
  stockCapacity?: number;
  currentCapacity?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<UpgradeRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "vehicles", label: tOr("companionPage.capacityUpgrade.vehicles", "Owned upgraded vehicles"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "capacity", label: tOr("companionPage.capacityUpgrade.capacityUnits", "Larger fill units"), value: formatNumber(farmData.capacityUnitCount, 0) },
    { key: "slowed", label: tOr("companionPage.capacityUpgrade.slowedUnits", "Slower-use units"), value: formatNumber(farmData.slowedUnitCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.capacityUpgrade.lead", "Applied Capacity Upgrade choices on vehicles owned by this farm. Some units gain capacity; others retain their tank size and use supplies more slowly. These are current settings, not a usage or purchase history.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.capacityUpgrade.tableTitle", "Applied fill-unit upgrades")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.capacityUpgrade.vehicle", "Vehicle") },
            { key: "unit", label: tOr("companionPage.capacityUpgrade.unit", "Fill unit") },
            { key: "choice", label: tOr("companionPage.capacityUpgrade.choice", "Selected choice") },
            { key: "effect", label: tOr("companionPage.capacityUpgrade.effect", "Applied effect") },
            { key: "stock", label: tOr("companionPage.capacityUpgrade.stock", "Stock capacity") },
            { key: "current", label: tOr("companionPage.capacityUpgrade.current", "Current capacity") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.vehicleId || index}:${row.fillUnitIndex || index}:${row.effect || ""}`,
            cells: {
              vehicle: row.vehicle || "—",
              unit: formatNumber(row.fillUnitIndex, 0),
              choice: `+${formatNumber(((num(row.factor) ?? 1) - 1) * 100, 0)}%`,
              effect: row.effect === "usage-slowed"
                ? tOr("companionPage.capacityUpgrade.slowerUse", "Slower use; tank unchanged")
                : tOr("companionPage.capacityUpgrade.largerTank", "Larger capacity"),
              stock: row.effect === "capacity" ? formatNumber(row.stockCapacity, 0) : "—",
              current: row.effect === "capacity" ? formatNumber(row.currentCapacity, 0) : "—",
            },
          }))}
          empty={tOr("companionPage.capacityUpgrade.empty", "No applied Capacity Upgrade found on vehicles owned by this farm.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.capacityUpgrade.truncated", "Only the first applied fill units are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.capacityUpgrade.partial", "Some selected upgrade effects could not be verified; totals are withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
