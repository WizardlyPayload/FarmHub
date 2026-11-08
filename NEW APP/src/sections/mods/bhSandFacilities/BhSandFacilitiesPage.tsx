import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, formatPercent, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.bhSandFacilities";
type Silo = {
  farmId?: number; placeableId?: string; name?: string; running?: boolean;
  sandLiters?: number; capacityLiters?: number; usageEnabled?: boolean;
  usageArmed?: boolean; holdRemainingSeconds?: number;
  configuredUseLitersPerRunningHour?: number;
};
type Yard = {
  farmId?: number; placeableId?: string; name?: string; running?: boolean;
  truckFillCutoffRatio?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const silos = asList<Silo>(page?.silos).filter((row) => num(row.farmId) === farmId);
  const yards = asList<Yard>(page?.yards).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "silos", label: tOr(`${K}.silos`, "Owned sand silos"), value: formatNumber(farmData.siloCount, 0) },
    { key: "yards", label: tOr(`${K}.yards`, "Owned sand yards"), value: formatNumber(farmData.yardCount, 0) },
    { key: "running", label: tOr(`${K}.runningCount`, "Powered now"), value: formatNumber(farmData.runningCount, 0) },
    { key: "sand", label: tOr(`${K}.sand`, "Silo sand now (L)"), value: formatNumber(farmData.sandLiters, 0) },
  ] : [];
  const power = (running?: boolean) => running
    ? tOr(`${K}.running`, "Running") : tOr(`${K}.stopped`, "Stopped");
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Owned silo stock and saved consumption-cycle state, plus yard power. The yard is an unlimited paid source, not stored sand; a configured rate does not prove consumption.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.siloTitle`, "Sand silo systems")}>
        <ModTable columns={[
          { key: "name", label: tOr(`${K}.facility`, "Facility") },
          { key: "power", label: tOr(`${K}.power`, "Power") },
          { key: "sand", label: tOr(`${K}.sand`, "Silo sand now (L)"), align: "end" },
          { key: "capacity", label: tOr(`${K}.capacity`, "Capacity (L)"), align: "end" },
          { key: "cycle", label: tOr(`${K}.cycle`, "Use cycle") },
          { key: "hold", label: tOr(`${K}.hold`, "Hold left (s)") },
          { key: "rate", label: tOr(`${K}.rate`, "Configured use (L/running h)"), align: "end" },
        ]} rows={silos.map((row, index) => ({
          key: row.placeableId || String(index),
          cells: {
            name: row.name || tOr(`${K}.unnamedSilo`, "Sand silo"),
            power: power(row.running),
            sand: formatNumber(row.sandLiters, 0),
            capacity: formatNumber(row.capacityLiters, 0),
            cycle: !row.usageEnabled ? tOr(`${K}.disabled`, "Disabled")
              : row.usageArmed ? tOr(`${K}.armed`, "Armed") : tOr(`${K}.waiting`, "Waiting for full silo"),
            hold: row.usageEnabled && row.usageArmed
              ? formatNumber(row.holdRemainingSeconds, 0) : "—",
            rate: row.usageEnabled ? formatNumber(row.configuredUseLitersPerRunningHour, 0) : "—",
          },
        }))} empty={tOr(`${K}.emptySilos`, "No owned sand silo has readable state.")} />
      </Card>
      <Card title={tOr(`${K}.yardTitle`, "Sand buying yards")}>
        <ModTable columns={[
          { key: "name", label: tOr(`${K}.facility`, "Facility") },
          { key: "power", label: tOr(`${K}.power`, "Power") },
          { key: "source", label: tOr(`${K}.source`, "Source") },
          { key: "cutoff", label: tOr(`${K}.cutoff`, "Configured truck cutoff") },
        ]} rows={yards.map((row, index) => ({
          key: row.placeableId || String(index),
          cells: {
            name: row.name || tOr(`${K}.unnamedYard`, "Sand yard"),
            power: power(row.running), source: tOr(`${K}.paidUnlimited`, "Unlimited paid supply"),
            cutoff: formatPercent(row.truckFillCutoffRatio, { ratio: true, dp: 0 }),
          },
        }))} empty={tOr(`${K}.emptyYards`, "No owned sand yard has readable state.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned facility list is shown.")}</ModEmpty> : null}
        {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An owned facility had ambiguous identity or unreadable state and was withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
