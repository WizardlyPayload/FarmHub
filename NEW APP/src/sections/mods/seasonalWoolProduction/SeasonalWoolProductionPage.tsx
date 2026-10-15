import { Badge, Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModAbout,
  ModEmpty,
  ModKeyValues,
  ModPage,
  ModStatTiles,
  ModTable,
  asList,
  formatNumber,
  num,
  periodLabel,
  useCompanionPage,
  useMoney,
  yesNo,
  type CompanionPageProps,
  type ModKeyValue,
  type ModRow,
  type ModStatTile,
} from "@/sections/mods/shared";
import "./wool.css";

const K = "companionPage.seasonalWoolProduction";

type WoolPen = {
  name?: string;
  hooked?: boolean;
  rawRateLph?: number;
  historyAvgLph?: number;
  monthsRecorded?: number;
  lastShearingPeriod?: number;
  monthsSinceShearing?: number;
  matureSheep?: number;
  totalSheep?: number;
  pendingWoolLiters?: number;
  nextShearingCost?: number;
};

const NOTIFY: { key: string; label: () => string }[] = [
  { key: "notifyNextMonth", label: () => tOr(`${K}.settingNotifyNext`, "Warn a month before shearing") },
  { key: "notifyShearingBegins", label: () => tOr(`${K}.settingNotifyBegins`, "Shearing started notifications") },
  { key: "notifyShearingComplete", label: () => tOr(`${K}.settingNotifyComplete`, "Shearing finished notifications") },
  { key: "notifyShearingCost", label: () => tOr(`${K}.settingNotifyCost`, "Shearing cost notifications") },
  { key: "notifyLargeWool", label: () => tOr(`${K}.settingNotifyLarge`, "Large wool yield notifications") },
];

function litres(value: unknown, dp = 0): string {
  const n = num(value);
  return n == null ? "—" : tOr(`${K}.litres`, "{{value}} L", { value: formatNumber(n, dp) });
}

