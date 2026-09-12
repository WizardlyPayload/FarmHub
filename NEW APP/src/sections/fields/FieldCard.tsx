import { t } from "@/i18n/i18n";
import { Badge, Button, Card } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import { isRfSoilActive, rfSoilUrgency } from "@/lib/realisticFarming/land";
import { normalizeFieldOutline } from "@/lib/fleetMapOverlays";
import {
  buildForageBadges,
  buildMoistureLabel,
  buildProgressBar,
  buildSoilBars,
  buildStatusBadge,
  buildSuggestionModel,
  buildWeedBadge,
  buildWindrowVolumeBadge,
  fieldWithPreparedGroundCropCleared,
  formatCropName,
  formatFieldHectares,
  optionalOrganicSkipKeyForField,
  readOptionalOrganicSkipMap,
  writeOptionalOrganicSkipMap,
} from "./field-helpers";
import type { FieldRecord, GameSettings } from "@/lib/rules-engine";
import { RfLandPanels } from "./RfLandPanels";

interface FieldCardProps {
  field: FieldRecord;
  gameSettings?: GameSettings;
  vehicles?: unknown;
  farmId?: number;
  currentSeason?: unknown;
  onSkipOrganic?: () => void;
}

function FieldShapeThumb({ field }: { field: FieldRecord }) {
  const outline = normalizeFieldOutline(field.outline);
  if (!outline) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of outline) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const span = Math.max(maxX - minX, maxZ - minZ, 1);
  const pad = span * 0.1;
  const w = maxX - minX + pad * 2;
  const h = maxZ - minZ + pad * 2;
  const points = outline
    .map(([x, z]) => {
      const px = ((x - minX + pad) / w) * 100;
      const py = ((maxZ - z + pad) / h) * 100;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg class="fd-field-card__shape" viewBox="0 0 100 100" aria-hidden="true">
      <polygon points={points} />
    </svg>
  );
}

