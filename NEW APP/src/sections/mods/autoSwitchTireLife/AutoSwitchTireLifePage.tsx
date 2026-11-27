import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type WheelReading = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  wheelConfiguration?: number;
  wheelIndex?: number;
  wearPct?: number;
  cut?: boolean;
  reading?: "live" | "saved";
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<WheelReading>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const count = num(farmData?.shownWheelReadings);
  const tiles: ModStatTile[] = count != null ? [
    { key: "shown", label: tOr("companionPage.autoSwitchTireLife.shown", "Shown wheel readings"), value: formatNumber(count, 0) },
  ] : [];
  const unavailable = page?.reason === "tire-module-inactive"
    ? tOr("companionPage.autoSwitchTireLife.inactive", "AutoSwitch tire life is not active in this game; no current wear is asserted.")
    : tOr("companionPage.autoSwitchTireLife.unavailable", "No readable AutoSwitch tire record is available for an owned vehicle.");
  return (
    <ModPage entry={entry} lead={tOr("companionPage.autoSwitchTireLife.lead", "AutoSwitch tire wear on vehicles currently owned by this farm. Live wheels and saved wheel configurations are labelled separately; a reading does not prove a repair or distance driven.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.autoSwitchTireLife.title", "Owned vehicle tire readings")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.autoSwitchTireLife.vehicle", "Vehicle") },
            { key: "config", label: tOr("companionPage.autoSwitchTireLife.config", "Wheel set") },
            { key: "wheel", label: tOr("companionPage.autoSwitchTireLife.wheel", "Wheel") },
            { key: "wear", label: tOr("companionPage.autoSwitchTireLife.wear", "Wear"), align: "end" },
            { key: "cut", label: tOr("companionPage.autoSwitchTireLife.cut", "Track cut") },
            { key: "source", label: tOr("companionPage.autoSwitchTireLife.source", "Reading") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.vehicleId || index}:${row.wheelConfiguration || 0}:${row.wheelIndex || 0}`,
            cells: {
              vehicle: row.vehicle || row.vehicleId || "—",
              config: formatNumber(row.wheelConfiguration, 0),
              wheel: formatNumber(row.wheelIndex, 0),
              wear: num(row.wearPct) == null ? "—" : `${formatNumber(row.wearPct, 1)}%`,
              cut: row.cut ? tOr("companionPage.autoSwitchTireLife.yes", "Yes") : tOr("companionPage.autoSwitchTireLife.no", "No"),
              source: row.reading === "live"
                ? tOr("companionPage.autoSwitchTireLife.live", "Live wheel")
                : tOr("companionPage.autoSwitchTireLife.saved", "Saved wheel set"),
            },
          }))}
          empty={unavailable}
        />
      </Card>
      {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.autoSwitchTireLife.truncated", "Only part of the owned tire records is shown.")}</ModEmpty> : null}
      {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.autoSwitchTireLife.partial", "Some tire records were unavailable or malformed; shown readings are incomplete.")}</ModEmpty> : null}
    </ModPage>
  );
}
