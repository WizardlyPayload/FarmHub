import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber,
  useCompanionPage, useUnitPrice, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.factoryContracts";
type Contract = {
  id?: number; factoryId?: string; fillType?: string; fillTypeIndex?: number;
  status?: string; totalLiters?: number; deliveredLiters?: number;
  remainingLiters?: number; lockedPrice?: number;
};

function statusLabel(status?: string): string {
  const names: Record<string, [string, string]> = {
    activo: ["active", "Active"],
    cumplido: ["fulfilled", "Fulfilled"],
    incumplido: ["defaulted", "Defaulted"],
    cancelado: ["cancelled", "Cancelled"],
    cumplidoParcial: ["partialStatus", "Partially fulfilled"],
  };
  const known = names[status || ""];
  return known ? tOr(`${K}.${known[0]}`, known[1]) : (status || "—");
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const unitPrice = useUnitPrice();
  const rows = asList<Contract>(page?.contracts);
  const tiles: ModStatTile[] = farmData ? [
    { key: "signed", label: tOr(`${K}.signed`, "Signed contracts"), value: formatNumber(farmData.signedCount, 0) },
    { key: "active", label: tOr(`${K}.activeCount`, "Active contracts"), value: formatNumber(farmData.activeCount, 0) },
    { key: "day", label: tOr(`${K}.modDay`, "Contract day"), value: formatNumber(farmData.currentDay, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`,
      "Signed factory obligations for this farm from the mod's loaded server register. Shared offers, future payouts and native sales are excluded.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Signed factory contracts")}>
        <ModTable
          columns={[
            { key: "id", label: tOr(`${K}.id`, "Contract") },
            { key: "factory", label: tOr(`${K}.factory`, "Factory") },
            { key: "crop", label: tOr(`${K}.product`, "Product") },
            { key: "status", label: tOr(`${K}.status`, "Status") },
            { key: "target", label: tOr(`${K}.target`, "Target (L)"), align: "end" },
            { key: "delivered", label: tOr(`${K}.delivered`, "Delivered (L)"), align: "end" },
            { key: "remaining", label: tOr(`${K}.remaining`, "Remaining (L)"), align: "end" },
            { key: "price", label: tOr(`${K}.price`, "Locked price / L"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.id ?? index}`,
            cells: {
              id: formatNumber(row.id, 0),
              factory: row.factoryId || "—",
              crop: row.fillType || (row.fillTypeIndex == null ? "—" : `#${formatNumber(row.fillTypeIndex, 0)}`),
              status: statusLabel(row.status),
              target: formatNumber(row.totalLiters, 0),
              delivered: formatNumber(row.deliveredLiters, 0),
              remaining: formatNumber(row.remainingLiters, 0),
              price: row.lockedPrice == null ? "—" : unitPrice(row.lockedPrice),
            },
          }))}
          empty={tOr(`${K}.empty`, "No signed factory contract for this farm was captured.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`,
          "Only part of this farm's contract register is listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`,
          "Some contract values were invalid or unreadable.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
