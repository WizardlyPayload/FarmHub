import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Tire = {
  farmId?: number;
  vehicleId?: string;
  vehicle?: string;
  wheelIndex?: number;
  passportId?: string;
  size?: string;
  wearPct?: number;
  km?: number;
  roadKm?: number;
  fieldKm?: number;
  repairs?: number;
  damaged?: boolean;
  airLossPct?: number;
};

const pct = (value: unknown) => num(value) === null ? "—" : `${formatNumber(value, 1)}%`;
const km = (value: unknown) => num(value) === null ? "—" : `${formatNumber(value, 1)} km`;

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const mounted = asList<Tire>(page?.mounted).filter((row) => num(row.farmId) === farmId);
  const spare = asList<Tire>(page?.spare).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "mounted", label: tOr("companionPage.realTireWear.mountedCount", "Mounted tire passports"), value: formatNumber(farmData.mountedCount, 0) },
    { key: "spare", label: tOr("companionPage.realTireWear.spareCount", "Readable spare tire passports"), value: page?.stockState === "ready" ? formatNumber(farmData.spareCount, 0) : "—" },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.realTireWear.lead", "Real Tire Wear's recorded tire condition on vehicles owned by this farm and its separate spare stock. Wear is the average of three tread bands; distance and repair count are passport records, not proof of work completed in this session.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.realTireWear.mountedTitle", "Mounted tires on owned vehicles")}>
        <ModTable
          columns={[
            { key: "vehicle", label: tOr("companionPage.realTireWear.vehicle", "Vehicle") },
            { key: "wheel", label: tOr("companionPage.realTireWear.wheel", "Wheel") },
            { key: "wear", label: tOr("companionPage.realTireWear.wear", "Tread wear"), align: "end" },
            { key: "distance", label: tOr("companionPage.realTireWear.distance", "Recorded distance"), align: "end" },
            { key: "road", label: tOr("companionPage.realTireWear.road", "Road"), align: "end" },
            { key: "field", label: tOr("companionPage.realTireWear.field", "Field"), align: "end" },
            { key: "repairs", label: tOr("companionPage.realTireWear.repairs", "Repairs"), align: "end" },
            { key: "damage", label: tOr("companionPage.realTireWear.damage", "Damaged") },
            { key: "airLoss", label: tOr("companionPage.realTireWear.airLoss", "Air loss"), align: "end" },
          ]}
          rows={mounted.map((row, index) => ({
            key: `${row.vehicleId || index}:${row.wheelIndex || index}`,
            cells: {
              vehicle: row.vehicle || "—",
              wheel: formatNumber(row.wheelIndex, 0),
              wear: pct(row.wearPct),
              distance: km(row.km),
              road: km(row.roadKm),
              field: km(row.fieldKm),
              repairs: formatNumber(row.repairs, 0),
              damage: row.damaged ? tOr("companionPage.realTireWear.yes", "Yes") : tOr("companionPage.realTireWear.no", "No"),
              airLoss: pct(row.airLossPct),
            },
          }))}
          empty={tOr("companionPage.realTireWear.emptyMounted", "No owned vehicle has a readable tire passport.")}
        />
      </Card>
      <Card title={tOr("companionPage.realTireWear.spareTitle", "Farm spare-tire stock")}>
        <ModTable
          columns={[
            { key: "id", label: tOr("companionPage.realTireWear.passport", "Tire passport") },
            { key: "size", label: tOr("companionPage.realTireWear.size", "Tire size") },
            { key: "wear", label: tOr("companionPage.realTireWear.wear", "Tread wear"), align: "end" },
            { key: "distance", label: tOr("companionPage.realTireWear.distance", "Recorded distance"), align: "end" },
            { key: "repairs", label: tOr("companionPage.realTireWear.repairs", "Repairs"), align: "end" },
          ]}
          rows={spare.map((row, index) => ({
            key: row.passportId || String(index),
            cells: { id: row.passportId || "—", size: row.size || "—", wear: pct(row.wearPct), distance: km(row.km), repairs: formatNumber(row.repairs, 0) },
          }))}
          empty={page?.stockState === "ready"
            ? tOr("companionPage.realTireWear.emptySpare", "No spare tire is recorded for this farm.")
            : tOr("companionPage.realTireWear.stockUnavailable", "Server spare inventory has not loaded; an empty stock cannot be confirmed.")}
        />
      </Card>
      {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.realTireWear.truncated", "Only part of the owned tire records are shown.")}</ModEmpty> : null}
      {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.realTireWear.partial", "Some tire records or spare stock were unavailable.")}</ModEmpty> : null}
    </ModPage>
  );
}
