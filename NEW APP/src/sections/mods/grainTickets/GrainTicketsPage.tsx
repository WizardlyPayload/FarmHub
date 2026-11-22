import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Ticket = {
  id?: number;
  farmId?: number;
  year?: number;
  period?: number;
  day?: number;
  crop?: string;
  station?: string;
  liters?: number;
  gross?: number;
  deductionAmount?: number;
  net?: number;
  grade?: string;
  moisturePercent?: number;
  moistureStatus?: string;
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const rows = asList<Ticket>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "count", label: tOr("companionPage.grainTickets.count", "Tickets"), value: formatNumber(farmData.ticketCount, 0) },
    { key: "gross", label: tOr("companionPage.grainTickets.gross", "Recorded gross"), value: money(farmData.gross) },
    { key: "deductions", label: tOr("companionPage.grainTickets.deductions", "Recorded deductions"), value: money(farmData.deductions) },
    { key: "net", label: tOr("companionPage.grainTickets.net", "Recorded net"), value: money(farmData.net) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.grainTickets.lead", "Completed delivery tickets recorded for this farm in the current crop year. The mod keeps a bounded history and clears it at the next crop year; these figures are not a full sales ledger.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.grainTickets.tableTitle", "Grain delivery tickets")}>
        <ModTable
          columns={[
            { key: "crop", label: tOr("companionPage.grainTickets.crop", "Crop") },
            { key: "station", label: tOr("companionPage.grainTickets.station", "Sell point") },
            { key: "date", label: tOr("companionPage.grainTickets.date", "Date") },
            { key: "liters", label: tOr("companionPage.grainTickets.liters", "Quantity"), align: "end" },
            { key: "grade", label: tOr("companionPage.grainTickets.grade", "Grade") },
            { key: "deduction", label: tOr("companionPage.grainTickets.deduction", "Deduction"), align: "end" },
            { key: "net", label: tOr("companionPage.grainTickets.net", "Recorded net"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: String(row.id ?? index),
            cells: {
              crop: row.crop || "—",
              station: row.station || "—",
              date: num(row.year) != null && num(row.period) != null && num(row.day) != null
                ? tOr("companionPage.grainTickets.dateValue", "Y{{year}} / P{{period}} / D{{day}}", {
                  year: formatNumber(row.year, 0), period: formatNumber(row.period, 0), day: formatNumber(row.day, 0),
                }) : "—",
              liters: `${formatNumber(row.liters, 0)} L`,
              grade: row.grade || "—",
              deduction: money(row.deductionAmount),
              net: money(row.net),
            },
          }))}
          empty={page?.coverage === "truncated" || page?.readState === "partial"
            ? tOr("companionPage.grainTickets.truncated", "This table may not show every ticket.")
            : tOr("companionPage.grainTickets.empty", "No grain delivery tickets recorded for this farm in the current crop year.")}
        />
        {rows.length > 0 && page?.coverage !== "complete" ? <ModEmpty>{tOr("companionPage.grainTickets.truncated", "This table may not show every ticket.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
