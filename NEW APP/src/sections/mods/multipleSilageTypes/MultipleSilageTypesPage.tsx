import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.multipleSilageTypes";
type VehicleRow = { farmId?: number; vehicleId?: string; vehicle?: string; kind?: string; chopMode?: boolean;
  originalCapacityLitres?: number; compressionCapacityLitres?: number };
type Mix = { type?: string; recordedLitres?: number };
type BunkerRow = { farmId?: number; bunkerId?: string; bunker?: string; state?: string;
  recordedTotalLitres?: number; mix?: Mix[] };

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const vehicles = asList<VehicleRow>(page?.vehicles).filter((row) => num(row.farmId) === farmId);
  const bunkers = asList<BunkerRow>(page?.bunkers).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "equipment", label: tOr(`${K}.equipment`, "Configured equipment"), value: formatNumber(farmData.configuredVehicleCount, 0) },
    { key: "bunkers", label: tOr(`${K}.bunkers`, "Bunkers with recorded mix"), value: formatNumber(farmData.recordedBunkerCount, 0) },
  ] : [];
  const litres = (value: number | undefined) => typeof value === "number" ? `${formatNumber(value, 0)} L` : "—";
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Selected knife modes and saved compression capacity on this farm's equipment, plus the mix recorded when its bunkers closed. Recorded mix is cleared for draining and is not current stock or harvested yield.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.vehicleTitle`, "Baler and forage wagon settings")}>
        <ModTable columns={[
          { key: "vehicle", label: tOr(`${K}.vehicle`, "Vehicle") },
          { key: "kind", label: tOr(`${K}.kind`, "Type") },
          { key: "knife", label: tOr(`${K}.knife`, "Knife mode") },
          { key: "capacity", label: tOr(`${K}.capacity`, "Saved compression capacity") },
        ]} rows={vehicles.map((row, index) => ({
          key: row.vehicleId || String(index), cells: {
            vehicle: row.vehicle || tOr(`${K}.unnamedVehicle`, "Unnamed vehicle"),
            kind: row.kind === "forageWagon" ? tOr(`${K}.forageWagon`, "Forage wagon") : tOr(`${K}.baler`, "Baler"),
            knife: row.chopMode === true ? tOr(`${K}.on`, "On") : tOr(`${K}.off`, "Off"),
            capacity: typeof row.compressionCapacityLitres === "number"
              ? `${litres(row.originalCapacityLitres)} → ${litres(row.compressionCapacityLitres)}` : "—",
          },
        }))} empty={tOr(`${K}.vehicleEmpty`, "No owned baler or forage wagon has an active mod setting.")} />
      </Card>
      <Card title={tOr(`${K}.bunkerTitle`, "Recorded closed-bunker mix")}>
        <ModTable columns={[
          { key: "bunker", label: tOr(`${K}.bunker`, "Bunker") },
          { key: "state", label: tOr(`${K}.state`, "State") },
          { key: "mix", label: tOr(`${K}.mix`, "Recorded at close") },
        ]} rows={bunkers.map((row, index) => ({
          key: row.bunkerId || String(index), cells: {
            bunker: row.bunker || tOr(`${K}.unnamedBunker`, "Unnamed bunker"),
            state: row.state === "fermented" ? tOr(`${K}.fermented`, "Fermented") : tOr(`${K}.closed`, "Closed"),
            mix: asList<Mix>(row.mix).map((item) => `${item.type || "—"}: ${litres(item.recordedLitres)}`).join(" · "),
          },
        }))} empty={tOr(`${K}.bunkerEmpty`, "No owned closed bunker has a recorded silage-type mix.")} />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the owned equipment or bunker state is shown.")}</ModEmpty> : null}
        {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "An entry had ambiguous ownership, identity or unreadable state and was withheld.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
