import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.toggleableSilageAdditive";
type Row = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  additiveUsageEnabled?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "supported", label: tOr(`${K}.supported`, "Owned equipment with additive control"), value: formatNumber(farmData.supportedVehicleCount, 0) },
    { key: "disabled", label: tOr(`${K}.disabled`, "Additive usage switched off"), value: formatNumber(farmData.disabledVehicleCount, 0) },
  ] : [];
  const state = (value: boolean | undefined) => value === undefined ? "—"
    : value ? tOr(`${K}.on`, "On") : tOr(`${K}.off`, "Off");
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current silage-additive switch on owned supported equipment. This is a control setting, not additive used or crop worked. Save/reload persistence has not been verified for this mod version.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Owned equipment additive switches")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Equipment") },
          { key: "state", label: tOr(`${K}.state`, "Additive usage") },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: { vehicle: row.vehicle || row.vehicleId || "—",
            state: state(row.additiveUsageEnabled) },
        }))} empty={tOr(`${K}.empty`, "No owned equipment has readable additive-switch state.")} />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some equipment states were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
