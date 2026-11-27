import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Pen = {
  farmId?: number;
  pen?: string;
  animals?: number;
  sick?: number;
  diseaseIndex?: number;
};

function disease(index: unknown): string {
  switch (num(index)) {
    case 1: return tOr("companionPage.veterinarian.respiratory", "Respiratory");
    case 2: return tOr("companionPage.veterinarian.digestive", "Digestive");
    case 3: return tOr("companionPage.veterinarian.fever", "Fever");
    case 4: return tOr("companionPage.veterinarian.hoof", "Hoof");
    case 5: return tOr("companionPage.veterinarian.parasites", "Parasites");
    default: return tOr("companionPage.veterinarian.unknown", "Unknown");
  }
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<Pen>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "pens", label: tOr("companionPage.veterinarian.pens", "Observed pens"), value: `${formatNumber(farmData.observedPens, 0)} / ${formatNumber(farmData.ownedPens, 0)}` },
    { key: "sick", label: tOr("companionPage.veterinarian.sick", "Sick animals"), value: formatNumber(farmData.sickAnimals, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.veterinarian.lead", "Veterinarian disease state for this farm's currently owned husbandries. This is the mod's recorded illness count, not a diagnosis or proof that treatment occurred.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.veterinarian.tableTitle", "Owned husbandry health")}>
        <ModTable
          columns={[
            { key: "pen", label: tOr("companionPage.veterinarian.pen", "Husbandry") },
            { key: "animals", label: tOr("companionPage.veterinarian.animals", "Animals"), align: "end" },
            { key: "sick", label: tOr("companionPage.veterinarian.sick", "Sick animals"), align: "end" },
            { key: "disease", label: tOr("companionPage.veterinarian.disease", "Recorded disease") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.pen ?? "pen"}-${index}`,
            cells: {
              pen: row.pen || "—",
              animals: num(row.animals) == null ? "—" : formatNumber(row.animals, 0),
              sick: num(row.sick) == null ? "—" : formatNumber(row.sick, 0),
              disease: num(row.sick) != null && row.sick! > 0 ? disease(row.diseaseIndex) : "—",
            },
          }))}
          empty={tOr("companionPage.veterinarian.empty", "No recorded Veterinarian state for this farm's husbandries yet.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.veterinarian.truncated", "Only some husbandries are listed.")}</ModEmpty> : null}
        {page?.coverage === "partial" ? <ModEmpty>{tOr("companionPage.veterinarian.partial", "Some owned husbandries have no Veterinarian state yet.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
