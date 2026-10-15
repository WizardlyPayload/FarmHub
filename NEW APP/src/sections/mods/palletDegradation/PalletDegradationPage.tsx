import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModAbout,
  ModBar,
  ModEmpty,
  ModKeyValues,
  ModPage,
  ModStatTiles,
  ModTable,
  asList,
  formatNumber,
  formatPercent,
  num,
  useCompanionPage,
  yesNo,
  type CompanionPageProps,
  type ModKeyValue,
  type ModStatTile,
} from "@/sections/mods/shared";

type PalletRow = {
  id?: string;
  fillType?: string;
  fillLevel?: number;
  tracked?: boolean;
  spoilRate?: number;
  wearRate?: number;
  condition?: number;
  wear?: number;
  outside?: boolean;
  saleAdjust?: number;
};

type FillTypeRow = { fillType?: string; count?: number; outside?: number; avgCondition?: number };

function fillTypeLabel(name: unknown): string {
  if (typeof name !== "string" || name === "") return tOr("companionPage.palletDegradation.unknownFill", "Unknown");
  const words = name.toLowerCase().split("_").filter(Boolean);
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function conditionTone(value: unknown): "warn" | "danger" | undefined {
  const n = num(value);
  if (n == null) return undefined;
  if (n < 50) return "danger";
  if (n < 80) return "warn";
  return undefined;
}

function saleAdjustText(value: unknown): string {
  const n = num(value);
  if (n == null) return "—";
  if (Math.abs(n) < 0.0005) return tOr("companionPage.palletDegradation.saleNone", "Full price");
  const pct = formatPercent(Math.abs(n), { ratio: true, dp: 0 });
  return n > 0
    ? tOr("companionPage.palletDegradation.saleBonus", "+{{pct}} pristine bonus", { pct })
    : tOr("companionPage.palletDegradation.salePenalty", "−{{pct}} damage penalty", { pct });
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const pallets = asList<PalletRow>(farmData?.pallets);
  const byFillType = asList<FillTypeRow>(farmData?.byFillType);
  const settings = (page?.settings && typeof page.settings === "object" ? page.settings : {}) as Record<string, unknown>;
  const catalog = (page?.fillTypeCatalog && typeof page.fillTypeCatalog === "object" ? page.fillTypeCatalog : null) as Record<
    string,
    unknown
  > | null;

  const tiles: ModStatTile[] = farmData
    ? [
        { key: "pallets", label: tOr("companionPage.palletDegradation.statPallets", "Pallets"), value: formatNumber(farmData.palletCount, 0) },
        {
          key: "avgCondition",
          label: tOr("companionPage.palletDegradation.statAvgCondition", "Average condition"),
          value: formatPercent(farmData.avgCondition, { dp: 0 }),
          tone: conditionTone(farmData.avgCondition) ?? "ok",
        },
        {
          key: "minCondition",
          label: tOr("companionPage.palletDegradation.statMinCondition", "Worst pallet"),
          value: formatPercent(farmData.minCondition, { dp: 0 }),
          tone: conditionTone(farmData.minCondition),
        },
        {
          key: "belowHalf",
          label: tOr("companionPage.palletDegradation.statBelowHalf", "Below 50% condition"),
          value: formatNumber(farmData.belowHalf, 0),
          tone: (num(farmData.belowHalf) ?? 0) > 0 ? "danger" : undefined,
        },
        {
          key: "outside",
          label: tOr("companionPage.palletDegradation.statOutside", "Stored outside"),
          value: formatNumber(farmData.outsideCount, 0),
          hint: tOr("companionPage.palletDegradation.statOutsideHint", "Only pallets outside take damage"),
          tone: (num(farmData.outsideCount) ?? 0) > 0 ? "warn" : undefined,
        },
        {
          key: "penalty",
          label: tOr("companionPage.palletDegradation.statPenalty", "Would sell below full price"),
          value: formatNumber(farmData.penaltyCount, 0),
          hint: tOr("companionPage.palletDegradation.statPristineHint", "{{count}} earn the pristine bonus", {
            count: formatNumber(farmData.pristineCount, 0),
          }),
        },
      ]
    : [];

  const settingRows: ModKeyValue[] = [
    { key: "globalMultiplier", label: tOr("companionPage.palletDegradation.setGlobal", "Global decay multiplier"), value: formatNumber(settings.globalMultiplier, 2) },
    { key: "recoveryRate", label: tOr("companionPage.palletDegradation.setRecovery", "Wear recovery under cover (per tick)"), value: formatNumber(settings.recoveryRate, 4) },
    { key: "baseTempRate", label: tOr("companionPage.palletDegradation.setTemp", "Base wear outside (per tick)"), value: formatNumber(settings.baseTempRate, 4) },
    { key: "basePermRate", label: tOr("companionPage.palletDegradation.setPerm", "Base spoilage outside (per tick)"), value: formatNumber(settings.basePermRate, 4) },
    { key: "pristineBonus", label: tOr("companionPage.palletDegradation.setBonus", "Pristine bonus"), value: formatPercent(settings.pristineBonus, { ratio: true, dp: 0 }) },
    {
      key: "pristineThreshold",
      label: tOr("companionPage.palletDegradation.setThreshold", "Pristine below damage"),
      value: formatPercent(settings.pristineThreshold, { ratio: true, dp: 0 }),
    },
    { key: "maxTempPenalty", label: tOr("companionPage.palletDegradation.setMaxTemp", "Max wear penalty"), value: formatPercent(settings.maxTempPenalty, { ratio: true, dp: 0 }) },
    { key: "maxPermPenalty", label: tOr("companionPage.palletDegradation.setMaxPerm", "Max spoilage penalty"), value: formatPercent(settings.maxPermPenalty, { ratio: true, dp: 0 }) },
    { key: "salvageFloor", label: tOr("companionPage.palletDegradation.setFloor", "Salvage floor"), value: formatPercent(settings.salvageFloor, { ratio: true, dp: 0 }) },
  ].filter((row) => row.value !== "—");

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.palletDegradation.lead",
        "Pallets left outside wear and spoil, faster in rain; under cover their wear recovers. Damaged pallets sell for less and pristine ones earn a bonus. This page lists your farm's pallets, worst first.",
      )}
    >
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.palletDegradation.palletsTitle", "Pallets by condition")}>
        <ModTable
          columns={[
            { key: "fill", label: tOr("companionPage.palletDegradation.colFill", "Contents") },
            { key: "level", label: tOr("companionPage.palletDegradation.colLevel", "Amount"), align: "end" },
            { key: "condition", label: tOr("companionPage.palletDegradation.colCondition", "Condition") },
            { key: "wear", label: tOr("companionPage.palletDegradation.colWear", "Wear"), align: "end" },
            { key: "outside", label: tOr("companionPage.palletDegradation.colOutside", "Outside"), align: "center" },
            { key: "sale", label: tOr("companionPage.palletDegradation.colSale", "Sale price") },
          ]}
          rows={pallets.map((p, i) => ({
            key: p.id ?? String(i),
            tone: conditionTone(p.condition),
            cells: {
              fill: (
                <>
                  {fillTypeLabel(p.fillType)}
                  {p.tracked ? null : (
                    <small class="fd-economy__muted"> {tOr("companionPage.palletDegradation.notTracked", "(does not decay)")}</small>
                  )}
                </>
              ),
              level: tOr("companionPage.palletDegradation.liters", "{{value}} L", { value: formatNumber(p.fillLevel, 0) }),
              condition:
                num(p.condition) == null ? (
                  "—"
                ) : (
                  <>
                    <ModBar ratio={(num(p.condition) ?? 0) / 100} tone={conditionTone(p.condition)} />
                    <small class="fd-economy__muted">{formatPercent(p.condition, { dp: 0 })}</small>
                  </>
                ),
              wear: formatPercent(p.wear, { dp: 0 }),
              outside: yesNo(p.outside),
              sale: saleAdjustText(p.saleAdjust),
            },
          }))}
          empty={
            farmData
              ? tOr("companionPage.palletDegradation.noPallets", "No pallets owned by this farm.")
              : tOr("companionPage.palletDegradation.waitingPallets", "Pallet condition appears once the mod has tracked pallets in this save.")
          }
        />
        {page?.coverage === "truncated" ? (
          <ModEmpty>{tOr("companionPage.palletDegradation.truncated", "Only the worst pallets are listed.")}</ModEmpty>
        ) : null}
      </Card>
      <div class="fd-mod-page__grid">
        {byFillType.length > 0 ? (
          <Card title={tOr("companionPage.palletDegradation.byFillTitle", "By contents")}>
            <ModTable
              columns={[
                { key: "fill", label: tOr("companionPage.palletDegradation.colFill", "Contents") },
                { key: "count", label: tOr("companionPage.palletDegradation.colCount", "Pallets"), align: "end" },
                { key: "outside", label: tOr("companionPage.palletDegradation.colOutsideCount", "Outside"), align: "end" },
                { key: "avg", label: tOr("companionPage.palletDegradation.colAvgCondition", "Avg condition"), align: "end" },
              ]}
              rows={byFillType.map((row, i) => ({
                key: row.fillType ?? `unknown-${i}`,
                tone: conditionTone(row.avgCondition),
                cells: {
                  fill: fillTypeLabel(row.fillType),
                  count: formatNumber(row.count, 0),
                  outside: formatNumber(row.outside, 0),
                  avg: formatPercent(row.avgCondition, { dp: 0 }),
                },
              }))}
            />
          </Card>
        ) : null}
        <Card title={tOr("companionPage.palletDegradation.settingsTitle", "Mod settings")}>
          {settingRows.length > 0 ? (
            <ModKeyValues rows={settingRows} />
          ) : (
            <ModEmpty>{tOr("companionPage.palletDegradation.noSettings", "Settings were not readable.")}</ModEmpty>
          )}
          {catalog ? (
            <p class="fd-economy__muted">
              {tOr(
                "companionPage.palletDegradation.catalog",
                "{{tracked}} fill types decay, {{muted}} do not, {{disabled}} are switched off by the whitelist.",
                {
                  tracked: formatNumber(catalog.tracked, 0),
                  muted: formatNumber(catalog.muted, 0),
                  disabled: formatNumber(catalog.disabledByWhitelist, 0),
                },
              )}
            </p>
          ) : null}
        </Card>
      </div>
      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.palletDegradation.look1", "Look at a pallet to see its condition and wear in the info box."),
          tOr("companionPage.palletDegradation.look2", "Move pallets into a shed so they stop spoiling and slowly recover wear."),
          tOr("companionPage.palletDegradation.look3", "Settings are saved with the savegame, so each save can use different rates."),
        ]}
      />
    </ModPage>
  );
}
