import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.agriculturalFinancialSystem";
type Entry = {
  farmId?: number; id?: string; kind?: string; status?: string; instrument?: string;
  description?: string; counterparty?: string; amount?: number; balance?: number; dueDay?: number;
};

function label(key: string): string {
  const labels: Record<string, string> = {
    payable: "To pay", receivable: "To receive", open: "Open", overdue: "Overdue",
    pending: "Needs details", currentAccount: "Current account",
    promissoryNote: "Promissory note", cheque: "Cheque", unknown: "Unknown",
  };
  return tOr(`${K}.label.${key}`, labels[key] || key);
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Entry>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const complete = page?.coverage === "complete";
  const tiles: ModStatTile[] = farmData ? [
    { key: "bank", label: tOr(`${K}.bank`, "Separate mod bank balance"), value: money(farmData.bankBalance) },
    { key: "entries", label: tOr(`${K}.entries`, "Valid records read"), value: formatNumber(farmData.entryCount, 0) },
    { key: "overdue", label: tOr(`${K}.overdue`, "Overdue records read"), value: formatNumber(farmData.overdueCount, 0) },
    ...(complete ? [
      { key: "payable", label: tOr(`${K}.payable`, "Remaining to pay"), value: money(farmData.payableBalance) },
      { key: "receivable", label: tOr(`${K}.receivable`, "Remaining to receive"), value: money(farmData.receivableBalance) },
    ] : []),
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Agricultural Financial System's separate bank and unsettled farm ledger. The bank balance is separate from game cash; receivables are not cash received, and due game days are not proof of payment. This does not combine obligations from other finance mods.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.tableTitle`, "Unsettled payables and receivables")}>
        <ModTable columns={[
          { key: "kind", label: tOr(`${K}.kind`, "Direction / state") },
          { key: "description", label: tOr(`${K}.description`, "What / who") },
          { key: "instrument", label: tOr(`${K}.instrument`, "Instrument") },
          { key: "due", label: tOr(`${K}.due`, "Due game day"), align: "end" },
          { key: "balance", label: tOr(`${K}.balance`, "Remaining"), align: "end" },
        ]} rows={rows.map((r, i) => ({ key: r.id || String(i), cells: {
          kind: `${label(r.kind || "unknown")} / ${label(r.status || "unknown")}`,
          description: `${r.description || "—"}${r.counterparty ? ` / ${r.counterparty}` : ""}`,
          instrument: label(r.instrument || "unknown"),
          due: num(r.dueDay) == null ? "—" : formatNumber(r.dueDay, 0),
          balance: money(r.balance),
        } }))} empty={tOr(`${K}.empty`, "No unsettled farm ledger records are available.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "The register was capped; totals are withheld.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Invalid records were withheld; totals are unavailable.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
