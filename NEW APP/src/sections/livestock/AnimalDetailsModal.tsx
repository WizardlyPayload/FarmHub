import { t, tOr } from "@/i18n/i18n";
import { formatFillQuantity } from "@/lib/fill-units";
import { useFillPhysics, useFillUnitMode, useUnitDisplay } from "@/lib/fill-unit-mode";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { Badge, Button } from "@/components/ui";
import {
  displayAnimalEarTag,
  displayAnimalHealth,
  formatAnimalType,
  resolveAnimalLocationLabel,
  resolveAnimalSubTypeRaw,
  reproductionRate,
  roundAgeMonths,
} from "@/lib/livestock-format";
import {
  calculateAnimalValue,
  getAgeDescriptionKey,
  getGeneticsDescriptionKey,
  getPregnancyEstimate,
} from "@/lib/livestock-value";
import { EstimatedAnimalMoney } from "@/sections/livestock/AnimalDetailPanel";
import type { LivestockAnimal } from "@/lib/livestock-types";

interface Props {
  animal: LivestockAnimal;
  onClose: () => void;
}

function formatGender(gender: unknown): string {
  const g = String(gender ?? "").trim().toLowerCase();
  if (g === "male" || g === "m") return t("livestock.genderMale");
  if (g === "female" || g === "f") return t("livestock.genderFemale");
  return t("livestock.genderUnknown");
}

function formatWeight(animal: LivestockAnimal, decimals = 0): string {
  const w = Number(animal.weight ?? 0);
  if (
    (animal.__lodSynth || animal.__lodClusterAggregate || animal.__lodSynthEstimate) &&
    (!Number.isFinite(w) || w <= 0)
  ) {
    return t("common.notAvailable");
  }
  return t("livestock.fmtWeightKg", { kg: w.toFixed(decimals) });
}

function yesNo(v: boolean): string {
  return v ? t("common.yes") : t("common.no");
}

function reproductionDescription(animal: LivestockAnimal): string {
  const parts: string[] = [];
  if (animal.isPregnant) parts.push(t("livestock.reproDescPregnant"));
  if (animal.isParent) parts.push(t("livestock.reproDescBreedingStock"));
  if (animal.isLactating) parts.push(t("livestock.reproDescLactating"));
  return parts.length ? parts.join(", ") : t("livestock.reproDescStandard");
}

