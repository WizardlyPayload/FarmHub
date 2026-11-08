import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.vehicleAnchor";
type AnchorRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  applied?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<AnchorRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "supported", label: tOr(`${K}.supported`, "Supported owned vehicles"), value: formatNumber(farmData.supportedCount, 0) },
    { key: "selected", label: tOr(`${K}.selected`, "Anchor selected"), value: formatNumber(farmData.anchoredCount, 0) },
    { key: "applied", label: tOr(`${K}.applied`, "Joint applied now"), value: formatNumber(farmData.appliedCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Saved anchor choices and current joint state on vehicles this farm owns. A selected anchor can await physics application; neither state proves field work.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Selected vehicle anchors")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
          { key: "joint", label: tOr(`${K}.joint`, "Joint now") },
        ]} rows={rows.map((row, index) => ({
          key: row.vehicleId || String(index),
          cells: {
            vehicle: row.vehicle || tOr(`${K}.unnamed`, "Unnamed vehicle"),
            joint: row.applied === true ? tOr(`${K}.active`, "Applied") : tOr(`${K}.pending`, "Pending"),
          },
        }))} empty={tOr(`${K}.empty`, "No selected anchor is readable on an owned vehicle.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned vehicle anchor state is shown.")}</ModEmpty> : null}
        {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An anchor had an ambiguous vehicle ID or unreadable state and was withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
