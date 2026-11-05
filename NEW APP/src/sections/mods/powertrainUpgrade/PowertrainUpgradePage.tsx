import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type MotorRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  powerFactor?: number;
  speedFactor?: number;
  modStateMatched?: boolean;
  speedWasCapped?: boolean;
};

const selected = (factor: number | undefined) => {
  if (typeof factor !== "number") return "—";
  return factor === 1 ? "Stock" : `+${formatNumber((factor - 1) * 100, 0)}%`;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<MotorRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "motors", label: tOr("companionPage.powertrainUpgrade.motors", "Motors with choices"), value: formatNumber(farmData.motorCount, 0) },
    { key: "upgraded", label: tOr("companionPage.powertrainUpgrade.upgraded", "Non-stock choices"), value: formatNumber(farmData.upgradedCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.powertrainUpgrade.lead", "Selected power and speed configurations on vehicles owned by this farm. Mod state is shown separately; these settings do not measure performance or record an upgrade payment.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.powertrainUpgrade.tableTitle", "Owned motor selections")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.powertrainUpgrade.vehicle", "Vehicle") },
            { key: "power", label: tOr("companionPage.powertrainUpgrade.power", "Engine power choice") },
            { key: "speed", label: tOr("companionPage.powertrainUpgrade.speed", "Top speed choice") },
            { key: "modState", label: tOr("companionPage.powertrainUpgrade.modState", "Mod state") },
            { key: "cap", label: tOr("companionPage.powertrainUpgrade.cap", "Speed cap") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              power: selected(row.powerFactor),
              speed: selected(row.speedFactor),
              modState: row.modStateMatched
                ? tOr("companionPage.powertrainUpgrade.modMatched", "Levels matched")
                : tOr("companionPage.powertrainUpgrade.modUnverified", "Not observed"),
              cap: row.speedWasCapped ? tOr("companionPage.powertrainUpgrade.capped", "160 km/h cap") : "—",
            },
          }))}
          empty={tOr("companionPage.powertrainUpgrade.empty", "No owned motor has readable Powertrain Upgrade settings yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.powertrainUpgrade.truncated", "Only the first owned motors are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
