import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.productionAdvisorAlerts";
type AlertRow = {
  farmId?: number; kind?: "product" | "sowing"; fillTypeIndex?: number;
  title?: string; threshold?: number; enabled?: boolean; mode?: number;
  farmlandId?: number; fruitTypeName?: string;
};

function alertMode(value: number | undefined): string {
  return value === 1 ? tOr(`${K}.bestMonth`, "Best price month")
    : value === 2 ? tOr(`${K}.greenValue`, "Green value") : "—";
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const formatMoney = useMoney();
  const rows = asList<AlertRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const products = rows.filter((row) => row.kind === "product");
  const sowing = rows.filter((row) => row.kind === "sowing");
  const hasReading = page?.readState === "ok" || page?.readState === "partial";
  const tiles: ModStatTile[] = hasReading && farmData && num(farmData.configuredCount) != null ? [
    { key: "configured", label: tOr(`${K}.configured`, "Verified configured alerts"),
      value: formatNumber(farmData.configuredCount, 0) },
    { key: "enabled", label: tOr(`${K}.enabled`, "Enabled product alerts"),
      value: formatNumber(farmData.enabledProductCount, 0) },
    { key: "sowing", label: tOr(`${K}.sowing`, "Owned-field sowing reminders"),
      value: formatNumber(farmData.sowingCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Configured Production Advisor alerts for this farm. Product thresholds apply to the estimated current value of stock; a reminder does not prove a sale or sowing job happened.")}>
      <ModStatTiles tiles={tiles} />
      {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`,
        "Only the first part of the alert registers was scanned or listed. Counts are incomplete.")}</ModEmpty> : null}
      {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`,
        "Unreadable alerts or field reminders without a matching current owner were withheld.")}</ModEmpty> : null}
      <Card title={tOr(`${K}.productTitle`, "Product value alerts")}>
        <ModTable
          columns={[
            { key: "product", label: tOr(`${K}.product`, "Product") },
            { key: "threshold", label: tOr(`${K}.threshold`, "Minimum stock value"), align: "end" },
            { key: "mode", label: tOr(`${K}.mode`, "Trigger mode") },
            { key: "enabled", label: tOr(`${K}.status`, "Status") },
          ]}
          rows={products.map((row, index) => ({
            key: String(row.fillTypeIndex ?? index),
            cells: {
              product: row.title || `#${row.fillTypeIndex ?? "?"}`,
              threshold: num(row.threshold) == null ? "—" : formatMoney(row.threshold),
              mode: alertMode(row.mode),
              enabled: row.enabled ? tOr(`${K}.on`, "On") : tOr(`${K}.off`, "Off"),
            },
          }))}
          empty={tOr(`${K}.productEmpty`, "No verified product alert is configured for this farm in the scanned register.")}
        />
      </Card>
      <Card title={tOr(`${K}.sowingTitle`, "Owned-field sowing reminders")}>
        <ModTable
          columns={[
            { key: "field", label: tOr(`${K}.field`, "Farmland") },
            { key: "crop", label: tOr(`${K}.crop`, "Planned crop") },
          ]}
          rows={sowing.map((row, index) => ({
            key: String(row.farmlandId ?? index),
            cells: {
              field: `#${row.farmlandId ?? "?"}`,
              crop: row.fruitTypeName || "—",
            },
          }))}
          empty={tOr(`${K}.sowingEmpty`, "No verified reminder is configured on currently owned farmland in the scanned register.")}
        />
      </Card>
    </ModPage>
  );
}
