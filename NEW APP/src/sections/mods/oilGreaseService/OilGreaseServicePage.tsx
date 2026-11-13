import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Level = { enabled?: boolean; levelLitres?: number; capacityLitres?: number; percent?: number; serviceNeeded?: boolean };
type VehicleRow = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  oil?: Level; grease?: Level; serviceNeeded?: boolean;
};
const K = "companionPage.oilGreaseService";

function levelText(value?: Level): string {
  if (!value || value.enabled !== true) return tOr(`${K}.off`, "Off");
  return `${formatNumber(value.levelLitres, 1)} / ${formatNumber(value.capacityLitres, 1)} L (${formatNumber(value.percent, 1)}%)`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<VehicleRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const complete = page?.coverage === "complete";
  const tiles: ModStatTile[] = complete && farmData ? [
    { key: "vehicles", label: tOr(`${K}.monitored`, "Owned vehicles monitored"), value: formatNumber(farmData.monitoredVehicles, 0) },
    { key: "service", label: tOr(`${K}.serviceNeeded`, "Below full level"), value: formatNumber(farmData.serviceNeeded, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Check which owned vehicles need oil or grease before their next job. These are the Oil And Grease Service mod's live reservoir levels, separate from fuel. A low level is a service prompt, not a completed repair or recorded expense.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Owned vehicle oil and grease")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
            { key: "oil", label: tOr(`${K}.oil`, "Oil") },
            { key: "grease", label: tOr(`${K}.grease`, "Grease") },
            { key: "action", label: tOr(`${K}.action`, "Service check") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              oil: levelText(row.oil),
              grease: levelText(row.grease),
              action: row.serviceNeeded
                ? tOr(`${K}.belowFull`, "Below full; check workshop")
                : tOr(`${K}.full`, "Full"),
            },
          }))}
          empty={tOr(`${K}.empty`, "No readable oil and grease levels are available for owned vehicles.")}
        />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr(`${K}.incomplete`, "Some owned vehicle levels are unavailable; fleet totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
