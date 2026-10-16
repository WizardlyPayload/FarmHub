import { Badge, Card } from "@/components/ui";
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
  type CompanionPageProps,
  type ModKeyValue,
  type ModRow,
  type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.realisticAnimalLosses";

type LossPen = {
  name?: string;
  animalType?: string;
  animals?: number;
  riskAgeMonths?: number;
  oldAnimals?: number;
  foodEffectivity?: number;
  belowThreshold?: boolean;
  noWater?: boolean;
  noStraw?: boolean;
  careRiskPercentPerCheck?: number;
  ageRiskPercentPerCheck?: number;
  lastWarnedCareRiskPercent?: number;
  lastWarnedAgeRiskPercent?: number;
};

type RiskAge = { animalType?: string; months?: number };

function issues(pen: LossPen): string {
  const out: string[] = [];
  if (pen.belowThreshold) out.push(tOr(`${K}.issueFood`, "Feed below threshold"));
  if (pen.noWater) out.push(tOr(`${K}.issueWater`, "No water"));
  if (pen.noStraw) out.push(tOr(`${K}.issueStraw`, "No straw"));
  return out.join(", ");
}

function risk(value: unknown): string {
  return num(value) == null ? "—" : formatPercent(value, { dp: 1 });
}

export function RealisticAnimalLossesPage({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const settings = (page?.settings ?? {}) as Record<string, unknown>;
  const rules = (page?.rules ?? {}) as Record<string, unknown>;
  const riskAges = asList<RiskAge>(rules.riskAges);
  const pens = asList<LossPen>(farmData?.pens);
  const threshold = num(settings.foodEffectivityThreshold);

  const tiles: ModStatTile[] = [];
  if (threshold != null) {
    tiles.push({
      key: "threshold",
      label: tOr(`${K}.tileThreshold`, "Feed threshold"),
      value: formatPercent(threshold, { dp: 0 }),
      hint: num(settings.defaultFoodEffectivityThreshold) == null
        ? null
        : tOr(`${K}.tileThresholdHint`, "Default {{value}}", { value: formatPercent(settings.defaultFoodEffectivityThreshold, { dp: 0 }) }),
    });
  }
  if (farmData) {
    const atRisk = num(farmData.pensAtRisk) ?? 0;
    tiles.push({
      key: "atRisk",
      label: tOr(`${K}.tileAtRisk`, "Pens at risk"),
      value: `${formatNumber(atRisk)} / ${formatNumber(farmData.penCount)}`,
      tone: atRisk > 0 ? "danger" : "ok",
    });
    tiles.push({ key: "animals", label: tOr(`${K}.tileAnimals`, "Animals"), value: formatNumber(farmData.animals) });
    tiles.push({
      key: "old",
      label: tOr(`${K}.tileOld`, "Past risk age"),
      value: formatNumber(farmData.oldAnimals),
      tone: (num(farmData.oldAnimals) ?? 0) > 0 ? "warn" : undefined,
    });
    tiles.push({
      key: "supply",
      label: tOr(`${K}.tileSupply`, "Missing water / straw"),
      value: `${formatNumber(farmData.pensNoWater)} / ${formatNumber(farmData.pensNoStraw)}`,
      tone: (num(farmData.pensNoWater) ?? 0) > 0 ? "danger" : undefined,
    });
  }

  const rows: ModRow[] = pens.map((pen, i) => {
    const care = num(pen.careRiskPercentPerCheck) ?? 0;
    const age = num(pen.ageRiskPercentPerCheck) ?? 0;
    const eff = num(pen.foodEffectivity);
    return {
      key: `${i}-${pen.name ?? ""}`,
      tone: pen.noWater || care > 0 ? "danger" : age > 0 || pen.belowThreshold || pen.noStraw ? "warn" : undefined,
      cells: {
        name: pen.name || tOr(`${K}.unnamedPen`, "Unnamed pen"),
        type: pen.animalType || "—",
        animals: formatNumber(pen.animals),
        food: eff == null ? "—" : (
          <span title={formatPercent(eff, { dp: 0 })}>
            <ModBar ratio={eff / 100} tone={pen.belowThreshold ? "danger" : undefined} label={formatPercent(eff, { dp: 0 })} />
            {formatPercent(eff, { dp: 0 })}
          </span>
        ),
        issues: issues(pen) || tOr(`${K}.issueNone`, "None"),
        care: risk(pen.careRiskPercentPerCheck),
        old: num(pen.riskAgeMonths) == null
          ? formatNumber(pen.oldAnimals)
          : tOr(`${K}.oldValue`, "{{count}} (over {{months}} months)", {
            count: formatNumber(pen.oldAnimals),
            months: formatNumber(pen.riskAgeMonths),
          }),
        age: risk(pen.ageRiskPercentPerCheck),
        warned: `${risk(pen.lastWarnedCareRiskPercent)} / ${risk(pen.lastWarnedAgeRiskPercent)}`,
      },
    };
  });

  const ruleRows: ModKeyValue[] = [];
  if (num(rules.checkHour) != null) {
    ruleRows.push({ key: "hour", label: tOr(`${K}.ruleHour`, "Daily check"), value: tOr(`${K}.ruleHourValue`, "{{hour}}:00", { hour: formatNumber(rules.checkHour) }) });
  }
  if (num(rules.warningWaitingHours) != null) {
    ruleRows.push({
      key: "warn",
      label: tOr(`${K}.ruleWarning`, "Warning before losses"),
      value: tOr(`${K}.hours`, "{{count}} hours", { count: formatNumber(rules.warningWaitingHours) }),
    });
  }
  if (num(rules.ageLossRatePercent) != null) {
    ruleRows.push({ key: "ageRate", label: tOr(`${K}.ruleAgeRate`, "Old-age loss rate"), value: formatPercent(rules.ageLossRatePercent, { dp: 0 }) });
  }
  if (num(rules.waterLossRatePercent) != null) {
    ruleRows.push({ key: "waterRate", label: tOr(`${K}.ruleWaterRate`, "Extra loss rate without water"), value: formatPercent(rules.waterLossRatePercent, { dp: 0 }) });
  }
  if (num(rules.strawLossRatePercent) != null) {
    ruleRows.push({ key: "strawRate", label: tOr(`${K}.ruleStrawRate`, "Extra loss rate without straw"), value: formatPercent(rules.strawLossRatePercent, { dp: 0 }) });
  }
  if (num(page?.daysPerPeriod) != null) {
    ruleRows.push({ key: "days", label: tOr(`${K}.ruleDays`, "Days per period"), value: formatNumber(page?.daysPerPeriod) });
  }

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        `${K}.lead`,
        "Animals can die when their feed falls below the threshold, when water or straw runs out, or when they grow old. The mod warns you before it takes any.",
      )}
    >
      {page?.firstSeasonGrace === true ? (
        <p class="fd-mod-page__notice is-limited" role="status">
          {tOr(`${K}.grace`, "Losses are paused during the first months of a new save. The risks below start to count after that.")}
        </p>
      ) : null}

      <ModStatTiles tiles={tiles} />

      <Card title={tOr(`${K}.pensTitle`, "Pens and loss risk")}>
        {farmData?.truncated === true ? <Badge tone="warn">{tOr(`${K}.truncated`, "Showing the first pens only")}</Badge> : null}
        <ModTable
          columns={[
            { key: "name", label: tOr(`${K}.colPen`, "Pen") },
            { key: "type", label: tOr(`${K}.colType`, "Animal") },
            { key: "animals", label: tOr(`${K}.colAnimals`, "Animals"), align: "end" },
            { key: "food", label: tOr(`${K}.colFood`, "Feed effectiveness") },
            { key: "issues", label: tOr(`${K}.colIssues`, "Problems") },
            { key: "care", label: tOr(`${K}.colCare`, "Care loss risk"), align: "end" },
            { key: "old", label: tOr(`${K}.colOld`, "Old animals"), align: "end" },
            { key: "age", label: tOr(`${K}.colAge`, "Old-age loss risk"), align: "end" },
            { key: "warned", label: tOr(`${K}.colWarned`, "Last warning (care / age)"), align: "end" },
          ]}
          rows={rows}
          empty={tOr(`${K}.pensEmpty`, "No animal pens on your farm.")}
        />
        <p class="fd-economy__muted">
          {tOr(
            `${K}.pensNote`,
            "Risk is the chance per animal at the next daily check, worked out with the mod's own formula from the pen's current state. It changes as soon as you feed, water or bed the pen.",
          )}
        </p>
      </Card>

      <Card title={tOr(`${K}.rulesTitle`, "Loss rules")}>
        {ruleRows.length > 0 ? <ModKeyValues rows={ruleRows} /> : <ModEmpty>{tOr(`${K}.rulesEmpty`, "No rules were readable.")}</ModEmpty>}
        {riskAges.length > 0 ? (
          <>
            <h4 class="fd-mod-page__subhead">{tOr(`${K}.riskAgesTitle`, "Old-age risk starts at")}</h4>
            <ModKeyValues
              rows={riskAges.map((row, i) => ({
                key: `${i}-${row.animalType}`,
                label: row.animalType || "—",
                value: tOr(`${K}.months`, "{{count}} months", { count: formatNumber(row.months) }),
              }))}
            />
          </>
        ) : null}
      </Card>

      <ModAbout
        entry={entry}
        lookFor={[
          tOr(`${K}.look1`, "A warning message a few hours before the daily check means a pen is at risk; fix it before then."),
          tOr(`${K}.look2`, "Feed effectiveness is the mod's own feed score for the pen, compared with the threshold above."),
          tOr(`${K}.look3`, "Sell or move animals past the risk age if you do not want old-age losses."),
        ]}
      />
    </ModPage>
  );
}
