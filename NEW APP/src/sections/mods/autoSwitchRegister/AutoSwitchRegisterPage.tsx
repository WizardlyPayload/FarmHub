import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useMoney, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type RegisterRow = {
  kind?: "weighing" | "sale";
  farmId?: number;
  year?: number;
  period?: number;
  dayInPeriod?: number;
  minutes?: number;
  vehicle?: string;
  site?: string;
  driver?: string;
  fillType?: string;
  loadKg?: number;
  totalKg?: number;
  litres?: number;
  money?: number;
  pending?: number;
  paid?: boolean;
};

function date(row: RegisterRow): string {
  const year = num(row.year);
  const period = num(row.period);
  const day = num(row.dayInPeriod);
  const minutes = num(row.minutes);
  if (year == null || period == null || day == null || minutes == null) return "—";
  return `${tOr("companionPage.autoSwitchRegister.year", "Y")}${formatNumber(year, 0)} `
    + `${tOr("companionPage.autoSwitchRegister.period", "P")}${formatNumber(period, 0)} `
    + `${tOr("companionPage.autoSwitchRegister.day", "D")}${formatNumber(day, 0)} `
    + `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const money = useMoney();
  const complete = page?.coverage === "complete";
  const rows = complete || page?.coverage === "truncated"
    ? asList<RegisterRow>(page?.rows).filter((row) => num(row.farmId) === farmId) : [];
  const weighings = rows.filter((row) => row.kind === "weighing");
  const sales = rows.filter((row) => row.kind === "sale");
  const weighingCount = complete ? num(farmData?.weighingCount) : null;
  const saleCount = complete ? num(farmData?.saleCount) : null;
  const tiles: ModStatTile[] = [];
  if (weighingCount != null) tiles.push({ key: "weighings", label: tOr("companionPage.autoSwitchRegister.weighings", "Recorded weighings"), value: formatNumber(weighingCount, 0) });
  if (saleCount != null) tiles.push({ key: "sales", label: tOr("companionPage.autoSwitchRegister.sales", "Recorded sales"), value: formatNumber(saleCount, 0) });
  const empty = complete && page?.reason === "no-farm-records"
    ? tOr("companionPage.autoSwitchRegister.empty", "The live register has no entries for this farm.")
    : tOr("companionPage.autoSwitchRegister.unavailable", "No complete farm register is available; no totals are asserted.");
  const weighingEmpty = complete && weighingCount != null
    ? tOr("companionPage.autoSwitchRegister.noWeighings", "No weighings recorded for this farm.") : empty;
  const saleEmpty = complete && saleCount != null
    ? tOr("companionPage.autoSwitchRegister.noSales", "No sales recorded for this farm.") : empty;

  return (
    <ModPage entry={entry} lead={tOr("companionPage.autoSwitchRegister.lead", "AutoSwitch records weighbridge readings and sales for this farm. A weighing is not a delivery, and recorded sales also appear in native finance data; do not add these amounts to farm cash.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.autoSwitchRegister.weighingTitle", "Weighbridge readings")}>
        <ModTable
          columns={[
            { key: "date", label: tOr("companionPage.autoSwitchRegister.date", "Game date") },
            { key: "site", label: tOr("companionPage.autoSwitchRegister.site", "Site") },
            { key: "vehicle", label: tOr("companionPage.autoSwitchRegister.vehicle", "Vehicle") },
            { key: "fill", label: tOr("companionPage.autoSwitchRegister.fill", "Load type") },
            { key: "load", label: tOr("companionPage.autoSwitchRegister.load", "Load"), align: "end" },
            { key: "total", label: tOr("companionPage.autoSwitchRegister.total", "Gross weight"), align: "end" },
          ]}
          rows={weighings.map((row, index) => ({
            key: `w:${index}`,
            cells: {
              date: date(row), site: row.site || "—", vehicle: row.vehicle || "—",
              fill: row.fillType || "—",
              load: num(row.loadKg) == null ? "—" : `${formatNumber(row.loadKg, 1)} kg`,
              total: num(row.totalKg) == null ? "—" : `${formatNumber(row.totalKg, 1)} kg`,
            },
          }))}
          empty={weighingEmpty}
        />
      </Card>
      <Card title={tOr("companionPage.autoSwitchRegister.saleTitle", "Sale register")}>
        <ModTable
          columns={[
            { key: "date", label: tOr("companionPage.autoSwitchRegister.date", "Game date") },
            { key: "site", label: tOr("companionPage.autoSwitchRegister.site", "Site") },
            { key: "fill", label: tOr("companionPage.autoSwitchRegister.fill", "Load type") },
            { key: "volume", label: tOr("companionPage.autoSwitchRegister.volume", "Volume"), align: "end" },
            { key: "amount", label: tOr("companionPage.autoSwitchRegister.amount", "Register amount"), align: "end" },
            { key: "status", label: tOr("companionPage.autoSwitchRegister.status", "Status") },
          ]}
          rows={sales.map((row, index) => ({
            key: `s:${index}`,
            cells: {
              date: date(row), site: row.site || "—", fill: row.fillType || "—",
              volume: num(row.litres) == null ? "—" : `${formatNumber(row.litres, 0)} L`,
              amount: num(row.money) == null ? "—" : money(row.money as number),
              status: row.paid ? tOr("companionPage.autoSwitchRegister.paid", "Marked paid")
                : num(row.pending) != null ? tOr("companionPage.autoSwitchRegister.pending", "Pending")
                  : tOr("companionPage.autoSwitchRegister.recorded", "Recorded"),
            },
          }))}
          empty={saleEmpty}
        />
      </Card>
      {page?.coverage === "partial" ? (
        <ModEmpty>{tOr("companionPage.autoSwitchRegister.partial", "Register entries were malformed; readings and totals are withheld.")}</ModEmpty>
      ) : null}
      {page?.coverage === "truncated" ? (
        <ModEmpty>{tOr("companionPage.autoSwitchRegister.truncated", "The latest 60 readings of each type are shown; full totals are withheld.")}</ModEmpty>
      ) : null}
    </ModPage>
  );
}