export function AnimalDetailsModal({ animal, onClose }: Props) {
  const fillMode = useFillUnitMode();
  const fillPhysics = useFillPhysics();
  const unitDisplay = useUnitDisplay();
  const trapRef = useFocusTrap(true, onClose);
  const earTag = displayAnimalEarTag(animal);
  const titleName = animal.name || t("livestock.nameFallback", { id: earTag });
  const rate = reproductionRate(animal);
  const valueInfo = calculateAnimalValue(animal);
  const breakdown = valueInfo.breakdown;
  const pregnancy = animal.isPregnant ? getPregnancyEstimate(animal) : null;
  const happiness = Number(animal.happiness ?? animal.avgHappiness);
  const fleece = Number(animal.fleeceState ?? animal.avgFleeceState);
  const hasHappiness = (animal.happiness != null || animal.avgHappiness != null) && Number.isFinite(happiness);
  const hasFleece = (animal.fleeceState != null || animal.avgFleeceState != null) && Number.isFinite(fleece);
  const isAlpaca = String(animal.subType ?? "").toUpperCase().startsWith("ALPACA");
  const hasShearingStatus = isAlpaca && typeof animal.canBeSheared === "boolean";
  const fleeceLiters = animal.fleeceLiters;
  const hasFleeceAmount = isAlpaca && typeof fleeceLiters === "number" && Number.isFinite(fleeceLiters) && fleeceLiters >= 0;

  return (
    <div class="fd-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        class="fd-modal"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="animal-details-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="fd-modal__header">
          <h3 id="animal-details-title">
            {titleName} <Badge tone="accent">#{earTag}</Badge>
          </h3>
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>

        <div class="fd-modal__grid">
          <div class="fd-modal__panel">
            <h4>{t("livestock.modalTag")}</h4>
            <div class="fd-livestock__tag">
              <img src="/assests/img/tag.svg" alt="" width={96} height={128} loading="lazy" />
              <div class="fd-livestock__tag-id">#{earTag}</div>
              {animal.numAnimals ? (
                <small>
                  {t("livestock.labelNumAnimals")} {animal.numAnimals}
                </small>
              ) : null}
            </div>
            {(animal.motherId && animal.motherId !== -1) ||
            (animal.fatherId && animal.fatherId !== -1) ? (
              <div style={{ marginTop: "0.75rem" }}>
                <h4>{t("livestock.modalFamily")}</h4>
                {animal.motherId && animal.motherId !== -1 ? (
                  <div>
                    {t("livestock.labelMotherId")} <code>#{animal.motherId}</code>
                  </div>
                ) : null}
                {animal.fatherId && animal.fatherId !== -1 ? (
                  <div>
                    {t("livestock.labelFatherId")} <code>#{animal.fatherId}</code>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div class="fd-modal__panel">
            <h4>{t("livestock.modalBasicInfo")}</h4>
            <table class="fd-modal__kv">
              <tbody>
                <tr>
                  <td>{t("livestock.labelName")}</td>
                  <td>{titleName}</td>
                </tr>
                <tr>
                  <td>{t("livestock.labelType")}</td>
                  <td>
                    {formatAnimalType(resolveAnimalSubTypeRaw(animal) || t("common.unknown"))}
                  </td>
                </tr>
                <tr>
                  <td>{t("livestock.labelGender")}</td>
                  <td>{formatGender(animal.gender)}</td>
                </tr>
                <tr>
                  <td>{t("livestock.labelAge")}</td>
                  <td>{t("livestock.fmtAgeMonths", { months: roundAgeMonths(animal.age || 0) })}</td>
                </tr>
                <tr>
                  <td>{t("livestock.labelLocation")}</td>
                  <td>{resolveAnimalLocationLabel(animal)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="fd-modal__panel">
            <h4>{t("livestock.modalHealthPhysical")}</h4>
            <table class="fd-modal__kv">
              <tbody>
                <tr>
                  <td>{t("livestock.labelHealth")}</td>
                  <td>{Math.round(displayAnimalHealth(animal))}%</td>
                </tr>
                <tr>
                  <td>{t("livestock.labelWeight")}</td>
                  <td>{formatWeight(animal, 0)}</td>
                </tr>
                {hasHappiness ? (
                  <tr>
                    <td>{t("livestock.alpacaHappiness")}</td>
                    <td>{Math.round(Math.max(0, Math.min(100, happiness)))}%</td>
                  </tr>
                ) : null}
                {hasFleece ? (
                  <tr>
                    <td>{t("livestock.alpacaFleece")}</td>
                    <td>{Math.round(Math.max(0, Math.min(100, fleece)))}%</td>
                  </tr>
                ) : null}
                {hasShearingStatus ? (
                  <tr>
                    <td>{tOr("livestock.alpacaCanBeSheared", "Can be sheared")}</td>
                    <td>{yesNo(animal.canBeSheared === true)}</td>
                  </tr>
                ) : null}
                {hasFleeceAmount ? (
                  <tr>
                    <td>{tOr("livestock.alpacaFleeceAmount", "Fleece amount")}</td>
                    <td>{formatFillQuantity(fleeceLiters, "ALPACAFLEECE", fillMode, fillPhysics, unitDisplay)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td>{t("livestock.labelReproduction")}</td>
                  <td>{rate.toFixed(2)}x</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="fd-modal__panel" style={{ marginTop: "0.75rem" }}>
          <h4>{t("livestock.modalReproductionData")}</h4>
          <div class="fd-modal__grid">
            <table class="fd-modal__kv">
              <tbody>
                <tr>
                  <td>{t("livestock.labelIsParent")}</td>
                  <td>
                    <Badge tone={animal.isParent ? "accent" : "default"}>{yesNo(!!animal.isParent)}</Badge>
                  </td>
                </tr>
                <tr>
                  <td>{t("livestock.labelIsPregnant")}</td>
                  <td>
                    <Badge tone={animal.isPregnant ? "warn" : "default"}>
                      {yesNo(!!animal.isPregnant)}
                    </Badge>
                  </td>
                </tr>
                <tr>
                  <td>{t("livestock.labelIsLactating")}</td>
                  <td>
                    <Badge tone={animal.isLactating ? "accent" : "default"}>
                      {yesNo(!!animal.isLactating)}
                    </Badge>
                  </td>
                </tr>
                <tr>
                  <td>{t("livestock.labelReproductionRate")}</td>
                  <td>
                    <div class="fd-progress">
                      <div class="fd-progress__bar" style={{ width: `${Math.min(200, rate * 100)}%` }}>
                        {rate.toFixed(2)}x
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>{t("livestock.labelMonthsSinceBirth")}</td>
                  <td>
                    {animal.monthsSinceLastBirth !== undefined
                      ? t("livestock.fmtAgeMonths", {
                          months: roundAgeMonths(animal.monthsSinceLastBirth),
                        })
                      : t("common.notAvailable")}
                  </td>
                </tr>
              </tbody>
            </table>

            <table class="fd-modal__kv">
              <tbody>
                {pregnancy ? (
                  <>
                    <tr>
                      <td>{t("livestock.labelEstDueDate")}</td>
                      <td>
                        {pregnancy.monthsRemaining === 0
                          ? t("livestock.pregnancyDueSoon")
                          : pregnancy.monthsRemaining === 1
                            ? t("livestock.fmtApproxOneMonth", { n: pregnancy.monthsRemaining })
                            : t("livestock.fmtApproxMonths", { n: pregnancy.monthsRemaining })}
                      </td>
                    </tr>
                    <tr>
                      <td>{t("livestock.labelExpectedCount")}</td>
                      <td>{pregnancy.expectedCount}</td>
                    </tr>
                    <tr>
                      <td>{t("livestock.labelPregnancyProgress")}</td>
                      <td>{(pregnancy.pregnancyProgress * 100).toFixed(0)}%</td>
                    </tr>
                  </>
                ) : null}
                {animal.impregnatedBy && animal.impregnatedBy !== -1 ? (
                  <tr>
                    <td>{t("livestock.labelImpregnatedBy")}</td>
                    <td>
                      <code>#{animal.impregnatedBy}</code>
                    </td>
                  </tr>
                ) : null}
                {animal.pregnancyDuration ? (
                  <tr>
                    <td>{t("livestock.labelPregnancyDuration")}</td>
                    <td>{t("livestock.durationDays", { days: animal.pregnancyDuration })}</td>
                  </tr>
                ) : null}
                {animal.offspring ? (
                  <tr>
                    <td>{t("livestock.labelExpectedOffspring")}</td>
                    <td>{animal.offspring}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {animal.genetics ? (
            <div style={{ marginTop: "0.85rem" }}>
              <h4>{t("livestock.geneticsHeading")}</h4>
              <div class="fd-modal__grid">
                {(
                  [
                    ["livestock.geneticsShortHealth", animal.genetics.health],
                    ["livestock.geneticsShortFertility", animal.genetics.fertility],
                    ["livestock.geneticsShortProductivity", animal.genetics.productivity],
                    ["livestock.geneticsShortQuality", animal.genetics.quality],
                  ] as const
                ).map(([key, val]) => (
                  <div key={key}>
                    <small class="fd-livestock__status">{t(key)}</small>
                    <div>{(val || 1).toFixed(2)}x</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div class="fd-modal__panel" style={{ marginTop: "0.75rem" }}>
          <h4>{t("livestock.modalLivestockValue")}</h4>
          <div class="fd-modal__grid">
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.4rem", color: "var(--farm-accent)", fontWeight: 700 }}>
                <EstimatedAnimalMoney amount={valueInfo.value} />
              </div>
              <small class="fd-livestock__status">
                {t("livestock.valueEstimatedTitle")}
                <br />
                {t("livestock.valueDisclaimer")}
              </small>
            </div>
            <div>
              <h4>{t("livestock.valueBreakdownTitle")}</h4>
              <table class="fd-modal__kv">
                <tbody>
                  <tr>
                    <td>{t("livestock.valueBaseValue", { type: breakdown.animalType })}</td>
                    <td><EstimatedAnimalMoney amount={breakdown.baseValue} /></td>
                  </tr>
                  <tr>
                    <td>{t("livestock.valueAgeFactor")}</td>
                    <td>
                      {(breakdown.ageFactor * 100).toFixed(0)}% ({t(getAgeDescriptionKey(animal.age || 0))})
                    </td>
                  </tr>
                  <tr>
                    <td>{t("livestock.valueHealthFactor")}</td>
                    <td>
                      {(breakdown.healthFactor * 100).toFixed(0)}% (
                      {t("livestock.valueHealthPct", { pct: Math.round(animal.health || 0) })})
                    </td>
                  </tr>
                  <tr>
                    <td>{t("livestock.valueGeneticsFactor")}</td>
                    <td>
                      {breakdown.geneticsFactor.toFixed(2)}x ({t(getGeneticsDescriptionKey(animal.genetics))})
                    </td>
                  </tr>
                  <tr>
                    <td>{t("livestock.valueReproductionFactor")}</td>
                    <td>
                      {(breakdown.reproductionFactor * 100).toFixed(0)}% ({reproductionDescription(animal)})
                    </td>
                  </tr>
                  {breakdown.weightFactor !== 1.0 ? (
                    <tr>
                      <td>{t("livestock.valueWeightFactor")}</td>
                      <td>
                        {(breakdown.weightFactor * 100).toFixed(0)}% ({formatWeight(animal, 2)})
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem" }}>
                <strong>{t("livestock.valueEstimatedFinal")}</strong>
                <strong style={{ color: "var(--farm-accent)" }}><EstimatedAnimalMoney amount={valueInfo.value} /></strong>
              </div>
            </div>
          </div>
        </div>

        <div class="fd-modal__footer">
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
