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
  num,
  useCompanionPage,
  yesNo,
  type CompanionPageProps,
  type ModStatTile,
} from "@/sections/mods/shared";

export type Category = "root" | "vegetable" | "special";
export type Band = "0_3" | "3_8" | "8_20" | "20_30" | "30_plus";

const CATEGORIES: Category[] = ["root", "vegetable", "special"];
const BANDS: Band[] = ["0_3", "3_8", "8_20", "20_30", "30_plus"];

type Counts = Record<Category, number>;
type BandRow = { band: Band; fields?: number; areaHa?: number; growing?: Counts; planned?: Counts };
type FieldRow = { fieldId?: number; name?: string; areaHa?: number; band: Band; crop?: string; category: Category; stage?: "growing" | "planned"; keepChance?: number };
type CropRow = { crop: string; onMap?: boolean };

export function categoryLabel(category: Category): string {
  switch (category) {
    case "root":
      return tOr("companionPage.smartCropControl.catRoot", "Root crops");
    case "vegetable":
      return tOr("companionPage.smartCropControl.catVegetable", "Vegetables");
    case "special":
      return tOr("companionPage.smartCropControl.catSpecial", "Special crops");
    default: {
      const never: never = category;
      return never;
    }
  }
}

export function bandLabel(band: Band): string {
  switch (band) {
    case "0_3":
      return tOr("companionPage.smartCropControl.band0", "Under 3 ha");
    case "3_8":
      return tOr("companionPage.smartCropControl.band1", "3–8 ha");
    case "8_20":
      return tOr("companionPage.smartCropControl.band2", "8–20 ha");
    case "20_30":
      return tOr("companionPage.smartCropControl.band3", "20–30 ha");
    case "30_plus":
      return tOr("companionPage.smartCropControl.band4", "30 ha and over");
    default: {
      const never: never = band;
      return never;
    }
  }
}

