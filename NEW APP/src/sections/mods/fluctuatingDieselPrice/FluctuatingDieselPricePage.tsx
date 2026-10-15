import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModAbout,
  ModBar,
  ModBarChart,
  ModEmpty,
  ModKeyValues,
  ModPage,
  ModStatTiles,
  asList,
  formatNumber,
  num,
  useCompanionPage,
  useUnitPrice,
  type CompanionPageProps,
  type ModStatTile,
} from "@/sections/mods/shared";

type Sample = { day?: number; hour?: number; price?: number };

function hourText(value: unknown): string {
  const n = num(value);
  return n == null ? "—" : `${String(Math.round(n) % 24).padStart(2, "0")}:00`;
}

function difficultyLabel(value: unknown): string {
  switch (num(value)) {
    case 1:
      return tOr("companionPage.fluctuatingDieselPrice.diffEasy", "Easy");
    case 2:
      return tOr("companionPage.fluctuatingDieselPrice.diffNormal", "Normal");
    case 3:
      return tOr("companionPage.fluctuatingDieselPrice.diffHard", "Hard");
    default:
      return "—";
  }
}

export function Page({ entry }: CompanionPageProps) {
  const { page } = useCompanionPage(entry.key);
  const price = useUnitPrice();
  const observed = (page?.observed && typeof page.observed === "object" ? page.observed : null) as Record<string, unknown> | null;
  const samples = asList<Sample>(observed?.samples);
  const position = num(page?.bandPosition);
  const perLitre = (v: unknown) => (num(v) == null ? "—" : tOr("companionPage.fluctuatingDieselPrice.perLitre", "{{price}} / L", { price: price(v) }));

  const tiles: ModStatTile[] = page
    ? [
        {
          key: "price",
          label: tOr("companionPage.fluctuatingDieselPrice.statPrice", "Diesel price now"),
          value: perLitre(page.price),
          tone: page.outsideBand === true ? "warn" : undefined,
          hint:
            page.outsideBand === true
              ? tOr("companionPage.fluctuatingDieselPrice.statOutside", "Outside this difficulty's range")
              : null,
        },
        {
          key: "band",
          label: tOr("companionPage.fluctuatingDieselPrice.statBand", "Price range"),
          value:
            num(page.bandMin) == null
              ? "—"
              : tOr("companionPage.fluctuatingDieselPrice.band", "{{min}} – {{max}}", { min: price(page.bandMin), max: price(page.bandMax) }),
          hint: tOr("companionPage.fluctuatingDieselPrice.statBandHint", "{{difficulty}} economy", { difficulty: difficultyLabel(page.difficulty) }),
        },
        {
          key: "next",
          label: tOr("companionPage.fluctuatingDieselPrice.statNext", "Next price change"),
          value: hourText(page.nextChangeHour),
          hint:
            num(page.hoursUntilChange) == null
              ? null
              : tOr("companionPage.fluctuatingDieselPrice.statNextHint", "in {{hours}} h", { hours: formatNumber(page.hoursUntilChange, 0) }),
        },
        {
          key: "average",
          label: tOr("companionPage.fluctuatingDieselPrice.statAverage", "Average seen"),
          value: perLitre(observed?.average),
          hint: tOr("companionPage.fluctuatingDieselPrice.statAverageHint", "over {{count}} price changes", { count: formatNumber(observed?.count, 0) }),
        },
      ]
    : [];

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.fluctuatingDieselPrice.lead",
        "Fluctuating Diesel Price picks a new random diesel price every six hours, within a range set by the economy difficulty. The mod keeps no history, so FarmHub records the prices it sees while the dashboard is running.",
      )}
    >
      {page?.otherDieselMod ? (
        <p class="fd-mod-page__notice is-partial" role="status">
          {tOr(
            "companionPage.fluctuatingDieselPrice.conflict",
            "Realistic Diesel Price is also loaded. Both mods set the diesel price, so the in-game price may jump between them.",
          )}
        </p>
      ) : null}
      <ModStatTiles tiles={tiles} />
      <div class="fd-mod-page__grid">
        <Card title={tOr("companionPage.fluctuatingDieselPrice.positionTitle", "Where the price sits in its range")}>
          {position != null ? (
            <>
              <ModBar ratio={position} tone={position >= 0.8 ? "danger" : position >= 0.5 ? "warn" : undefined} />
              <p class="fd-economy__muted">
                {position <= 0.33
                  ? tOr("companionPage.fluctuatingDieselPrice.cheap", "Cheap end of the range: a good time to fill storage tanks.")
                  : position >= 0.67
                    ? tOr("companionPage.fluctuatingDieselPrice.dear", "Expensive end of the range: buy only what you need.")
                    : tOr("companionPage.fluctuatingDieselPrice.mid", "Middle of the range.")}
              </p>
            </>
          ) : (
            <ModEmpty>{tOr("companionPage.fluctuatingDieselPrice.noPosition", "The price range is not known for this difficulty.")}</ModEmpty>
          )}
          <ModKeyValues
            rows={[
              { key: "difficulty", label: tOr("companionPage.fluctuatingDieselPrice.setDifficulty", "Economy difficulty"), value: difficultyLabel(page?.difficulty) },
              { key: "hours", label: tOr("companionPage.fluctuatingDieselPrice.setHours", "Price changes at"), value: "00:00, 06:00, 12:00, 18:00" },
              { key: "low", label: tOr("companionPage.fluctuatingDieselPrice.setLow", "Lowest seen"), value: perLitre(observed?.low) },
              { key: "high", label: tOr("companionPage.fluctuatingDieselPrice.setHigh", "Highest seen"), value: perLitre(observed?.high) },
            ]}
          />
        </Card>
        <Card title={tOr("companionPage.fluctuatingDieselPrice.historyTitle", "Prices seen this session")}>
          {samples.length > 0 ? (
            <ModBarChart
              points={samples.map((s, i) => ({
                key: `${s.day ?? 0}-${s.hour ?? i}`,
                label: hourText(s.hour).slice(0, 2),
                value: num(s.price),
                current: i === samples.length - 1,
                title: tOr("companionPage.fluctuatingDieselPrice.sampleTitle", "Day {{day}} {{time}}: {{price}}", {
                  day: formatNumber(s.day, 0),
                  time: hourText(s.hour),
                  price: perLitre(s.price),
                }),
              }))}
              format={(n) => price(n)}
            />
          ) : (
            <ModEmpty>{tOr("companionPage.fluctuatingDieselPrice.noHistory", "No prices recorded yet.")}</ModEmpty>
          )}
          <p class="fd-economy__muted">
            {tOr("companionPage.fluctuatingDieselPrice.historyNote", "Starts empty each time the game is loaded; keeps the last 28 price changes (one week).")}
          </p>
        </Card>
      </div>
      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.fluctuatingDieselPrice.look1", "Watch the fuel price at a station change at 00:00, 06:00, 12:00 and 18:00."),
          tOr("companionPage.fluctuatingDieselPrice.look2", "Harder economy settings move the whole range up."),
          tOr("companionPage.fluctuatingDieselPrice.look3", "Only run one diesel price mod at a time."),
        ]}
      />
    </ModPage>
  );
}
