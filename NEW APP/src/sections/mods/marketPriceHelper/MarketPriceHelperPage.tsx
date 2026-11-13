import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, useUnitPrice, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type Observation = { pricePerLitre?: number; day?: number; hour?: number; period?: number };
type PriceRow = {
  fillType?: string; title?: string; latest?: Observation;
  lowPricePerLitre?: number; highPricePerLitre?: number;
  sampleCount?: number; historyTruncated?: boolean;
};

const K = "companionPage.marketPriceHelper";

export function Page({ entry }: CompanionPageProps) {
  const { page } = useCompanionPage(entry.key);
  const unitPrice = useUnitPrice();
  const rows = asList<PriceRow>(page?.rows);
  const perLitre = (value: unknown) => num(value) == null ? "—" : `${unitPrice(value)} / L`;
  const tiles: ModStatTile[] = page ? [
    { key: "types", label: tOr(`${K}.types`, "Crops with observations"), value: formatNumber(page.fillTypeCount) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Saved best selling-station price observations from this local single-player game. Prices are market-wide, not this farm's sales, income or stock. The range covers at most the latest 320 samples per crop.")}>
      <ModStatTiles tiles={tiles} />
      {page?.reason === "local-single-player-only" ? (
        <ModEmpty>{tOr(`${K}.singlePlayer`, "This history is available only from the local single-player game.")}</ModEmpty>
      ) : null}
      <Card title={tOr(`${K}.tableTitle`, "Observed best prices")}>
        <ModTable
          columns={[
            { key: "crop", label: tOr(`${K}.crop`, "Crop") },
            { key: "latest", label: tOr(`${K}.latest`, "Latest / L"), align: "end" },
            { key: "range", label: tOr(`${K}.range`, "Sample range / L"), align: "end" },
            { key: "time", label: tOr(`${K}.time`, "Game day · hour"), align: "end" },
            { key: "samples", label: tOr(`${K}.samples`, "Samples"), align: "end" },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.fillType ?? "fill"}-${index}`,
            cells: {
              crop: row.title || row.fillType || "—",
              latest: perLitre(row.latest?.pricePerLitre),
              range: `${perLitre(row.lowPricePerLitre)} – ${perLitre(row.highPricePerLitre)}`,
              time: num(row.latest?.day) == null || num(row.latest?.hour) == null
                ? "—" : `${formatNumber(row.latest?.day)} · ${formatNumber(row.latest?.hour).padStart(2, "0")}:00`,
              samples: `${row.historyTruncated ? "≥" : ""}${formatNumber(row.sampleCount)}`,
            },
          }))}
          empty={tOr(`${K}.empty`, "No valid saved price observations are available yet.")}
        />
      </Card>
    </ModPage>
  );
}
