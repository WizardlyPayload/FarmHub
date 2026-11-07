import { t } from "@/i18n/i18n";
import { Badge, Card } from "@/components/ui";
import {
  barnDisplayName,
  dairyBarnsForFarm,
  dairyHealthTone,
  dairyQualityTone,
  dairySpoilageTone,
  isDairyCoreActive,
  type RfDairyBarn,
} from "@/lib/realisticFarming/dairy";
import type { RealisticFarmingPayload } from "@/types/dashboard";

function BreedSurface({ barn }: { barn: RfDairyBarn }) {
  const surface = barn.breedSurface;
  if (!surface) return null;
  return (
    <div class="fd-rf-dairy__breeds">
      {surface.herd ? (
        <div>
          <h4>{t("pastures.rfDairy.breedHerd")}</h4>
          {surface.herd.available ? (
            <>
              <strong>{surface.herd.totalMilkingHeadcount ?? t("common.notAvailable")}</strong>
              <ul>{(surface.herd.breeds ?? []).map((breed) => (
                <li key={breed.name}><span>{breed.name}</span><span>{Math.round(breed.value)}</span></li>
              ))}</ul>
            </>
          ) : <p>{t("common.notAvailable")}</p>}
        </div>
      ) : null}
      {surface.milk.length > 0 ? (
        <div>
          <h4>{t("pastures.rfDairy.breedMilk")}</h4>
          {surface.milk.map((milk) => (
            <div key={milk.fillType}>
              <strong>{milk.fillType}: {milk.available && milk.litres != null
                ? `${Math.round(milk.litres)} L`
                : t("common.notAvailable")}</strong>
              {milk.available ? (
                <ul>
                  {(milk.breeds ?? []).map((breed) => (
                    <li key={breed.name}><span>{breed.name}</span><span>{Math.round(breed.value)} L</span></li>
                  ))}
                  {(milk.unknownLitres ?? 0) > 0 ? (
                    <li><span>{t("pastures.rfDairy.breedUnknown")}</span><span>{Math.round(milk.unknownLitres!)} L</span></li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BarnCard({ barn }: { barn: RfDairyBarn }) {
  return (
    <div class="fd-rf-dairy__barn">
      <div class="fd-rf-dairy__barn-head">
        <strong>{barnDisplayName(barn)}</strong>
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
      <BreedSurface barn={barn} />
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
