import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.bhWaterBattery";
type Tank = {
  number?: number; selected?: boolean; waterLiters?: number; capacityLiters?: number;
  inletOpen?: boolean; outletOpen?: boolean; lowLocked?: boolean; highLatched?: boolean;
  drawdownAuthorized?: boolean; acknowledged?: boolean;
};
type Bank = {
  farmId?: number; batteryId?: string; battery?: string; bankESD?: boolean;
  bankAcknowledged?: boolean; selectedTank?: number; waterLiters?: number;
  totalProducedLiters?: number; totalLoadedLiters?: number;
  unacknowledgedHighTanks?: number; tanks?: Tank[];
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const banks = asList<Bank>(page?.banks).filter((bank) => num(bank.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "banks", label: tOr(`${K}.banks`, "Owned water batteries"), value: formatNumber(farmData.batteryCount, 0) },
    { key: "water", label: tOr(`${K}.water`, "Water now (L)"), value: formatNumber(farmData.waterLiters, 0) },
    { key: "produced", label: tOr(`${K}.produced`, "Lifetime produced (L)"), value: formatNumber(farmData.totalProducedLiters, 0) },
    { key: "loaded", label: tOr(`${K}.loaded`, "Lifetime loaded (L)"), value: formatNumber(farmData.totalLoadedLiters, 0) },
    { key: "alarms", label: tOr(`${K}.alarms`, "Unacknowledged high tanks"), value: formatNumber(farmData.unacknowledgedHighTanks, 0) },
  ] : [];
  const yes = (value?: boolean) => value ? tOr(`${K}.yes`, "Open") : tOr(`${K}.no`, "Closed");
  const tankStatus = (bank: Bank, tank: Tank) => bank.bankESD
    ? tOr(`${K}.bankEsd`, "Bank ESD")
    : tank.highLatched
      ? tank.drawdownAuthorized ? tOr(`${K}.drawdown`, "High: drawdown allowed")
        : tOr(`${K}.high`, "High: drawdown needed")
      : tank.lowLocked ? tOr(`${K}.low`, "Low lockout")
        : tOr(`${K}.ready`, "Ready");
  const tankRows = banks.flatMap((bank) => asList<Tank>(bank.tanks).map((tank) => ({ bank, tank })));
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current water and saved safety controls at this farm's produced-water batteries. Lifetime counters are litres handled, not sales or income.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.bankTitle`, "Owned battery banks")}>
        <ModTable columns={[
          { key: "bank", label: tOr(`${K}.bank`, "Battery") },
          { key: "state", label: tOr(`${K}.state`, "Bank state") },
          { key: "selected", label: tOr(`${K}.selected`, "Selected tank") },
          { key: "water", label: tOr(`${K}.water`, "Water now (L)"), align: "end" },
          { key: "produced", label: tOr(`${K}.produced`, "Lifetime produced (L)"), align: "end" },
          { key: "loaded", label: tOr(`${K}.loaded`, "Lifetime loaded (L)"), align: "end" },
        ]} rows={banks.map((bank, index) => ({
          key: bank.batteryId || String(index),
          cells: {
            bank: bank.battery || tOr(`${K}.unnamed`, "Water battery"),
            state: bank.bankESD ? tOr(`${K}.bankEsd`, "Bank ESD") : tOr(`${K}.normal`, "Normal"),
            selected: formatNumber(bank.selectedTank, 0),
            water: formatNumber(bank.waterLiters, 0),
            produced: formatNumber(bank.totalProducedLiters, 0),
            loaded: formatNumber(bank.totalLoadedLiters, 0),
          },
        }))} empty={tOr(`${K}.empty`, "No owned battery has readable live state.")} />
      </Card>
      <Card title={tOr(`${K}.tankTitle`, "Tank levels and controls")}>
        <ModTable columns={[
          { key: "bank", label: tOr(`${K}.bank`, "Battery") },
          { key: "tank", label: tOr(`${K}.tank`, "Tank") },
          { key: "water", label: tOr(`${K}.water`, "Water now (L)"), align: "end" },
          { key: "capacity", label: tOr(`${K}.capacity`, "Capacity (L)"), align: "end" },
          { key: "status", label: tOr(`${K}.status`, "Safety state") },
          { key: "inlet", label: tOr(`${K}.inlet`, "Inlet") },
          { key: "outlet", label: tOr(`${K}.outlet`, "Outlet") },
        ]} rows={tankRows.map(({bank, tank}, index) => ({
          key: `${bank.batteryId || index}:${tank.number || index}`,
          cells: {
            bank: bank.battery || tOr(`${K}.unnamed`, "Water battery"),
            tank: `${formatNumber(tank.number, 0)}${tank.selected ? " *" : ""}`,
            water: formatNumber(tank.waterLiters, 0),
            capacity: formatNumber(tank.capacityLiters, 0),
            status: tankStatus(bank, tank), inlet: yes(tank.inletOpen), outlet: yes(tank.outletOpen),
          },
        }))} empty={tOr(`${K}.emptyTanks`, "No tank readings are available.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned battery list is shown.")}</ModEmpty> : null}
        {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An owned battery had ambiguous identity or unreadable state and was withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
