import { useState } from "preact/hooks";
import { Badge } from "@/components/ui";
import { t } from "@/i18n/i18n";
import {
  buildRfCropStressPanel,
  buildRfSoilPanel,
  isRfSoilActive,
  type RfSoilBarKey,
  type RfSoilBarRow,
  type RfSoilPhrase,
  type RfSoilPlanSummary,
  type RfTreatmentPlanRow,
} from "@/lib/realisticFarming/land";
import type {
  CropStressFieldInfo,
  SoilFertilizerFieldInfo,
} from "@/types/dashboard";

interface RfLandPanelsProps {
  soil?: SoilFertilizerFieldInfo;
  cropStress?: CropStressFieldInfo;
  /** When true, panels fill the card as the primary story (not a footer strip). */
  dominant?: boolean;
}

const BAR_LABEL_KEYS: Record<RfSoilBarKey, string> = {
  nitrogen: "fields.rf.soil.barN",
  phosphorus: "fields.rf.soil.barP",
  potassium: "fields.rf.soil.barK",
  ph: "fields.rf.soil.barPh",
  organicMatter: "fields.rf.soil.barOm",
  weed: "fields.rf.soil.barWeed",
  pest: "fields.rf.soil.barPest",
  disease: "fields.rf.soil.barDisease",
};

function priorityTone(
  priority: RfTreatmentPlanRow["priority"],
): "danger" | "warn" | "accent" | "default" {
  if (priority === "urgent") return "danger";
  if (priority === "watch") return "warn";
  if (priority === "ok") return "accent";
  return "default";
}

function phrase(item: RfSoilPhrase): string {
  return t(item.key, item.params);
}

/** Join localised fragments into one sentence without hard-coding punctuation per locale. */
function sentence(items: RfSoilPhrase[]): string {
  const parts = items.map(phrase).filter(Boolean);
  if (parts.length === 0) return "";
  return `${parts.join(t("fields.rf.soil.reasonSeparator"))}${t("fields.rf.soil.reasonTerminator")}`;
}

function barValueText(bar: RfSoilBarRow): string {
  if (bar.unscouted) return t("fields.rf.soil.diseaseUnscouted");
  if (bar.value == null) return t("common.notAvailable");
  if (bar.unit === "ppm") {
    return t("fields.rf.soil.ppmValue", { value: Math.round(bar.value) });
  }
  if (bar.unit === "ph") return bar.value.toFixed(1);
  if (bar.unit === "om") {
    return t("fields.rf.soil.omValue", { value: bar.value.toFixed(1) });
  }
  return t("fields.rf.percentValue", { value: Math.round(bar.value) });
}

function barTitle(bar: RfSoilBarRow): string | undefined {
  if (bar.unscouted) return t("fields.rf.soil.diseaseUnscoutedHint");
  if (bar.target == null || bar.value == null) return undefined;
  if (bar.unit === "ppm") {
    return t("fields.rf.soil.ppmVsTarget", {
      value: Math.round(bar.value),
      target: Math.round(bar.target),
    });
  }
  if (bar.unit === "ph") {
    return t("fields.rf.soil.phVsTarget", {
      value: bar.value.toFixed(1),
      target: bar.target.toFixed(1),
    });
  }
  return undefined;
}

function SoilBar({ bar }: { bar: RfSoilBarRow }) {
  const title = barTitle(bar);
  return (
    <div class={`fd-rf-soil-bar is-${bar.tone}`} title={title}>
      <span class="fd-rf-soil-bar__label">{t(BAR_LABEL_KEYS[bar.key])}</span>
      <div class={`fd-rf-soil-bar__track${bar.unscouted ? " is-unscouted" : ""}`}>
        {bar.unscouted ? null : (
          <span
            class={`fd-rf-soil-bar__fill is-${bar.tone}`}
            style={{ width: `${Math.max(bar.percent, bar.value == null ? 0 : 2)}%` }}
          />
        )}
      </div>
      <span
        class={`fd-rf-soil-bar__value is-${bar.unscouted ? "unscouted" : bar.tone}`}
      >
        {barValueText(bar)}
      </span>
    </div>
  );
}

