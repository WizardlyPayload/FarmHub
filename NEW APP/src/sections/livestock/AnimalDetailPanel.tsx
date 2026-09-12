import { t } from "@/i18n/i18n";
import { Badge, Button } from "@/components/ui";
import {
  displayAnimalEarTag,
  displayAnimalHealth,
  formatAnimalType,
  getHealthClass,
  resolveAnimalLocationLabel,
  resolveAnimalSubTypeRaw,
  roundAgeMonths,
  shouldShowHealthErrorBadge,
} from "@/lib/livestock-format";
import { formatGeneticsPercent } from "@/lib/genetics-overview";
import { calculateAnimalValue, getGeneticsDescriptionKey } from "@/lib/livestock-value";
import type { LivestockAnimal } from "@/lib/livestock-types";

interface Props {
  animal: LivestockAnimal;
  onFullDetails: () => void;
  onOpenPen?: () => void;
  onClose: () => void;
}

function formatGender(gender: unknown): string {
  const g = String(gender ?? "").trim().toLowerCase();
  if (g === "male" || g === "m") return t("livestock.genderMale");
  if (g === "female" || g === "f") return t("livestock.genderFemale");
  return t("livestock.genderUnknown");
}

export function AnimalDetailPanel({ animal, onFullDetails, onOpenPen, onClose }: Props) {
  const earTag = displayAnimalEarTag(animal);
  const titleName = animal.name || t("livestock.nameFallback", { id: earTag });
  const health = displayAnimalHealth(animal);
  const valueInfo = calculateAnimalValue(animal);
  const g = animal.genetics;

  return (
    <aside class="fd-livestock__detail-panel" aria-label={t("livestock.detailPanelTitle")}>
      <div class="fd-livestock__detail-head">
        <div>
          <h3>{titleName}</h3>
          <p class="fd-livestock__status">
            <code>#{earTag}</code>
            {" · "}
            {formatAnimalType(resolveAnimalSubTypeRaw(animal) || t("common.unknown"))}
          </p>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label={t("common.close")}>
          ×
        </Button>
      </div>

      <div class="fd-livestock__detail-metrics">
        <div>
          <span class="fd-livestock__status">{t("livestock.colHealth")}</span>
          <div class="fd-livestock__health">
            <div class="fd-livestock__health-bar">
              <div
                class={`fd-livestock__health-fill ${getHealthClass(health)}`}
                style={{ width: `${Math.max(0, Math.min(100, health))}%` }}
              />
            </div>
            <strong>{Math.round(health)}%</strong>
          </div>
        </div>
        <div>
          <span class="fd-livestock__status">{t("livestock.colValue")}</span>
          <strong>${valueInfo.value.toLocaleString()}</strong>
        </div>
        <div>
          <span class="fd-livestock__status">{t("livestock.colAge")}</span>
          <strong>{t("livestock.fmtAgeMonths", { months: roundAgeMonths(animal.age || 0) })}</strong>
        </div>
        <div>
          <span class="fd-livestock__status">{t("livestock.colGender")}</span>
          <strong>{formatGender(animal.gender)}</strong>
        </div>
      </div>

      <div class="fd-livestock__chips">
        {shouldShowHealthErrorBadge(animal) ? (
          <Badge tone="danger">{t("livestock.badgeError")}</Badge>
        ) : null}
        {animal.isPregnant ? <Badge tone="warn">{t("livestock.badgePregnant")}</Badge> : null}
        {animal.isLactating ? <Badge tone="accent">{t("livestock.badgeLactating")}</Badge> : null}
        {animal.isParent ? <Badge>{t("livestock.badgeParent")}</Badge> : null}
      </div>

      <p class="fd-livestock__status">
        <strong>{t("livestock.colLocation")}:</strong> {resolveAnimalLocationLabel(animal)}
      </p>

      {g ? (
        <div class="fd-livestock__detail-genetics">
          <h4>{t("livestock.geneticsHeading")}</h4>
          <p class="fd-livestock__status">{t(getGeneticsDescriptionKey(g))}</p>
          <div class="fd-genetics__traits">
            {(
              [
                ["livestock.geneticsShortHealth", g.health],
                ["livestock.geneticsShortFertility", g.fertility],
                ["livestock.geneticsShortProductivity", g.productivity],
                ["livestock.geneticsShortQuality", g.quality],
              ] as const
            ).map(([key, val]) => (
              <div key={key} class="fd-genetics__trait">
                <span>{t(key)}</span>
                <strong>{formatGeneticsPercent(val || 1)}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div class="fd-livestock__detail-actions">
        <Button onClick={onFullDetails}>{t("livestock.detailPanelFull")}</Button>
        {animal.husbandryId != null && onOpenPen ? (
          <Button variant="ghost" onClick={onOpenPen}>
            {t("livestock.penDetailTitle")}
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
