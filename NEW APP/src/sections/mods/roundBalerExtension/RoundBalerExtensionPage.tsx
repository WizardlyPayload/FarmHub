import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type BalerRow = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  dropMode?: number;
  wrapperActive?: boolean;
};

function dropMode(mode: unknown): string {
  if (num(mode) === 1) return tOr("companionPage.roundBalerExtension.manual", "Manual");
  if (num(mode) === 2) return tOr("companionPage.roundBalerExtension.automatic", "Automatic");
  if (num(mode) === 3) return tOr("companionPage.roundBalerExtension.collect", "Collect");
  return "—";
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<BalerRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "wrappers", label: tOr("companionPage.roundBalerExtension.wrappers", "Owned wrappers"), value: formatNumber(farmData.wrapperCount, 0) },
    { key: "collect", label: tOr("companionPage.roundBalerExtension.collectCount", "In collect mode"), value: formatNumber(farmData.collectModeCount, 0) },
    { key: "inactive", label: tOr("companionPage.roundBalerExtension.inactiveCount", "Wrappers off"), value: formatNumber(farmData.inactiveCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.roundBalerExtension.lead", "Current drop mode and wrapper switch on compatible balers owned by this farm. Collect mode is an operating choice, not a lifetime bale count.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.roundBalerExtension.tableTitle", "Owned baler wrappers")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.roundBalerExtension.vehicle", "Baler") },
            { key: "mode", label: tOr("companionPage.roundBalerExtension.mode", "Drop mode") },
            { key: "active", label: tOr("companionPage.roundBalerExtension.active", "Wrapper") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.vehicleId || String(index),
            cells: {
              vehicle: row.vehicle || "—",
              mode: dropMode(row.dropMode),
              active: row.wrapperActive === true
                ? tOr("companionPage.roundBalerExtension.on", "On")
                : tOr("companionPage.roundBalerExtension.off", "Off"),
            },
          }))}
          empty={tOr("companionPage.roundBalerExtension.empty", "No compatible owned baler wrapper has mod state yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.roundBalerExtension.truncated", "Only the first compatible balers are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
