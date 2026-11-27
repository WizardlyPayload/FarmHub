import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.fillLevelLimiter";
type LimitRow = {
  farmId?: number; vehicleId?: string; vehicle?: string;
  fillUnitIndex?: number; fillUnitTitle?: string; limit?: number;
  capacity?: number; unitText?: string;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<LimitRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "vehicles", label: tOr(`${K}.vehicles`, "Owned vehicles with custom limits"), value: formatNumber(farmData.vehicleCount, 0) },
    { key: "limits", label: tOr(`${K}.limits`, "Custom fill-unit limits"), value: formatNumber(farmData.customLimitCount, 0) },
  ] : [];
  const quantity = (value: number | undefined, suffix?: string) => num(value) === null ? "—"
    : `${formatNumber(value, 1)}${suffix ? ` ${suffix}` : ""}`;
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Configured fill-unit limits below native capacity on this farm's vehicles. A limit is not a measured fill level, rejected load or crop loss.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Owned vehicle fill limits")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
            { key: "unit", label: tOr(`${K}.unit`, "Fill unit") },
            { key: "limit", label: tOr(`${K}.limit`, "Configured limit"), align: "end" },
            { key: "capacity", label: tOr(`${K}.capacity`, "Native capacity"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.vehicleId || index}:${row.fillUnitIndex || index}`,
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              unit: row.fillUnitTitle || String(row.fillUnitIndex || "—"),
              limit: quantity(row.limit, row.unitText),
              capacity: quantity(row.capacity, row.unitText),
            },
          }))}
          empty={tOr(`${K}.empty`, "No owned vehicle has a readable custom fill-unit limit.")}
        />
        {page?.coverage === "truncated" || page?.coverage === "partial" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some vehicle fill limits were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
