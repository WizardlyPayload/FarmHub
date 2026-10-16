import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModAbout,
  ModBarChart,
  ModEmpty,
  ModKeyValues,
  ModPage,
  ModStatTiles,
  ModTable,
  asList,
  formatNumber,
  num,
  useCompanionPage,
  useUnitPrice,
  yesNo,
  type CompanionPageProps,
  type ModStatTile,
} from "@/sections/mods/shared";

type CountryRow = { label?: string; price?: number; selected?: boolean };
type RegionRow = { name?: string; selected?: boolean; countries?: unknown };

export function Page({ entry }: CompanionPageProps) {
  const { page } = useCompanionPage(entry.key);
  const price = useUnitPrice();
  const regions = asList<RegionRow>(page?.regions);
  const selectedRegion = regions.find((r) => r.selected === true) ?? null;
  const countries = asList<CountryRow>(selectedRegion?.countries);
  const custom = page?.customMode === true;
  const perLitre = (v: unknown) => (num(v) == null ? "—" : tOr("companionPage.realisticDieselPrice.perLitre", "{{price}} / L", { price: price(v) }));

  const tiles: ModStatTile[] = page
    ? [
        {
          key: "game",
          label: tOr("companionPage.realisticDieselPrice.statGame", "Diesel price in game"),
          value: perLitre(page.gamePrice),
          tone: page.inSync === false ? "warn" : page.inSync === true ? "ok" : undefined,
          hint:
            page.inSync === false
              ? tOr("companionPage.realisticDieselPrice.statOutOfSync", "Differs from the mod's target")
              : page.inSync === true
                ? tOr("companionPage.realisticDieselPrice.statInSync", "Matches the mod's target")
                : null,
        },
        { key: "target", label: tOr("companionPage.realisticDieselPrice.statTarget", "Mod target price"), value: perLitre(page.targetPrice) },
        {
          key: "mode",
          label: tOr("companionPage.realisticDieselPrice.statMode", "Price source"),
          value: custom
            ? tOr("companionPage.realisticDieselPrice.modeCustom", "Custom price")
            : tOr("companionPage.realisticDieselPrice.modePreset", "Country preset"),
          hint: custom ? null : [page.country, page.region].filter((v) => typeof v === "string" && v !== "").join(", ") || null,
        },
        {
          key: "countries",
          label: tOr("companionPage.realisticDieselPrice.statPresets", "Country presets"),
          value: formatNumber(regions.reduce((sum, r) => sum + asList(r.countries).length, 0), 0),
          hint: tOr("companionPage.realisticDieselPrice.statRegions", "in {{count}} regions", { count: formatNumber(regions.length, 0) }),
        },
      ]
    : [];

  const regionSummary = regions.map((r, i) => {
    const prices = asList<CountryRow>(r.countries)
      .map((c) => num(c.price))
      .filter((p): p is number => p != null);
    return {
      key: r.name ?? String(i),
      tone: r.selected ? ("ok" as const) : undefined,
      cells: {
        region: r.name ?? "—",
        count: formatNumber(prices.length, 0),
        low: perLitre(prices.length ? Math.min(...prices) : null),
        high: perLitre(prices.length ? Math.max(...prices) : null),
      },
    };
  });

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.realisticDieselPrice.lead",
        "Realistic Diesel Price fixes the diesel price to a real-world country average or your own custom price. This page shows the price the game is charging and the presets you can choose from.",
      )}
    >
      {page?.otherDieselMod ? (
        <p class="fd-mod-page__notice is-partial" role="status">
          {tOr(
            "companionPage.realisticDieselPrice.conflict",
            "Fluctuating Diesel Price is also loaded. Both mods set the diesel price, so the in-game price may jump between them.",
          )}
        </p>
      ) : null}
      <ModStatTiles tiles={tiles} />
      <div class="fd-mod-page__grid">
        <Card
          title={
            selectedRegion?.name
              ? tOr("companionPage.realisticDieselPrice.regionTitle", "{{region}} presets", { region: selectedRegion.name })
              : tOr("companionPage.realisticDieselPrice.regionTitleNone", "Selected region")
          }
        >
          <ModBarChart
            points={countries.map((c, i) => ({
              key: c.label ?? String(i),
              label: (c.label ?? "").slice(0, 3),
              value: num(c.price),
              current: c.selected === true,
              title: `${c.label ?? "—"}: ${perLitre(c.price)}`,
            }))}
            format={(n) => price(n)}
          />
          <ModTable
            columns={[
              { key: "country", label: tOr("companionPage.realisticDieselPrice.colCountry", "Country") },
              { key: "price", label: tOr("companionPage.realisticDieselPrice.colPrice", "Price"), align: "end" },
              { key: "selected", label: tOr("companionPage.realisticDieselPrice.colSelected", "In use"), align: "center" },
            ]}
            rows={countries.map((c, i) => ({
              key: c.label ?? String(i),
              tone: c.selected ? "ok" : undefined,
              cells: { country: c.label ?? "—", price: perLitre(c.price), selected: c.selected ? yesNo(true) : "" },
            }))}
            empty={tOr("companionPage.realisticDieselPrice.noCountries", "The country presets were not readable.")}
          />
        </Card>
        <Card title={tOr("companionPage.realisticDieselPrice.regionsTitle", "All regions")}>
          <ModTable
            columns={[
              { key: "region", label: tOr("companionPage.realisticDieselPrice.colRegion", "Region") },
              { key: "count", label: tOr("companionPage.realisticDieselPrice.colCount", "Countries"), align: "end" },
              { key: "low", label: tOr("companionPage.realisticDieselPrice.colLow", "Cheapest"), align: "end" },
              { key: "high", label: tOr("companionPage.realisticDieselPrice.colHigh", "Dearest"), align: "end" },
            ]}
            rows={regionSummary}
            empty={tOr("companionPage.realisticDieselPrice.noRegions", "No regions readable.")}
          />
          <ModKeyValues
            rows={[
              { key: "custom", label: tOr("companionPage.realisticDieselPrice.setCustom", "Custom price"), value: perLitre(page?.customPrice) },
              { key: "customOn", label: tOr("companionPage.realisticDieselPrice.setCustomOn", "Custom price in use"), value: yesNo(page?.customMode) },
              { key: "menu", label: tOr("companionPage.realisticDieselPrice.setMenu", "Settings page in the game menu"), value: yesNo(page?.settingsMenuInstalled) },
            ]}
          />
        </Card>
      </div>
      {!page ? <ModEmpty>{tOr("companionPage.realisticDieselPrice.waiting", "Prices appear after the next export.")}</ModEmpty> : null}
      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.realisticDieselPrice.look1", "Pick a region and country, or a custom price, in the game's settings menu."),
          tOr("companionPage.realisticDieselPrice.look2", "The price at fuel stations and for refilling vehicles should match the price shown here."),
          tOr("companionPage.realisticDieselPrice.look3", "Only run one diesel price mod at a time."),
        ]}
      />
    </ModPage>
  );
}
