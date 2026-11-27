import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type GameDate = { year?: number; period?: number; dayInPeriod?: number };
type FieldRow = {
  farmId?: number;
  fieldId?: number;
  sown?: GameDate;
  crop?: string;
  fertilised?: GameDate;
  fertiliser?: string;
  fertiliserPasses?: number;
  herbicide?: GameDate;
};

function gameDate(value?: GameDate): string {
  const year = num(value?.year);
  const period = num(value?.period);
  const day = num(value?.dayInPeriod);
  if (year == null || period == null || day == null) return "—";
  return `${tOr("companionPage.autoSwitchFieldWork.year", "Y")}${formatNumber(year, 0)} `
    + `${tOr("companionPage.autoSwitchFieldWork.period", "P")}${formatNumber(period, 0)} `
    + `${tOr("companionPage.autoSwitchFieldWork.day", "D")}${formatNumber(day, 0)}`;
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const complete = page?.coverage === "complete" && page?.readState === "ok";
  const rows = asList<FieldRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const count = complete ? num(farmData?.recordedFieldCount) : null;
  const tiles: ModStatTile[] = count == null ? [] : [
    { key: "recorded", label: tOr("companionPage.autoSwitchFieldWork.recorded", "Fields with recorded work"), value: formatNumber(count, 0) },
  ];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.autoSwitchFieldWork.lead", "Last sowing, fertiliser and herbicide passes recorded by AutoSwitch on land this farm owns now. A pass may predate purchase of the field. Dates are recorded after at least 10% of the field is worked; they are not a complete application log.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.autoSwitchFieldWork.table", "Recorded field work")}>
        <ModTable
          columns={[
            { key: "field", label: tOr("companionPage.autoSwitchFieldWork.field", "Field") },
            { key: "sown", label: tOr("companionPage.autoSwitchFieldWork.sown", "Last sowing") },
            { key: "crop", label: tOr("companionPage.autoSwitchFieldWork.crop", "Sown crop") },
            { key: "fert", label: tOr("companionPage.autoSwitchFieldWork.fert", "Last fertiliser") },
            { key: "product", label: tOr("companionPage.autoSwitchFieldWork.product", "Product / passes") },
            { key: "herb", label: tOr("companionPage.autoSwitchFieldWork.herb", "Last herbicide") },
          ]}
          rows={rows.map((row, index) => ({
            key: String(row.fieldId ?? index),
            cells: {
              field: num(row.fieldId) == null ? "—" : formatNumber(row.fieldId, 0),
              sown: gameDate(row.sown),
              crop: row.crop || "—",
              fert: gameDate(row.fertilised),
              product: row.fertiliserPasses == null ? "—"
                : `${row.fertiliser || "—"} / ${formatNumber(row.fertiliserPasses, 0)}`,
              herb: gameDate(row.herbicide),
            },
          }))}
          empty={tOr("companionPage.autoSwitchFieldWork.empty", "No recorded field work is available for currently owned land.")}
        />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr("companionPage.autoSwitchFieldWork.partial", "Some field history could not be assigned to current land; the total is withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
