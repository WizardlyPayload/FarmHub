import { t } from "@/i18n/i18n";
import { Badge, Card } from "@/components/ui";
import {
  dairyBarnsForFarm,
  dairyHealthTone,
  dairyQualityTone,
  dairySpoilageTone,
  isDairyCoreActive,
  shortBarnLabel,
  type RfDairyBarn,
} from "@/lib/realisticFarming/dairy";
import type { RealisticFarmingPayload } from "@/types/dashboard";

function BarnCard({ barn }: { barn: RfDairyBarn }) {
  return (
    <div class="fd-rf-dairy__barn">
      <div class="fd-rf-dairy__barn-head">
        <strong>
          {t("pastures.rfDairy.barnTitle", {
            id: shortBarnLabel(barn.barnId),
          })}
        </strong>
        {barn.feedDiseaseFlag ? (
          <Badge tone="danger">{t("pastures.rfDairy.feedRisk")}</Badge>
        ) : null}
      </div>
      <dl class="fd-rf-dairy__kv">
        <div>
          <dt>{t("pastures.rfDairy.herdHealth")}</dt>
          <dd>
            <Badge tone={dairyHealthTone(barn.herdHealthScore)}>
              {barn.herdHealthScore != null ? Math.round(barn.herdHealthScore) : t("common.notAvailable")}
            </Badge>
          </dd>
        </div>
        <div>
          <dt>{t("pastures.rfDairy.qualityTier")}</dt>
          <dd>
            <Badge tone={dairyQualityTone(barn.milkQualityTier)}>
              {barn.milkQualityTier || t("common.notAvailable")}
            </Badge>
          </dd>
        </div>
        <div>
          <dt>{t("pastures.rfDairy.spoilage")}</dt>
          <dd>
            <Badge tone={dairySpoilageTone(barn.spoilageStatus)}>
              {barn.spoilageStatus || t("common.notAvailable")}
            </Badge>
          </dd>
        </div>
        {barn.lastCollectionDay != null ? (
          <div>
            <dt>{t("pastures.rfDairy.lastCollection")}</dt>
            <dd>{barn.lastCollectionDay}</dd>
          </div>
        ) : null}
        {barn.contractSummary ? (
          <div class="fd-rf-dairy__contract">
            <dt>{t("pastures.rfDairy.contract")}</dt>
            <dd>{barn.contractSummary}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

/** Pastures dairy panel — shown when DairyCore export is enabled. */
export function DairyCorePanel({
  dairy,
  farmId,
}: {
  dairy: RealisticFarmingPayload["dairy"] | null | undefined;
  farmId: number;
}) {
  if (!isDairyCoreActive(dairy)) return null;
  const barns = dairyBarnsForFarm(dairy, farmId);

  return (
    <Card class="fd-rf-dairy" title={t("pastures.rfDairy.title")}>
      <p class="fd-muted-sm">{t("pastures.rfDairy.subtitle")}</p>
      {barns.length === 0 ? (
        <p class="fd-muted-sm">{t("pastures.rfDairy.empty")}</p>
      ) : (
        <div class="fd-rf-dairy__grid">
          {barns.map((barn) => (
            <BarnCard key={barn.barnId} barn={barn} />
          ))}
        </div>
      )}
      <p class="fd-muted-sm fd-rf-dairy__footnote">
        {t("pastures.rfDairy.barnCount", { count: barns.length })}
      </p>
    </Card>
  );
}
