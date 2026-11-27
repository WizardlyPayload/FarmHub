import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.hydraulicBrokenTrailer";
type Row = {
  farmId?: number; vehicleId?: string; trailer?: string;
  hydraulicCondition?: number; isBroken?: boolean; needsService?: boolean;
  detachHoldActive?: boolean;
};

function condition(value: unknown): string {
  const n = num(value);
  return n === null ? "—" : `${formatNumber(n * 100, 1)}%`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "trailers", label: tOr(`${K}.trailers`, "Owned supported trailers"), value: formatNumber(farmData.supportedTrailerCount, 0) },
    { key: "broken", label: tOr(`${K}.broken`, "Broken hydraulics"), value: formatNumber(farmData.brokenTrailerCount, 0) },
    { key: "service", label: tOr(`${K}.service`, "Service due"), value: formatNumber(farmData.serviceDueCount, 0) },
  ] : [];
  const yesNo = (value: boolean | undefined) => value === undefined ? "—"
    : value ? tOr(`${K}.yes`, "Yes") : tOr(`${K}.no`, "No");
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Current Hydraulic Broken Trailer condition for your tipping trailers. This is separate from base-game vehicle wear; it does not record tip cycles or workshop repairs.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Trailer hydraulic condition")}>
        <ModTable columns={[
          { key: "trailer", label: tOr(`${K}.trailer`, "Trailer") },
          { key: "condition", label: tOr(`${K}.condition`, "Condition"), align: "end" },
          { key: "broken", label: tOr(`${K}.brokenColumn`, "Broken") },
          { key: "service", label: tOr(`${K}.serviceColumn`, "Service due") },
          { key: "hold", label: tOr(`${K}.hold`, "Held raised after detach") },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: {
            trailer: row.trailer || row.vehicleId || "—",
            condition: condition(row.hydraulicCondition),
            broken: yesNo(row.isBroken),
            service: yesNo(row.needsService),
            hold: yesNo(row.detachHoldActive),
          },
        }))} empty={tOr(`${K}.empty`, "No owned trailer has readable Hydraulic Broken Trailer state.")} />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr(`${K}.partial`, "Some trailer readings were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
