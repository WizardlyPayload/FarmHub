import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Row = {
  farmId?: number;
  source?: string;
  product?: string;
  kind?: "STORE" | "TARGET";
  destination?: string;
  level?: "PRIMARY" | "SECONDARY" | "REST" | "NEVER";
  limitLitres?: number;
  serverMode?: "KEEP" | "DIRECT_SELL" | "AUTO_DELIVER" | "STORE";
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Row>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "productions", label: tOr("companionPage.productionRevamp.productions", "Owned productions"), value: formatNumber(farmData.productionCount, 0) },
    { key: "store", label: tOr("companionPage.productionRevamp.storeCount", "Saved Store flags"), value: formatNumber(farmData.storeCount, 0) },
    { key: "getterStore", label: tOr("companionPage.productionRevamp.getterStoreCount", "Server getter: Store"), value: formatNumber(farmData.getterStoreCount, 0) },
    { key: "targets", label: tOr("companionPage.productionRevamp.targetCount", "Set targets"), value: formatNumber(farmData.targetCount, 0) },
  ] : [];
  const levelLabel = (level?: Row["level"]) => {
    if (level === "PRIMARY") return tOr("companionPage.productionRevamp.primary", "Primary");
    if (level === "SECONDARY") return tOr("companionPage.productionRevamp.secondary", "Secondary");
    if (level === "NEVER") return tOr("companionPage.productionRevamp.never", "Never");
    return tOr("companionPage.productionRevamp.rest", "Rest");
  };
  const modeLabel = (mode?: Row["serverMode"]) => {
    if (mode === "KEEP") return tOr("companionPage.productionRevamp.keep", "Keep");
    if (mode === "DIRECT_SELL") return tOr("companionPage.productionRevamp.selling", "Selling");
    if (mode === "AUTO_DELIVER") return tOr("companionPage.productionRevamp.distributing", "Distributing");
    if (mode === "STORE") return tOr("companionPage.productionRevamp.store", "Store");
    return tOr("companionPage.productionRevamp.unknown", "Unknown");
  };
  return (
    <ModPage entry={entry} lead={tOr("companionPage.productionRevamp.lead", "Production Revamp's saved output flags and server getter values for productions you own. The game menu may disagree when mods replace hooks; these settings do not prove output movement or delivery.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.productionRevamp.tableTitle", "Output settings")}>
        <ModTable
          columns={[
            { key: "source", label: tOr("companionPage.productionRevamp.source", "Production") },
            { key: "product", label: tOr("companionPage.productionRevamp.product", "Output") },
            { key: "setting", label: tOr("companionPage.productionRevamp.setting", "Setting") },
            { key: "destination", label: tOr("companionPage.productionRevamp.destination", "Destination") },
            { key: "limit", label: tOr("companionPage.productionRevamp.limit", "Stock limit") },
            { key: "state", label: tOr("companionPage.productionRevamp.state", "Server getter mode") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.source}-${row.product}-${row.kind}-${row.destination ?? index}`,
            cells: {
              source: row.source || "—",
              product: row.product || "—",
              setting: row.kind === "STORE"
                ? tOr("companionPage.productionRevamp.store", "Store") : levelLabel(row.level),
              destination: row.kind === "TARGET" ? row.destination || "—" : "—",
              limit: row.kind === "TARGET"
                ? num(row.limitLitres) == null
                  ? tOr("companionPage.productionRevamp.unlimited", "No limit")
                  : `${formatNumber(row.limitLitres, 0)} L`
                : "—",
              state: modeLabel(row.serverMode),
            },
          }))}
          empty={tOr("companionPage.productionRevamp.empty", "No owned Production Revamp output setting is readable yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.productionRevamp.truncated", "Only part of the output settings is listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.productionRevamp.partial", "Some saved targets or outputs could not be matched to live owned productions.")}</ModEmpty> : null}
        {page?.reason === "store-mode-mismatch" ? <ModEmpty>{tOr("companionPage.productionRevamp.modeMismatch", "A saved Store flag disagrees with the server's effective output mode. Check the in-game menu and selected mods before relying on this setting.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
