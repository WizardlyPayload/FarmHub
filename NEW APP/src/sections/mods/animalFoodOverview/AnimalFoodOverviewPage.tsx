import { Badge, Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModAbout,
  ModEmpty,
  ModPage,
  ModStatTiles,
  ModTable,
  asList,
  formatNumber,
  formatPercent,
  num,
  useCompanionPage,
  type CompanionPageProps,
  type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.animalFoodOverview";

type FeedGroup = { title?: string; productionWeight?: number; eatWeight?: number; foods?: string[] };
type Mixture = { title?: string; ingredients?: { weightPercent?: number; foods?: string }[] };
type AnimalFeed = { animalType?: string; title?: string; consumption?: "parallel" | "sequential"; groups?: FeedGroup[]; mixtures?: Mixture[] };
type Recipe = { title?: string; ingredients?: { title?: string; minPercent?: number; maxPercent?: number }[] };

function AnimalCard({ animal }: { animal: AnimalFeed }) {
  const groups = asList<FeedGroup>(animal.groups);
  const mixtures = asList<Mixture>(animal.mixtures);
  const title = animal.title || animal.animalType || "—";
  return (
    <Card title={title}>
      <Badge>
        {animal.consumption === "sequential"
          ? tOr(`${K}.consumptionSequential`, "Eats one group at a time, in order")
          : tOr(`${K}.consumptionParallel`, "Eats from all groups together")}
      </Badge>
      <ModTable
        columns={[
          { key: "group", label: tOr(`${K}.colGroup`, "Feed group") },
          { key: "production", label: tOr(`${K}.colProduction`, "Productivity"), align: "end" },
          { key: "eat", label: tOr(`${K}.colEat`, "Share eaten"), align: "end" },
          { key: "foods", label: tOr(`${K}.colFoods`, "Accepted feed") },
        ]}
        rows={groups.map((g, i) => ({
          key: `${i}-${g.title ?? ""}`,
          cells: {
            group: g.title || "—",
            production: formatPercent(g.productionWeight, { ratio: true, dp: 0 }),
            eat: formatPercent(g.eatWeight, { ratio: true, dp: 0 }),
            foods: asList<string>(g.foods).join(", ") || "—",
          },
        }))}
        empty={tOr(`${K}.groupsEmpty`, "No feed groups listed for this animal.")}
      />
      {mixtures.length > 0 ? (
        <>
          <h4 class="fd-mod-page__subhead">{tOr(`${K}.mixturesTitle`, "Mixed feed")}</h4>
          <ModTable
            columns={[
              { key: "mix", label: tOr(`${K}.colMixture`, "Mixture") },
              { key: "parts", label: tOr(`${K}.colParts`, "Made from") },
            ]}
            rows={mixtures.map((m, i) => ({
              key: `${i}-${m.title ?? ""}`,
              cells: {
                mix: m.title || "—",
                parts: asList<{ weightPercent?: number; foods?: string }>(m.ingredients)
                  .map((part) => tOr(`${K}.mixturePart`, "{{percent}} {{foods}}", {
                    percent: formatPercent(part.weightPercent, { dp: 0 }),
                    foods: part.foods || "—",
                  }))
                  .join(" + ") || "—",
              },
            }))}
          />
        </>
      ) : null}
    </Card>
  );
}

export function AnimalFoodOverviewPage({ entry }: CompanionPageProps) {
  const { page } = useCompanionPage(entry.key);
  const animals = asList<AnimalFeed>(page?.animals);
  const recipes = asList<Recipe>(page?.recipes);
  const groupCount = animals.reduce((sum, a) => sum + asList(a.groups).length, 0);
  const mixtureCount = animals.reduce((sum, a) => sum + asList(a.mixtures).length, 0);

  const tiles: ModStatTile[] = animals.length > 0
    ? [
      { key: "animals", label: tOr(`${K}.tileAnimals`, "Animal types"), value: formatNumber(num(page?.animalTypeCount) ?? animals.length) },
      { key: "groups", label: tOr(`${K}.tileGroups`, "Feed groups"), value: formatNumber(groupCount) },
      { key: "mixtures", label: tOr(`${K}.tileMixtures`, "Mixed feeds"), value: formatNumber(mixtureCount) },
      { key: "recipes", label: tOr(`${K}.tileRecipes`, "Mixer recipes"), value: formatNumber(recipes.length) },
    ]
    : [];

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        `${K}.lead`,
        "An in-game window listing what every animal eats, how each feed group counts toward productivity, and what the mixed feeds are made of.",
      )}
    >
      <ModStatTiles tiles={tiles} />

      {animals.length > 0 ? (
        <div class="fd-mod-page__grid">
          {animals.map((animal, i) => (
            <AnimalCard key={`${i}-${animal.animalType ?? ""}`} animal={animal} />
          ))}
        </div>
      ) : (
        <Card title={tOr(`${K}.feedTitle`, "Feed by animal")}>
          <ModEmpty>
            {tOr(`${K}.feedEmpty`, "The game's feed table was not readable in this save. Open the mod's window in game to see it.")}
          </ModEmpty>
        </Card>
      )}
      {page?.truncated === true ? <Badge tone="warn">{tOr(`${K}.truncated`, "Long lists were shortened")}</Badge> : null}

      {recipes.length > 0 ? (
        <Card title={tOr(`${K}.recipesTitle`, "Mixer wagon recipes")}>
          <ModTable
            columns={[
              { key: "recipe", label: tOr(`${K}.colRecipe`, "Recipe") },
              { key: "ingredients", label: tOr(`${K}.colIngredients`, "Ingredients (min – max)") },
            ]}
            rows={recipes.map((r, i) => ({
              key: `${i}-${r.title ?? ""}`,
              cells: {
                recipe: r.title || "—",
                ingredients: asList<{ title?: string; minPercent?: number; maxPercent?: number }>(r.ingredients)
                  .map((ing) => tOr(`${K}.recipePart`, "{{title}} {{min}} – {{max}}", {
                    title: ing.title || "—",
                    min: formatPercent(ing.minPercent, { dp: 0 }),
                    max: formatPercent(ing.maxPercent, { dp: 0 }),
                  }))
                  .join(", ") || "—",
              },
            }))}
          />
        </Card>
      ) : null}

      <ModAbout
        entry={entry}
        lookFor={[
          tOr(`${K}.look1`, "The mod adds a key binding (Show animal food) that opens this list in game."),
          tOr(`${K}.look2`, "It only reads the game's feed table and keeps no numbers of its own; this page shows the same table."),
          tOr(`${K}.look3`, "Map or feed mods that add animals or feeds change this list."),
        ]}
      />
    </ModPage>
  );
}