function TreatmentBlock({
  plan,
  rows,
}: {
  plan: RfSoilPlanSummary;
  rows: RfTreatmentPlanRow[];
}) {
  const [expanded, setExpanded] = useState(false);
  const detailRows = rows.filter((row) => row.priority !== "ok");
  const reasons = sentence(plan.reasons);
  const also = plan.also.map(phrase).filter(Boolean);

  return (
    <div class={`fd-rf-treatment is-${plan.tone}`}>
      <span class="fd-rf-treatment__eyebrow">{t("fields.rf.soil.treatment")}</span>
      <strong class="fd-rf-treatment__title">{phrase(plan.title)}</strong>
      {reasons ? <p class="fd-rf-treatment__reasons">{reasons}</p> : null}
      {also.length > 0 ? (
        <p class="fd-rf-treatment__also">
          {t("fields.rf.soil.alsoPrefix", { list: also.join(t("fields.rf.soil.alsoSeparator")) })}
        </p>
      ) : null}
      {detailRows.length > 0 ? (
        <>
          <button
            type="button"
            class="fd-rf-treatment__toggle"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? t("fields.rf.soil.hideProductRates")
              : t("fields.rf.soil.showProductRates", { count: detailRows.length })}
          </button>
          {expanded ? (
            <ul class="fd-rf-treatment__list">
              {detailRows.map((row) => (
                <li key={`${row.key}-${row.label}`} class={`is-${row.priority}`}>
                  <Badge tone={priorityTone(row.priority)}>{row.label}</Badge>
                  <span>{row.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SoilPanel({
  info,
  dominant,
}: {
  info?: SoilFertilizerFieldInfo;
  dominant?: boolean;
}) {
  const model = buildRfSoilPanel(info);
  if (!model) return null;

  const rotationCrops = [
    model.rotation.lastCrop,
    model.rotation.lastCrop2,
    model.rotation.lastCrop3,
  ].filter(Boolean) as string[];

  const protectionBits = [
    model.treatments.herbicide ? t("fields.rf.soil.treatmentHerbicide") : null,
    model.treatments.insecticide ? t("fields.rf.soil.treatmentInsecticide") : null,
    model.treatments.fungicide ? t("fields.rf.soil.treatmentFungicide") : null,
  ].filter(Boolean) as string[];

  const details: { key: string; label: string; value: string }[] = [];
  if (model.growthFraction != null) {
    details.push({
      key: "stage",
      label: t("fields.rf.soil.cropStage"),
      value: t("fields.rf.percentValue", {
        value: Math.round(model.growthFraction * 100),
      }),
    });
  }
  if (model.yieldEfficiency != null) {
    details.push({
      key: "yield",
      label: t("fields.rf.soil.yieldForecast"),
      value: t("fields.rf.percentValue", {
        value: Math.round(model.yieldEfficiency),
      }),
    });
  }
  if (model.compaction != null) {
    details.push({
      key: "compaction",
      label: t("fields.rf.soil.compaction"),
      value: t("fields.rf.percentValue", { value: Math.round(model.compaction) }),
    });
  }
  if (model.burnDaysLeft > 0) {
    details.push({
      key: "burn",
      label: t("fields.rf.soil.burnDays"),
      value: t("fields.rf.soil.burnDaysValue", { days: model.burnDaysLeft }),
    });
  }
  if (rotationCrops.length > 0) {
    details.push({
      key: "rotation",
      label: t("fields.rf.soil.rotation"),
      value: rotationCrops.join(" → "),
    });
  }
  if (protectionBits.length > 0) {
    details.push({
      key: "protection",
      label: t("fields.rf.soil.protectionActive"),
      value: protectionBits.join(" · "),
    });
  }

  return (
    <section
      class={`fd-rf-soil-panel${dominant ? " is-dominant" : ""}`}
      aria-label={t("fields.rf.soil.title")}
    >
      {model.simDisabled || model.isMeadow || model.needsFertilization ? (
        <div class="fd-rf-soil-panel__flags">
          {model.simDisabled ? (
            <Badge tone="warn">{t("fields.rf.soil.paused")}</Badge>
          ) : null}
          {model.isMeadow ? (
            <Badge tone="default">{t("fields.rf.soil.meadow")}</Badge>
          ) : null}
          {model.needsFertilization ? (
            <Badge tone="warn">{t("fields.rf.soil.needsFertilization")}</Badge>
          ) : null}
        </div>
      ) : null}

      {model.simDisabled && model.simDisabledReason ? (
        <p class="fd-rf-soil-panel__note">{model.simDisabledReason}</p>
      ) : null}

      {model.amendBurnRisk ? (
        <p class="fd-rf-soil-panel__note is-alert">
          {t("fields.rf.soil.amendBurnRisk")}
        </p>
      ) : null}

      <div class="fd-rf-soil-bars">
        {model.bars.map((bar) => (
          <SoilBar key={bar.key} bar={bar} />
        ))}
      </div>

      <TreatmentBlock plan={model.plan} rows={model.treatmentPlan} />

      {details.length > 0 ? (
        <dl class="fd-rf-soil-panel__details">
          {details.map((row) => (
            <div key={row.key}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function CropStressPanel({ info }: { info?: CropStressFieldInfo }) {
  const model = buildRfCropStressPanel(info);
  if (!model) return null;
  const badgeTone = model.critical ? "danger" : "accent";
  return (
    <section
      class={`fd-rf-land-panel${model.critical ? " is-critical" : ""}`}
      aria-label={t("fields.rf.cropStress.title")}
    >
      <div class="fd-rf-land-panel__header">
        <strong>{t("fields.rf.cropStress.title")}</strong>
        <div class="fd-rf-land-panel__badges">
          <Badge tone={badgeTone}>
            {model.critical
              ? t("fields.rf.cropStress.critical")
              : t("fields.rf.cropStress.stable")}
          </Badge>
          {model.difficulty ? (
            <Badge tone="default">
              {t("fields.rf.cropStress.difficulty", { value: model.difficulty })}
            </Badge>
          ) : null}
        </div>
      </div>
      {model.alertHint ? (
        <p class="fd-rf-land-panel__note fd-rf-land-panel__note--alert">
          {model.alertHint}
        </p>
      ) : null}
      <div class="fd-rf-land-panel__metrics">
        <div>
          <small>{t("fields.rf.cropStress.moisture")}</small>
          <strong>
            {model.moisturePercent == null
              ? t("common.notAvailable")
              : t("fields.rf.percentValue", {
                  value: Math.round(model.moisturePercent),
                })}
          </strong>
        </div>
        <div>
          <small>{t("fields.rf.cropStress.droughtStress")}</small>
          <strong>
            {model.stressPercent == null
              ? t("common.notAvailable")
              : t("fields.rf.percentValue", {
                  value: Math.round(model.stressPercent),
                })}
          </strong>
        </div>
        <div>
          <small>{t("fields.rf.cropStress.irrigation")}</small>
          <strong>
            {model.irrigationActive == null
              ? t("common.notAvailable")
              : model.irrigationActive
                ? t("fields.rf.cropStress.irrigationActive")
                : t("fields.rf.cropStress.irrigationInactive")}
          </strong>
        </div>
      </div>
      {model.outlook.length > 0 ? (
        <details class="fd-rf-outlook">
          <summary>{t("fields.rf.cropStress.outlook")}</summary>
          <div>
            {model.outlook.map((day) => (
              <span key={day.dayOffset}>
                {t("fields.rf.cropStress.outlookDay", {
                  day: day.dayOffset,
                  value: Math.round(day.moisturePercent),
                })}
              </span>
            ))}
          </div>
          <small class="fd-rf-outlook__approx">
            {t("fields.rf.cropStress.outlookApprox")}
          </small>
        </details>
      ) : null}
    </section>
  );
}

export function RfLandPanels({ soil, cropStress, dominant }: RfLandPanelsProps) {
  const showSoil = isRfSoilActive(soil);
  const showStress = buildRfCropStressPanel(cropStress) != null;
  if (!showSoil && !showStress) return null;
  return (
    <div class={`fd-rf-land-panels${dominant ? " is-dominant" : ""}`}>
      <SoilPanel info={soil} dominant={dominant} />
      <CropStressPanel info={cropStress} />
    </div>
  );
}
