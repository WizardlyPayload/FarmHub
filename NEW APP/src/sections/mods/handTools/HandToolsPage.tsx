import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type ToolRow = {
  farmId?: number;
  vehicleId?: string;
  tool?: string;
  stuck?: boolean;
  activeModes?: string[];
  pickerBoosted?: boolean;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<ToolRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const complete = page?.coverage === "complete";
  const yes = tOr("companionPage.handTools.yes", "Yes");
  const no = tOr("companionPage.handTools.no", "No");
  const none = tOr("companionPage.handTools.none", "None");
  const modeLabel = (id: string) => id === "fillTypeConverter"
    ? tOr("companionPage.handTools.mode.converter", "Fill converter")
    : id === "tedding" ? tOr("companionPage.handTools.mode.tedding", "Tedding") : id;
  const tiles: ModStatTile[] = farmData && complete ? [
    { key: "tools", label: tOr("companionPage.handTools.tools", "Owned hand tools"), value: formatNumber(farmData.handToolCount, 0) },
    { key: "stuck", label: tOr("companionPage.handTools.stuckCount", "Placed in ground"), value: formatNumber(farmData.stuckCount, 0) },
    { key: "boosted", label: tOr("companionPage.handTools.boosted", "Boosted bale pickers"), value: formatNumber(farmData.boostedPickerCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.handTools.lead", "Current mod-specific state on this farm's hand-tool vehicles. Active modes are saveable switches; these readings do not prove completed tool work or bale handling.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.handTools.table", "Owned hand-tool states")}>
        <ModTable
          columns={[
            { key: "tool", label: tOr("companionPage.handTools.tool", "Tool") },
            { key: "stuck", label: tOr("companionPage.handTools.stuck", "Placed in ground") },
            { key: "modes", label: tOr("companionPage.handTools.modes", "Active saved modes") },
            { key: "picker", label: tOr("companionPage.handTools.picker", "Picker boost") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              tool: row.tool || "—",
              stuck: row.stuck == null ? "—" : row.stuck ? yes : no,
              modes: Array.isArray(row.activeModes) && row.activeModes.length
                ? row.activeModes.map(modeLabel).join(", ") : none,
              picker: row.pickerBoosted == null ? "—" : row.pickerBoosted ? yes : no,
            },
          }))}
          empty={tOr("companionPage.handTools.empty", "No readable owned Hand Tools vehicle is available yet.")}
        />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr("companionPage.handTools.partial", "Some tool state was unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
