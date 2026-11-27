import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type DemandRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  targetCrop?: string;
  adjustMode?: "NONE" | "TARGET_MINUS" | "MAX_APPLICATION";
  adjustKgNPerHa?: number;
  source?: "live" | "saved";
};

function adjustment(row: DemandRow): string {
  const amount = num(row.adjustKgNPerHa);
  if (row.adjustMode === "TARGET_MINUS" && amount != null) {
    return `${tOr("companionPage.organicDemand.targetMinus", "Target minus")} ${formatNumber(amount, 0)} kg N/ha`;
  }
  if (row.adjustMode === "MAX_APPLICATION" && amount != null) {
    return `${tOr("companionPage.organicDemand.maxApplication", "Maximum application")} ${formatNumber(amount, 0)} kg N/ha`;
  }
  return tOr("companionPage.organicDemand.normal", "Normal");
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<DemandRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "configured", label: tOr("companionPage.organicDemand.configured", "Owned applicators with choices"), value: formatNumber(farmData.configuredCount, 0) },
    { key: "saved", label: tOr("companionPage.organicDemand.savedOnly", "Saved choice only"), value: formatNumber(farmData.savedOnlyCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.organicDemand.lead", "Target crop and nitrogen adjustment selected on this farm's organic applicators. These are settings, not applied nitrogen or a yield result.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.organicDemand.tableTitle", "Owned applicator choices")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.organicDemand.vehicle", "Applicator") },
            { key: "crop", label: tOr("companionPage.organicDemand.crop", "Target crop") },
            { key: "adjustment", label: tOr("companionPage.organicDemand.adjustment", "Nitrogen adjustment") },
            { key: "source", label: tOr("companionPage.organicDemand.source", "Reading") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              crop: row.targetCrop || tOr("companionPage.organicDemand.automatic", "Automatic"),
              adjustment: adjustment(row),
              source: row.source === "live"
                ? tOr("companionPage.organicDemand.live", "Live choice")
                : tOr("companionPage.organicDemand.saved", "Saved choice; live state unverified"),
            },
          }))}
          empty={tOr("companionPage.organicDemand.empty", "No owned applicator has a nondefault target or nitrogen adjustment yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.organicDemand.truncated", "Only the first configured applicators are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
