import { useMemo } from "preact/hooks";
import { t, tOr } from "@/i18n/i18n";
import { Badge } from "@/components/ui";
import type { DashboardPayload, SectionId, SectionParams } from "@/types/dashboard";
import { entityOwnerFarmId } from "@/lib/farm-scope";
import {
  buildProgressBar,
  formatCropName,
} from "@/sections/fields/field-helpers";
import { clusterFieldsForDisplay, type FieldRecord } from "@/lib/rules-engine";
import {
  parsePasturesFromPayload,
} from "@/lib/pastures-parsers";
import type { Pasture } from "@/lib/pastures-types";
import { getOwnedChainsForFarm, type ProductionPayload } from "@/lib/productions";
import { switchActiveFarm } from "@/services/ws-client";

type SetSection = (id: SectionId, params?: SectionParams) => void;

function fieldNumber(field: FieldRecord): string {
  const n = field.farmlandId ?? field.id;
  return n != null && String(n).trim() !== "" ? String(n) : "?";
}

function chainStatusLabel(chain: {
  isActive?: boolean;
  productions?: Array<{ status?: string; isActive?: boolean }>;
}): string {
  if (chain.isActive === false) return tOr("overview.miniProdInactive", "Inactive");
  const slots = Array.isArray(chain.productions) ? chain.productions : [];
  if (slots.some((s) => s.status && /idle|empty|blocked|error/i.test(String(s.status)))) {
    return tOr("overview.miniProdIssue", "Needs attention");
  }
  if (slots.some((s) => s.isActive === true) || chain.isActive === true) {
    return tOr("overview.miniProdRunning", "Running");
  }
  return tOr("overview.miniProdIdle", "Idle");
}

function useFarmMiniData(payload: DashboardPayload | null | undefined, farmId: number) {
  const fields = useMemo(() => {
    const raw = Array.isArray(payload?.fields) ? (payload!.fields as FieldRecord[]) : [];
    const scoped = raw.filter((f) => {
      const oid = entityOwnerFarmId(f);
      return oid <= 0 || oid === farmId;
    });
    return (clusterFieldsForDisplay(scoped, { autoMerge: false, manualGroups: [] }) as FieldRecord[])
      .slice()
      .sort((a, b) => Number(fieldNumber(a)) - Number(fieldNumber(b)) || 0);
  }, [payload?.fields, farmId]);

  const pastures = useMemo(() => {
    if (!payload) return [] as Pasture[];
    return parsePasturesFromPayload(payload, farmId);
  }, [payload, farmId]);

  const productions = useMemo(
    () =>
      getOwnedChainsForFarm(
        payload?.production as ProductionPayload | null | undefined,
        farmId,
        payload?.farmInfo
      ),
    [payload?.production, payload?.farmInfo, farmId]
  );

  return { fields, pastures, productions };
}

function goTo(
  farmId: number,
  activeFarmId: number,
  setSection: SetSection,
  section: SectionId,
  params?: SectionParams
) {
  if (farmId !== activeFarmId) switchActiveFarm(farmId);
  setSection(section, params);
}