export function FieldCard({
  field,
  gameSettings,
  vehicles,
  farmId,
  currentSeason,
  onSkipOrganic,
}: FieldCardProps) {
  const displayField = fieldWithPreparedGroundCropCleared(field);
  const setSection = useDashboardStore((s) => s.setSection);
  const rfSoilActive = isRfSoilActive(displayField.soilFertilizer);
  const rfCropStressActive = displayField.cropStress?.enabled === true;
  const rfDominant = rfSoilActive || rfCropStressActive;
  const urgency = rfSoilUrgency(displayField.soilFertilizer);
  const urgencyTone =
    urgency == null ? "good" : urgency >= 55 ? "poor" : urgency >= 30 ? "fair" : "good";

  const status = buildStatusBadge(displayField);
  const progress = buildProgressBar(displayField);
  const soil = buildSoilBars(displayField);
  const moisture = buildMoistureLabel(displayField);
  const weed = buildWeedBadge(displayField);
  const forage = buildForageBadges(displayField);
  const windrowVol = buildWindrowVolumeBadge(displayField);
  const suggestion = buildSuggestionModel(displayField, {
    gameSettings,
    vehicles,
    farmId,
    currentSeason,
  });

  const title =
    field.name != null && String(field.name).trim()
      ? String(field.name)
      : t("fields.fieldNameFallback", { id: field.id ?? field.farmlandId ?? "?" });

  const clusterNote =
    Array.isArray(field._clusterFields) && field._clusterFields.length > 1
      ? t("fields.clusterMerged", {
          count: field._clusterFields.length,
          lead: Number(field._clusterFieldIds?.[0] ?? field.farmlandId ?? field.id),
        })
      : null;

  const skipOrganic = () => {
    const key = suggestion?.organicSkipKey || optionalOrganicSkipKeyForField(field);
    if (!key) return;
    const map = readOptionalOrganicSkipMap();
    map[key] = true;
    writeOptionalOrganicSkipMap(map);
    onSkipOrganic?.();
  };

  return (
    <Card class={`fd-field-card${rfDominant ? " is-rf-dominant" : ""}`}>
      <div class="fd-field-card__header">
        <FieldShapeThumb field={displayField} />
        <h3 class="fd-field-card__title">
          {title}
          {field.isPrecisionFarming ? (
            <>
              <span title={t("fields.pfMappingTitle")}>
                <Badge tone="accent">PF</Badge>
              </span>
              <Badge tone={field.isScanned ? "accent" : "danger"}>
                {field.isScanned ? t("fields.scanned") : t("fields.needsScan")}
              </Badge>
            </>
          ) : null}
          {rfSoilActive ? (
            <Badge tone="accent">{t("fields.rf.soil.source")}</Badge>
          ) : null}
        </h3>
        {rfSoilActive && urgency != null ? (
          <span
            class={`fd-field-card__urgency is-${urgencyTone}`}
            title={t("fields.rf.soil.urgencyTitle")}
          >
            {t("fields.rf.percentValue", { value: Math.round(urgency) })}
          </span>
        ) : status.style ? (
          <span class={`fd-badge fd-badge--${status.tone}`} style={status.style}>
            {status.label}
          </span>
        ) : (
          <Badge tone={status.tone}>{status.label}</Badge>
        )}
      </div>

      {clusterNote ? <p class="fd-field-suggestion__reason">{clusterNote}</p> : null}

      {rfSoilActive ? (
        <p class="fd-field-card__subhead">
          {t("fields.rf.soil.cropAndArea", {
            crop: formatCropName(displayField.fruitType),
            area: formatFieldHectares(displayField),
          })}
        </p>
      ) : (
        <div class="fd-field-card__meta">
          <div>
            <small>{t("fields.cardArea")}</small>
            <strong>{formatFieldHectares(displayField)}</strong>
          </div>
          <div>
            <small>{t("fields.cardCrop")}</small>
            <strong>{formatCropName(displayField.fruitType)}</strong>
          </div>
        </div>
      )}

      {rfDominant ? (
        <RfLandPanels
          soil={displayField.soilFertilizer}
          cropStress={displayField.cropStress}
          dominant
        />
      ) : null}

      <div class={`fd-field-card__vanilla${rfDominant ? " is-secondary" : ""}`}>
        {rfDominant ? (
          <div class="fd-field-card__vanilla-head">
            <p class="fd-field-card__vanilla-label">{t("fields.rf.vanillaSecondary")}</p>
            {rfSoilActive ? <Badge tone={status.tone}>{status.label}</Badge> : null}
          </div>
        ) : null}

        {!rfSoilActive && (moisture || weed) ? (
          <div class="fd-field-card__badges">
            {moisture ? (
              <span title={t("fields.cardMoistureTitle")}>
                <Badge tone="accent">{moisture}</Badge>
              </span>
            ) : null}
            {weed ? (
              <span title={weed.title}>
                <Badge tone={weed.tone}>{weed.label}</Badge>
              </span>
            ) : null}
          </div>
        ) : null}

        {forage.length || windrowVol ? (
          <div class="fd-field-card__badges">
            {forage.map((b) => (
              <Badge key={b.key} tone={b.tone}>
                <span title={b.title}>{b.label}</span>
              </Badge>
            ))}
            {windrowVol ? (
              <Badge tone="warn">
                <span title={t("fields.windrowBadgeTitle")}>{windrowVol}</span>
              </Badge>
            ) : null}
          </div>
        ) : null}

        <div class="fd-field-progress">
          <div
            class="fd-field-progress__fill"
            style={{ width: `${progress.pct}%`, background: progress.bg }}
          />
          <span class="fd-field-progress__label" style={{ color: progress.textColour }}>
            {progress.label}
          </span>
        </div>

        {!rfSoilActive ? (
          <div class="fd-field-soil">
            <div>
              <small>{t("fields.soilNitrogen")}</small>
              <strong style={{ color: soil.nitrogen.colour }}>{soil.nitrogen.label}</strong>
              <div class="fd-field-soil__bar">
                <div
                  class="fd-field-soil__fill"
                  style={{ width: `${soil.nitrogen.progress}%`, background: soil.nitrogen.colour }}
                />
              </div>
            </div>
            <div>
              <small>{t("fields.soilPhLime")}</small>
              <strong style={{ color: soil.ph.colour }}>{soil.ph.label}</strong>
              <div class="fd-field-soil__bar">
                <div
                  class="fd-field-soil__fill"
                  style={{ width: `${soil.ph.progress}%`, background: soil.ph.colour }}
                />
              </div>
            </div>
          </div>
        ) : null}

        {suggestion ? (
          <details class={`fd-field-suggestion${rfDominant ? " is-collapsible" : ""}`} open={!rfDominant}>
            <summary class="fd-field-suggestion__summary">
              {t("fields.suggestedNextStep")}
              {suggestion.action ? <Badge>{t("fields.rulesBadge")}</Badge> : null}
            </summary>
            {suggestion.seasonalNote ? (
              <div class="fd-field-suggestion__season">{suggestion.seasonalNote}</div>
            ) : null}
            {suggestion.action ? (
              <>
                <span class="fd-field-suggestion__action">{suggestion.action}</span>
                {suggestion.reason ? (
                  <div class="fd-field-suggestion__reason">{suggestion.reason}</div>
                ) : null}
                {suggestion.fleetLines.length ||
                suggestion.buyLeaseLines.length ||
                suggestion.otherToolLines.length ? (
                  <div class="fd-field-suggestion__tools">
                    {suggestion.fleetLinks.length || suggestion.fleetLines.length ? (
                      <>
                        <small>{t("tools.useFromYourFleet")}</small>
                        {suggestion.fleetLinks.map((link) => (
                          <button
                            key={link.roleId}
                            type="button"
                            class="fd-field-suggestion__fleet-link"
                            title={t("fields.viewFleetRole", { role: link.roleLabel })}
                            onClick={() => setSection("vehicles", { role: link.roleId })}
                          >
                            {link.roleLabel}
                            {link.vehicleName ? `: ${link.vehicleName}` : ""}
                          </button>
                        ))}
                        {suggestion.fleetLines
                          .filter(
                            (line) =>
                              !suggestion.fleetLinks.some((link) => line.includes(link.roleLabel)),
                          )
                          .map((line) => (
                            <div key={line}>{line}</div>
                          ))}
                      </>
                    ) : null}
                    {suggestion.buyLeaseLines.length ? (
                      <>
                        <small>{t("tools.buyLeaseSuggestion")}</small>
                        {suggestion.buyLeaseLines.map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                      </>
                    ) : null}
                    {suggestion.otherToolLines.length ? (
                      <>
                        <small>{t("tools.generalEquipmentHint")}</small>
                        {suggestion.otherToolLines.map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                      </>
                    ) : null}
                  </div>
                ) : null}
                {suggestion.showOrganicSkip && suggestion.organicSkipKey ? (
                  <div style={{ marginTop: "0.65rem" }}>
                    <Button variant="ghost" onClick={skipOrganic}>
                      {t("fields.skipOptionalOrganicStep")}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : suggestion.seasonalNote ? (
              <>
                <small style={{ color: "var(--farm-text-muted)" }}>{t("fields.season")}</small>
                <div class="fd-field-suggestion__season" style={{ border: "none", margin: 0, padding: 0 }}>
                  {suggestion.seasonalNote}
                </div>
              </>
            ) : null}
          </details>
        ) : null}
      </div>

      {!rfDominant ? (
        <RfLandPanels
          soil={displayField.soilFertilizer}
          cropStress={displayField.cropStress}
        />
      ) : null}
    </Card>
  );
}
