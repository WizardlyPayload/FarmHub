import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModAbout,
  ModEmpty,
  ModKeyValues,
  ModPage,
  ModStatTiles,
  ModTable,
  asList,
  formatNumber,
  num,
  useCompanionPage,
  useMoney,
  yesNo,
  type CompanionPageProps,
  type ModStatTile,
} from "@/sections/mods/shared";

type Vehicle = {
  id?: string;
  name?: string;
  punctured?: boolean;
  armed?: boolean;
  metersToPuncture?: number;
  pressurePct?: number;
  wheelIndex?: number;
  axle?: string;
  side?: string;
  position?: string;
  speedCapKmh?: number;
  repairCost?: number;
};

function count(value: unknown): string {
  return num(value) == null ? "—" : formatNumber(value, 0);
}

function period(value: unknown): string {
  return num(value) == null ? "—" : count(value);
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const money = useMoney();
  const cycle = page?.cycle && typeof page.cycle === "object" ? page.cycle as Record<string, unknown> : null;
  const vehicles = asList<Vehicle>(farmData?.vehicles);
  const tiles: ModStatTile[] = farmData ? [
    { key: "punctured", label: tOr("companionPage.puncturedTires.punctured", "Punctured vehicles"), value: count(farmData.puncturedCount), tone: (num(farmData.puncturedCount) ?? 0) > 0 ? "danger" : undefined },
    { key: "armed", label: tOr("companionPage.puncturedTires.armed", "Nail picked up"), value: count(farmData.armedCount), tone: (num(farmData.armedCount) ?? 0) > 0 ? "warn" : undefined },
    { key: "equipped", label: tOr("companionPage.puncturedTires.equipped", "Equipped farm vehicles"), value: count(farmData.equippedCount) },
    { key: "remaining", label: tOr("companionPage.puncturedTires.remaining", "Remaining this cycle"), value: count(cycle?.remaining), hint: cycle ? tOr("companionPage.puncturedTires.cycleCount", "{{count}} of {{limit}} punctures in this cycle", { count: count(cycle.count), limit: count(cycle.limit) }) : null },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.puncturedTires.lead", "Punctured Tires can leave a vehicle with a flat or a nail that may cause one. These are the latest readings for the selected farm; repairs still happen in the game.")}>
      <ModStatTiles tiles={tiles} />
      {cycle ? (
        <Card title={tOr("companionPage.puncturedTires.schedule", "Puncture cycle")}>
          <ModKeyValues rows={[
            { key: "current", label: tOr("companionPage.puncturedTires.currentPeriod", "Current period"), value: period(cycle.currentPeriod) },
            { key: "start", label: tOr("companionPage.puncturedTires.startPeriod", "Cycle started in period"), value: period(cycle.startPeriod) },
            { key: "danger1", label: tOr("companionPage.puncturedTires.danger1", "First danger period"), value: period(cycle.dangerPeriod1) },
            { key: "danger2", label: tOr("companionPage.puncturedTires.danger2", "Second danger period"), value: period(cycle.dangerPeriod2) },
            { key: "dangerNow", label: tOr("companionPage.puncturedTires.dangerNow", "Danger period now"), value: yesNo(cycle.dangerNow) },
            { key: "thisPeriod", label: tOr("companionPage.puncturedTires.thisPeriod", "Punctured this period"), value: count(cycle.puncturedThisPeriod) },
          ]} />
        </Card>
      ) : null}
      <Card title={tOr("companionPage.puncturedTires.vehicles", "Equipped vehicles")}>
        {farmData ? (
          <>
            {page?.readState === "ok" && page.coverage === "complete" && num(farmData.puncturedCount) === 0 && num(farmData.armedCount) === 0 ? <ModEmpty>{tOr("companionPage.puncturedTires.noProblems", "No punctured vehicles or picked-up nails reported for this farm.")}</ModEmpty> : null}
            <ModTable
              columns={[
                { key: "name", label: tOr("companionPage.puncturedTires.vehicle", "Vehicle") },
                { key: "state", label: tOr("companionPage.puncturedTires.state", "Tyre state") },
                { key: "detail", label: tOr("companionPage.puncturedTires.detail", "Detail") },
                { key: "repair", label: tOr("companionPage.puncturedTires.repair", "Repair estimate"), align: "end" },
              ]}
              rows={vehicles.map((vehicle, i) => ({
                key: vehicle.id ?? String(i),
                tone: vehicle.punctured ? "danger" : vehicle.armed ? "warn" : undefined,
                cells: {
                  name: vehicle.name ?? vehicle.id ?? "—",
                  state: vehicle.punctured ? tOr("companionPage.puncturedTires.flat", "Punctured") : vehicle.armed ? tOr("companionPage.puncturedTires.nail", "Nail picked up") : tOr("companionPage.puncturedTires.clear", "No problem reported"),
                  detail: vehicle.punctured
                    ? [vehicle.axle, vehicle.side, vehicle.position, num(vehicle.pressurePct) == null ? null : `${formatNumber(vehicle.pressurePct, 0)}% pressure`, num(vehicle.speedCapKmh) == null ? null : `${formatNumber(vehicle.speedCapKmh, 0)} km/h cap`].filter(Boolean).join(" · ") || "—"
                    : vehicle.armed && num(vehicle.metersToPuncture) != null ? `${formatNumber(vehicle.metersToPuncture, 0)} m until flat` : "—",
                  repair: vehicle.punctured ? money(vehicle.repairCost) : "—",
                },
              }))}
              empty={tOr("companionPage.puncturedTires.noVehicles", "No equipped vehicles were reported for this farm.")}
            />
            {page?.coverage === "truncated" ? <p class="fd-economy__muted">{tOr("companionPage.puncturedTires.truncated", "Only the first 50 equipped vehicles are shown.")}</p> : null}
          </>
        ) : <ModEmpty>{tOr("companionPage.puncturedTires.unavailable", "Vehicle readings are unavailable for the selected farm.")}</ModEmpty>}
      </Card>
      <ModAbout entry={entry} />
    </ModPage>
  );
}
