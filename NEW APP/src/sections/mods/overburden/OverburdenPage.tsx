import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Mine = {
  farmId?: number; id?: string; name?: string; areaSquareMeters?: number;
  coverDepthMeters?: number; overburden?: string; payMaterial?: string;
  status?: string; remainingMinutes?: number; recordedSurveyCost?: number;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const mines = asList<Mine>(page?.mines).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData && page?.coverage === "complete" ? [
    { key: "count", label: tOr("companionPage.overburden.count", "Owned surveys"), value: formatNumber(farmData.mineCount, 0) },
    { key: "ready", label: tOr("companionPage.overburden.readyCount", "Ready mines"), value: formatNumber(farmData.readyCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.overburden.lead", "Current farm-owned Overburden mine surveys loaded in this single-player world. The recorded survey cost and chosen materials do not show material extracted or sale income.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.overburden.tableTitle", "Surveyed mines")}>
        <ModTable
          columns={[
            { key: "mine", label: tOr("companionPage.overburden.mine", "Mine") },
            { key: "status", label: tOr("companionPage.overburden.status", "Survey status") },
            { key: "area", label: tOr("companionPage.overburden.area", "Survey area (m²)"), align: "end" },
            { key: "depth", label: tOr("companionPage.overburden.depth", "Cover depth (m)"), align: "end" },
            { key: "materials", label: tOr("companionPage.overburden.materials", "Overburden / pay") },
            { key: "remaining", label: tOr("companionPage.overburden.remaining", "Survey left (min)"), align: "end" },
            { key: "cost", label: tOr("companionPage.overburden.cost", "Recorded survey cost"), align: "end" },
          ]}
          rows={mines.map((row, index) => ({
            key: row.id || String(index),
            cells: {
              mine: row.name || row.id || "—",
              status: row.status === "ready"
                ? tOr("companionPage.overburden.ready", "Ready")
                : tOr("companionPage.overburden.surveying", "Surveying"),
              area: formatNumber(row.areaSquareMeters, 1),
              depth: formatNumber(row.coverDepthMeters, 1),
              materials: [row.overburden, row.payMaterial].filter(Boolean).join(" / ") || "—",
              remaining: row.status === "ready" ? "—" : formatNumber(row.remainingMinutes, 1),
              cost: money(row.recordedSurveyCost),
            },
          }))}
          empty={tOr("companionPage.overburden.empty", "No owned mine survey is loaded for this farm.")}
        />
        <ModEmpty>{tOr("companionPage.overburden.note", "Area and depth are saved survey geometry. TerraFarm digging and extracted material are separate gameplay and are not measured here.")}</ModEmpty>
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.overburden.truncated", "Only part of the mine register was scanned; summary counts are withheld.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.overburden.partial", "Some owned mine records could not be verified; summary counts are withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