export function SeasonalWoolProductionPage({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const money = useMoney();
  const settings = (page?.settings ?? {}) as Record<string, unknown>;
  const shearing = asList<number>(page?.shearingPeriods);
  const pens = asList<WoolPen>(farmData?.pens);
  const until = num(page?.monthsUntilShearing);

  const tiles: ModStatTile[] = [];
  if (page?.isShearingMonth === true) {
    tiles.push({
      key: "next",
      label: tOr(`${K}.tileNext`, "Next shearing"),
      value: page?.shearingCompleted === true
        ? tOr(`${K}.shearingDone`, "Done this period")
        : tOr(`${K}.shearingNow`, "This period"),
      tone: page?.shearingCompleted === true ? "ok" : "warn",
    });
  } else if (num(page?.nextShearingPeriod) != null) {
    tiles.push({
      key: "next",
      label: tOr(`${K}.tileNext`, "Next shearing"),
      value: periodLabel(page?.nextShearingPeriod),
      hint: until == null ? null : tOr(`${K}.inMonths`, "in {{count}} months", { count: formatNumber(until) }),
    });
  }
  if (num(page?.currentPeriod) != null) {
    tiles.push({ key: "period", label: tOr(`${K}.tilePeriod`, "Current period"), value: periodLabel(page?.currentPeriod) });
  }
  if (farmData) {
    tiles.push({
      key: "sheep",
      label: tOr(`${K}.tileSheep`, "Sheep ready to shear"),
      value: `${formatNumber(farmData.matureSheep)} / ${formatNumber(farmData.totalSheep)}`,
      hint: tOr(`${K}.tileSheepHint`, "mature / all sheep"),
    });
    tiles.push({ key: "pending", label: tOr(`${K}.tilePending`, "Wool not yet on a pallet"), value: litres(farmData.pendingWoolLiters) });
    tiles.push({ key: "cost", label: tOr(`${K}.tileCost`, "Next shearing cost"), value: money(farmData.nextShearingCost) });
  }

  const rows: ModRow[] = pens.map((pen, i) => ({
    key: `${i}-${pen.name ?? ""}`,
    tone: pen.hooked ? undefined : "warn",
    cells: {
      name: pen.name || tOr(`${K}.unnamedPen`, "Unnamed pen"),
      sheep: `${formatNumber(pen.matureSheep)} / ${formatNumber(pen.totalSheep)}`,
      rate: litres(pen.rawRateLph, 2),
      history: num(pen.historyAvgLph) == null
        ? "—"
        : tOr(`${K}.historyValue`, "{{value}} ({{count}} months)", {
          value: litres(pen.historyAvgLph, 2),
          count: formatNumber(pen.monthsRecorded),
        }),
      last: num(pen.lastShearingPeriod) == null ? tOr(`${K}.never`, "Not yet") : periodLabel(pen.lastShearingPeriod),
      since: formatNumber(pen.monthsSinceShearing),
      pending: litres(pen.pendingWoolLiters),
      cost: money(pen.nextShearingCost),
      tracked: yesNo(pen.hooked),
    },
  }));

  const settingRows: ModKeyValue[] = [];
  if (num(settings.shearingCostPerSheep) != null) {
    settingRows.push({ key: "fee", label: tOr(`${K}.settingFee`, "Shearing fee per mature sheep"), value: money(settings.shearingCostPerSheep) });
  }
  for (const s of NOTIFY) {
    if (typeof settings[s.key] === "boolean") settingRows.push({ key: s.key, label: s.label(), value: yesNo(settings[s.key]) });
  }
  if (typeof page?.realisticLivestockMode === "boolean") {
    settingRows.push({
      key: "rl",
      label: tOr(`${K}.settingRealisticLivestock`, "Realistic Livestock mode"),
      value: yesNo(page.realisticLivestockMode),
    });
  }

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        `${K}.lead`,
        "Wool no longer trickles out all year: sheep grow it between shearings, and each shearing period pays out the wool for a fee per mature sheep.",
      )}
    >
      <ModStatTiles tiles={tiles} />

      <Card title={tOr(`${K}.scheduleTitle`, "Shearing schedule")}>
        {shearing.length > 0 ? (
          <div class="fd-mod-wool__periods">
            {shearing.map((p) => (
              <Badge key={p} tone={p === num(page?.nextShearingPeriod) ? "accent" : "default"}>
                {periodLabel(p)}
              </Badge>
            ))}
          </div>
        ) : (
          <ModEmpty>{tOr(`${K}.scheduleEmpty`, "The shearing periods have not been read yet.")}</ModEmpty>
        )}
      </Card>

      <Card title={tOr(`${K}.pensTitle`, "Sheep pens")}>
        {farmData?.truncated === true ? <Badge tone="warn">{tOr(`${K}.truncated`, "Showing the first pens only")}</Badge> : null}
        <ModTable
          columns={[
            { key: "name", label: tOr(`${K}.colPen`, "Pen") },
            { key: "sheep", label: tOr(`${K}.colSheep`, "Mature / all"), align: "end" },
            { key: "rate", label: tOr(`${K}.colRate`, "Wool rate (L/h)"), align: "end" },
            { key: "history", label: tOr(`${K}.colHistory`, "Recorded average"), align: "end" },
            { key: "last", label: tOr(`${K}.colLast`, "Last shorn") },
            { key: "since", label: tOr(`${K}.colSince`, "Months since"), align: "end" },
            { key: "pending", label: tOr(`${K}.colPending`, "Not on a pallet"), align: "end" },
            { key: "cost", label: tOr(`${K}.colCost`, "Next cost"), align: "end" },
            { key: "tracked", label: tOr(`${K}.colTracked`, "Tracked by mod") },
          ]}
          rows={rows}
          empty={
            page?.initialized === false
              ? tOr(`${K}.pensNotStarted`, "The mod has not started in this save yet, so no pen figures are available.")
              : tOr(`${K}.pensEmpty`, "No sheep pens on your farm.")
          }
        />
        <p class="fd-economy__muted">
          {tOr(
            `${K}.pensNote`,
            "Wool not yet on a pallet is the pen's own buffer; it becomes a pallet once there is enough. Pens the mod is not tracking keep the game's normal wool output.",
          )}
        </p>
      </Card>

      <Card title={tOr(`${K}.settingsTitle`, "Mod settings")}>
        {settingRows.length > 0 ? (
          <ModKeyValues rows={settingRows} />
        ) : (
          <ModEmpty>{tOr(`${K}.settingsEmpty`, "No settings were readable.")}</ModEmpty>
        )}
      </Card>

      <ModAbout
        entry={entry}
        lookFor={[
          tOr(`${K}.look1`, "Wool pallets appear at the pen in the shearing periods listed above, not every hour."),
          tOr(`${K}.look2`, "The shearing fee is charged for mature sheep only; lambs are not counted."),
          tOr(`${K}.look3`, "The mod keeps no lifetime total of wool sheared, so FarmHub does not show one."),
        ]}
      />
    </ModPage>
  );
}