function MiniFields({
  fields,
  farmId,
  activeFarmId,
  setSection,
}: {
  fields: FieldRecord[];
  farmId: number;
  activeFarmId: number;
  setSection: SetSection;
}) {
  if (fields.length === 0) {
    return (
      <span class="fd-muted fd-overview__farm-mini-empty">
        {tOr("overview.miniEmptyFields", "No fields on this farm.")}
      </span>
    );
  }
  return (
    <div class="fd-overview__farm-mini-grid">
      {fields.map((field) => {
        const progress = buildProgressBar(field);
        const clustered = Array.isArray(field._clusterFieldIds) && field._clusterFieldIds.length > 1;
        const num = clustered ? field._clusterFieldIds.join(" · ") : fieldNumber(field);
        return (
          <button
            key={`f-${farmId}-${num}-${field.id ?? ""}`}
            type="button"
            class="fd-overview__mini-card fd-overview__mini-card--field"
            onClick={() =>
              goTo(farmId, activeFarmId, setSection, "fields", {
                id: String(field.id ?? field.farmlandId ?? num),
              })
            }
          >
            <span class="fd-overview__mini-card-kicker">
              {tOr("overview.miniFieldNumber", "Field {{id}}", { id: num })}
            </span>
            <strong class="fd-overview__mini-card-title">{formatCropName(field.fruitType)}</strong>
            <span class="fd-overview__mini-card-meta">{progress.label}</span>
            <span
              class="fd-overview__mini-progress"
              aria-hidden="true"
              style={{
                ["--mini-progress" as string]: `${Math.max(0, Math.min(100, progress.pct))}%`,
                ["--mini-progress-bg" as string]: progress.bg,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

function MiniPastures({
  pastures,
  farmId,
  activeFarmId,
  setSection,
}: {
  pastures: Pasture[];
  farmId: number;
  activeFarmId: number;
  setSection: SetSection;
}) {
  if (pastures.length === 0) {
    return (
      <span class="fd-muted fd-overview__farm-mini-empty">
        {tOr("overview.miniEmptyPastures", "No pastures on this farm.")}
      </span>
    );
  }
  return (
    <div class="fd-overview__farm-mini-grid">
      {pastures.map((p) => {
        const warnN = Array.isArray(p.allWarnings) ? p.allWarnings.length : 0;
        return (
          <button
            key={`p-${farmId}-${p.id}`}
            type="button"
            class="fd-overview__mini-card fd-overview__mini-card--pasture"
            onClick={() => goTo(farmId, activeFarmId, setSection, "pastures", { id: String(p.id) })}
          >
            <span class="fd-overview__mini-card-kicker">
              {tOr("overview.miniPastureHeads", "{{count}} animals", {
                count: p.animalCount,
              })}
            </span>
            <strong class="fd-overview__mini-card-title">{p.name}</strong>
            <span class="fd-overview__mini-card-meta">
              {warnN > 0 ? (
                <Badge tone="warn">
                  {tOr("overview.miniPastureWarnings", "{{count}} warnings", {
                    count: warnN,
                  })}
                </Badge>
              ) : (
                tOr("overview.miniPastureOk", "All clear")
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MiniProductions({
  productions,
  farmId,
  activeFarmId,
  setSection,
}: {
  productions: ReturnType<typeof getOwnedChainsForFarm>;
  farmId: number;
  activeFarmId: number;
  setSection: SetSection;
}) {
  if (productions.length === 0) {
    return (
      <span class="fd-muted fd-overview__farm-mini-empty">
        {tOr("overview.miniEmptyProductions", "No owned productions on this farm.")}
      </span>
    );
  }
  return (
    <div class="fd-overview__farm-mini-grid">
      {productions.map((ch) => {
        const status = chainStatusLabel(ch);
        const issue = /attention|inactive/i.test(status);
        return (
          <button
            key={`c-${farmId}-${ch.id ?? ch.name}`}
            type="button"
            class="fd-overview__mini-card fd-overview__mini-card--prod"
            onClick={() =>
              goTo(farmId, activeFarmId, setSection, "productions", {
                id: String(ch.id ?? ch.name ?? ""),
              })
            }
          >
            <span class="fd-overview__mini-card-kicker">
              {issue ? (
                <Badge tone="warn">{status}</Badge>
              ) : (
                <Badge tone="accent">{status}</Badge>
              )}
            </span>
            <strong class="fd-overview__mini-card-title">
              {String(ch.name || tOr("overview.miniProdFallback", "Production"))}
            </strong>
            <span class="fd-overview__mini-card-meta">
              {tOr("overview.miniProdSlots", "{{count}} recipes", {
                count: Array.isArray(ch.productions) ? ch.productions.length : 0,
              })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Compact mini strips embedded in each multi-farm overview card. */
export function OverviewFarmCardMinis({
  payload,
  farmId,
  activeFarmId,
  setSection,
}: {
  payload: DashboardPayload | null | undefined;
  farmId: number;
  activeFarmId: number;
  setSection: SetSection;
}) {
  const { fields, pastures, productions } = useFarmMiniData(payload, farmId);

  return (
    <div
      class="fd-overview__farm-minis"
      aria-label={tOr("overview.miniBoardsTitle", "Active farm detail")}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div class="fd-overview__glass-panel">
        <div class="fd-overview__farm-mini-row">
          <span class="fd-overview__farm-mini-label">{t("nav.section.fields")}</span>
          <MiniFields fields={fields} farmId={farmId} activeFarmId={activeFarmId} setSection={setSection} />
        </div>
      </div>
      <div class="fd-overview__glass-panel">
        <div class="fd-overview__farm-mini-row">
          <span class="fd-overview__farm-mini-label">{t("nav.section.pastures")}</span>
          <MiniPastures
            pastures={pastures}
            farmId={farmId}
            activeFarmId={activeFarmId}
            setSection={setSection}
          />
        </div>
      </div>
      <div class="fd-overview__glass-panel">
        <div class="fd-overview__farm-mini-row">
          <span class="fd-overview__farm-mini-label">{t("nav.section.productions")}</span>
          <MiniProductions
            productions={productions}
            farmId={farmId}
            activeFarmId={activeFarmId}
            setSection={setSection}
          />
        </div>
      </div>
    </div>
  );
}

/** Full-width boards for single-farm overview (no farm cards). */
export function OverviewMiniBoards({
  payload,
  farmId,
  setSection,
}: {
  payload: DashboardPayload | null | undefined;
  farmId: number;
  setSection: SetSection;
}) {
  const { fields, pastures, productions } = useFarmMiniData(payload, farmId);

  return (
    <div
      class="fd-overview__minis fd-overview__minis--stack"
      aria-label={tOr("overview.miniBoardsTitle", "Active farm detail")}
    >
      <section class="fd-overview__glass-panel" aria-label={t("nav.section.fields")}>
        <div class="fd-overview__farm-mini-row">
          <span class="fd-overview__farm-mini-label">{t("nav.section.fields")}</span>
          <MiniFields fields={fields} farmId={farmId} activeFarmId={farmId} setSection={setSection} />
        </div>
      </section>
      <section class="fd-overview__glass-panel" aria-label={t("nav.section.pastures")}>
        <div class="fd-overview__farm-mini-row">
          <span class="fd-overview__farm-mini-label">{t("nav.section.pastures")}</span>
          <MiniPastures
            pastures={pastures}
            farmId={farmId}
            activeFarmId={farmId}
            setSection={setSection}
          />
        </div>
      </section>
      <section class="fd-overview__glass-panel" aria-label={t("nav.section.productions")}>
        <div class="fd-overview__farm-mini-row">
          <span class="fd-overview__farm-mini-label">{t("nav.section.productions")}</span>
          <MiniProductions
            productions={productions}
            farmId={farmId}
            activeFarmId={farmId}
            setSection={setSection}
          />
        </div>
      </section>
    </div>
  );
}
