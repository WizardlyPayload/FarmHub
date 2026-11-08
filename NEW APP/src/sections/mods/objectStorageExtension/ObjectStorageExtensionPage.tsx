import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Storage = {
  farmId?: number; placeableId?: string; name?: string;
  configuredObjectCapacity?: number;
  acceptedObjectType?: "bales-and-pallets" | "bales" | "pallets";
  inputTriggerDisabled?: boolean;
};

const acceptedType = (type?: Storage["acceptedObjectType"]) => {
  if (type === "bales") return tOr("companionPage.objectStorageExtension.bales", "Bales");
  if (type === "pallets") return tOr("companionPage.objectStorageExtension.pallets", "Pallets");
  return tOr("companionPage.objectStorageExtension.both", "Bales and pallets");
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Storage>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const complete = page?.coverage === "complete";
  const tiles: ModStatTile[] = farmData && complete ? [
    { key: "owned", label: tOr("companionPage.objectStorageExtension.owned", "Owned object stores"), value: formatNumber(farmData.ownedStorageCount, 0) },
    { key: "disabled", label: tOr("companionPage.objectStorageExtension.disabled", "Inputs disabled"), value: formatNumber(farmData.inputDisabledCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.objectStorageExtension.lead", "Current configuration of this farm's object stores. Capacity is a configured object limit, not free space or stored inventory.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.objectStorageExtension.table", "Owned object stores")}>
        <ModTable
          columns={[
            { key: "name", label: tOr("companionPage.objectStorageExtension.name", "Storage") },
            { key: "capacity", label: tOr("companionPage.objectStorageExtension.capacity", "Object capacity") },
            { key: "types", label: tOr("companionPage.objectStorageExtension.types", "Accepted objects") },
            { key: "input", label: tOr("companionPage.objectStorageExtension.input", "Input trigger") },
          ]}
          rows={rows.map((row, index) => ({
            key: row.placeableId || `${index}`,
            cells: {
              name: row.name || "—",
              capacity: formatNumber(row.configuredObjectCapacity, 0),
              types: acceptedType(row.acceptedObjectType),
              input: row.inputTriggerDisabled
                ? tOr("companionPage.objectStorageExtension.off", "Disabled")
                : tOr("companionPage.objectStorageExtension.on", "Enabled"),
            },
          }))}
          empty={tOr("companionPage.objectStorageExtension.empty", "No configured object store is currently owned by this farm.")}
        />
        {page?.coverage === "partial" || page?.coverage === "truncated" ? (
          <ModEmpty>{tOr("companionPage.objectStorageExtension.partial", "Some owned storage settings were unavailable; totals are withheld.")}</ModEmpty>
        ) : null}
      </Card>
    </ModPage>
  );
}
