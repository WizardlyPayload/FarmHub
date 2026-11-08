import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.hydraulicSuspension";
type Row = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  kind?: string; mode?: string; requestedOffsetCm?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" && farmData.enabledCount != null ? [
    { key: "enabled", label: tOr(`${K}.enabled`, "Owned vehicles with suspension enabled"), value: formatNumber(farmData.enabledCount, 0) },
    { key: "manual", label: tOr(`${K}.manual`, "Manual mode"), value: formatNumber(farmData.manualCount, 0) },
    { key: "locked", label: tOr(`${K}.locked`, "Locked or ride control off"), value: formatNumber(farmData.lockedCount, 0) },
  ] : [];
  const kindLabel = (value?: string) => tOr(`${K}.kind.${value || "unknown"}`, value || "—");
  const modeLabel = (value?: string) => tOr(`${K}.mode.${value || "unknown"}`, value || "—");
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current Hydraulic Suspension System settings on this farm's enabled vehicles. Manual offset is the requested setting, not measured ride height or proof of physical damping.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Vehicle suspension settings")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
          { key: "kind", label: tOr(`${K}.kind`, "System") },
          { key: "mode", label: tOr(`${K}.mode`, "Mode") },
          { key: "offset", label: tOr(`${K}.offset`, "Requested manual offset"), align: "end" },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: {
            vehicle: row.vehicle || "—",
            kind: kindLabel(row.kind),
            mode: modeLabel(row.mode),
            offset: row.requestedOffsetCm == null ? "—" : `${formatNumber(row.requestedOffsetCm, 1)} cm`,
          },
        }))} empty={tOr(`${K}.empty`, "No owned vehicle with readable enabled suspension state is available.")} />
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An enabled vehicle had ambiguous identity or unreadable state and was withheld; totals are withheld.")}</ModEmpty> : null}
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned vehicle list is shown; totals are withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