function cropLabel(name: string): string {
  const lower = name.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function chanceCell(value: unknown) {
  const n = num(value);
  if (n == null) return "—";
  const tone = n <= 0 ? "danger" : n >= 100 ? "accent" : "default";
  return <Badge tone={tone}>{`${formatNumber(n)}%`}</Badge>;
}

function sum(rows: BandRow[], key: "growing" | "planned"): number {
  return rows.reduce((total, row) => total + CATEGORIES.reduce((t, c) => t + (num(row[key]?.[c]) ?? 0), 0), 0);
}

export function Page({ entry }: CompanionPageProps) {
  const { page } = useCompanionPage(entry.key);
  const chances = (page?.chances && typeof page.chances === "object" ? page.chances : {}) as Partial<Record<Category, (number | null)[]>>;
  const bands = asList<BandRow>(page?.bands);
  const fields = asList<FieldRow>(page?.fields);
  const crops = (page?.crops && typeof page.crops === "object" ? page.crops : null) as Partial<Record<Category, CropRow[]>> | null;
  const hasMap = page != null && num(page.npcFieldCount) != null;
  const hasChances = CATEGORIES.some((c) => asList(chances[c]).some((v) => num(v) != null));

  const tiles: ModStatTile[] = [];
  if (hasMap) {
    tiles.push(
      { key: "npcFields", label: tOr("companionPage.smartCropControl.statNpcFields", "NPC fields"), value: formatNumber(page?.npcFieldCount) },
      {
        key: "growing",
        label: tOr("companionPage.smartCropControl.statGrowing", "NPC fields growing controlled crops"),
        value: formatNumber(sum(bands, "growing")),
      },
      {
        key: "planned",
        label: tOr("companionPage.smartCropControl.statPlanned", "Planned next"),
        value: formatNumber(sum(bands, "planned")),
        hint: tOr("companionPage.smartCropControl.statPlannedHint", "Controlled crops the NPCs have already chosen"),
      },
    );
  }
  if (crops) {
    const all = CATEGORIES.flatMap((c) => asList<CropRow>(crops[c]));
    tiles.push({
      key: "onMap",
      label: tOr("companionPage.smartCropControl.statOnMap", "Controlled crops on this map"),
      value: tOr("companionPage.smartCropControl.ofTotal", "{{count}} of {{total}}", {
        count: formatNumber(all.filter((c) => c.onMap).length),
        total: formatNumber(all.length),
      }),
    });
  }

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.smartCropControl.lead",
        "Smart Crop Control decides how often NPC farmers keep root crops, vegetables and special crops, depending on field size. Your own fields are never touched.",
      )}
    >
      <ModStatTiles tiles={tiles} />

      <Card title={tOr("companionPage.smartCropControl.gridTitle", "Keep chance by field size")}>
        {hasChances ? (
          <ModTable
            columns={[
              { key: "category", label: tOr("companionPage.smartCropControl.colCategory", "Crops") },
              ...BANDS.map((band) => ({ key: band, label: bandLabel(band), align: "center" as const })),
            ]}
            rows={CATEGORIES.map((category) => ({
              key: category,
              cells: Object.fromEntries([
                ["category", categoryLabel(category)],
                ...BANDS.map((band, i) => [band, chanceCell(asList(chances[category])[i])]),
              ]),
            }))}
          />
        ) : (
          <ModEmpty>{tOr("companionPage.smartCropControl.waitingSettings", "The mod's settings appear after the next export.")}</ModEmpty>
        )}
        <p class="fd-economy__muted">
          {tOr(
            "companionPage.smartCropControl.gridNote",
            "When the game plans one of these crops for an NPC field, the mod keeps it with this chance; otherwise the NPC plants a regular crop instead. 0% means never, 100% means always.",
          )}
        </p>
      </Card>

      <div class="fd-mod-page__grid">
        <Card title={tOr("companionPage.smartCropControl.bandsTitle", "NPC fields by size")}>
          {hasMap ? (
            <ModTable
              columns={[
                { key: "band", label: tOr("companionPage.smartCropControl.colSize", "Field size") },
                { key: "fields", label: tOr("companionPage.smartCropControl.colFields", "Fields"), align: "end" },
                { key: "area", label: tOr("companionPage.smartCropControl.colArea", "Area"), align: "end" },
                ...CATEGORIES.map((c) => ({ key: c, label: categoryLabel(c), align: "end" as const })),
              ]}
              rows={bands.map((row) => ({
                key: row.band,
                cells: Object.fromEntries([
                  ["band", bandLabel(row.band)],
                  ["fields", formatNumber(row.fields ?? 0)],
                  ["area", tOr("companionPage.smartCropControl.hectares", "{{value}} ha", { value: formatNumber(row.areaHa ?? 0, 1) })],
                  ...CATEGORIES.map((c) => {
                    const growing = num(row.growing?.[c]) ?? 0;
                    const planned = num(row.planned?.[c]) ?? 0;
                    return [
                      c,
                      planned > 0
                        ? tOr("companionPage.smartCropControl.growingPlanned", "{{growing}} (+{{planned}} planned)", {
                            growing: formatNumber(growing),
                            planned: formatNumber(planned),
                          })
                        : formatNumber(growing),
                    ];
                  }),
                ]),
              }))}
            />
          ) : (
            <ModEmpty>
              {page
                ? tOr("companionPage.smartCropControl.noMap", "The map's fields were not readable on this export.")
                : tOr("companionPage.smartCropControl.waitingMap", "NPC fields appear after the next export.")}
            </ModEmpty>
          )}
          {page?.coverage === "sampled" ? (
            <ModEmpty>{tOr("companionPage.smartCropControl.sampled", "Large map: only the first fields were read this cycle.")}</ModEmpty>
          ) : null}
        </Card>

        <Card title={tOr("companionPage.smartCropControl.cropsTitle", "Controlled crops")}>
          {crops ? (
            CATEGORIES.map((c) => {
              const list = asList<CropRow>(crops[c]);
              return (
                <div key={c} data-category={c}>
                  <h4 class="fd-mod-page__subhead">{categoryLabel(c)}</h4>
                  <p>
                    {list.length === 0
                      ? "—"
                      : list.map((row) => (
                          <span key={row.crop} data-crop={row.crop}>
                            <Badge tone={row.onMap ? "accent" : "default"} title={row.onMap ? tOr("companionPage.smartCropControl.onMap", "Grown on this map") : tOr("companionPage.smartCropControl.notOnMap", "Not on this map")}>
                              {cropLabel(row.crop)}
                            </Badge>{" "}
                          </span>
                        ))}
                  </p>
                </div>
              );
            })
          ) : (
            <ModEmpty>{tOr("companionPage.smartCropControl.waitingCrops", "The crop list appears after the next export.")}</ModEmpty>
          )}
          <p class="fd-economy__muted">{tOr("companionPage.smartCropControl.cropsNote", "Highlighted crops are grown on this map.")}</p>
        </Card>
      </div>

      <Card title={tOr("companionPage.smartCropControl.fieldsTitle", "NPC fields with controlled crops")}>
        <ModTable
          columns={[
            { key: "field", label: tOr("companionPage.smartCropControl.colField", "Field") },
            { key: "size", label: tOr("companionPage.smartCropControl.colSize", "Field size"), align: "end" },
            { key: "crop", label: tOr("companionPage.smartCropControl.colCrop", "Crop") },
            { key: "stage", label: tOr("companionPage.smartCropControl.colStage", "Status") },
            { key: "chance", label: tOr("companionPage.smartCropControl.colChance", "Keep chance"), align: "center" },
          ]}
          rows={fields.map((f, i) => ({
            key: `field-${f.fieldId ?? i}`,
            cells: {
              field: f.name ?? String(f.fieldId ?? "?"),
              size: tOr("companionPage.smartCropControl.hectares", "{{value}} ha", { value: formatNumber(f.areaHa ?? 0, 2) }),
              crop: `${f.crop ? cropLabel(f.crop) : "—"} · ${categoryLabel(f.category)}`,
              stage:
                f.stage === "planned"
                  ? tOr("companionPage.smartCropControl.stagePlanned", "Planned")
                  : tOr("companionPage.smartCropControl.stageGrowing", "Growing"),
              chance: chanceCell(f.keepChance),
            },
          }))}
          empty={
            hasMap
              ? tOr("companionPage.smartCropControl.noFields", "No NPC field is growing or planning a controlled crop right now.")
              : tOr("companionPage.smartCropControl.waitingMap", "NPC fields appear after the next export.")
          }
        />
      </Card>

      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.smartCropControl.look1", "The sliders are in the game settings under \"Smart Crop Control\", one per crop group and field size."),
          tOr("companionPage.smartCropControl.look2", "Rules apply to a new save and whenever NPCs replan a field after harvest or at the start of a new year, so changes show up gradually."),
          tOr("companionPage.smartCropControl.look3", "Settings are saved in your game profile, not in the save, so they follow you to every save on this PC."),
        ]}
      >
        <p class="fd-economy__muted">
          {tOr("companionPage.smartCropControl.debug", "Debug logging: {{value}}", { value: yesNo(page?.debug) })}
        </p>
      </ModAbout>
    </ModPage>
  );
}
