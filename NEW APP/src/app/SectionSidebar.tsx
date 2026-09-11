import { useMemo } from "preact/hooks";
import { t, tOr } from "@/i18n/i18n";
import { useDashboardStore } from "@/store/dashboard-store";
import type { SectionId } from "@/types/dashboard";
import { MOD_NAV_SECTIONS, NAV_SECTIONS } from "@/types/dashboard";
import { entityOwnerFarmId } from "@/lib/farm-scope";
import { computeFieldStats } from "@/sections/fields/field-helpers";
import { clusterFieldsForDisplay, type FieldRecord } from "@/lib/rules-engine";
import { getOwnedChainsForFarm } from "@/lib/productions";
import {
  SECTION_NAV_META,
  detectModPresence,
  modSectionActive,
  sectionVisible,
} from "@/app/section-meta";
import { summarizeAdsFleet } from "@/lib/vehicleAds";
import { getDisplayFleet } from "@/lib/vehicles";
import { getRedTapeForActiveFarm, type RedTapePayload } from "@/lib/redTape";

export function SectionSidebar() {
  const section = useDashboardStore((s) => s.section);
  const setSection = useDashboardStore((s) => s.setSection);
  const enabledSections = useDashboardStore((s) => s.enabledSections);
  const payload = useDashboardStore((s) => s.payload);
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);

  const farmId = Number(activeFarmId ?? 1) || 1;
  const presence = useMemo(() => detectModPresence(payload, farmId), [payload, farmId]);

  const alerts = useMemo(() => {
    const out: Partial<Record<SectionId, boolean>> = {};

    const rawFields = Array.isArray(payload?.fields) ? (payload!.fields as FieldRecord[]) : [];
    const fields = clusterFieldsForDisplay(
      rawFields.filter((f) => {
        const oid = entityOwnerFarmId(f);
        return oid <= 0 || oid === farmId;
      }),
      { autoMerge: false, manualGroups: [] },
    ) as FieldRecord[];
    const fieldStats = computeFieldStats(fields);
    if (fieldStats.needsWork > 0 || fieldStats.harvestReady > 0) out.fields = true;

    const pasturesRaw = Array.isArray(payload?.pastures) ? payload!.pastures : [];
    if (
      pasturesRaw.some((p) => {
        if (!p || typeof p !== "object") return false;
        const row = p as Record<string, unknown>;
        const oid = entityOwnerFarmId(row);
        if (oid > 0 && oid !== farmId) return false;
        const warnings = row.warnings ?? row.allWarnings;
        return Array.isArray(warnings) && warnings.length > 0;
      })
    ) {
      out.pastures = true;
    }

    const chains = getOwnedChainsForFarm(payload?.production, farmId, payload?.farmInfo);
    if (
      chains.some((c) => {
        if (c.isActive === false) return true;
        const slots = Array.isArray(c.productions) ? c.productions : [];
        return slots.some((s) => s.status && /idle|empty|blocked|error/i.test(String(s.status)));
      })
    ) {
      out.productions = true;
    }

    if (presence.ads) {
      const ads = summarizeAdsFleet(getDisplayFleet(payload?.vehicles, farmId));
      if (ads.needsRepairCount > 0) out.ads = true;
    }

    if (presence.redtape) {
      const farm = getRedTapeForActiveFarm(payload?.redTape as RedTapePayload | null, farmId);
      const policyWarnings = (farm?.policies || []).reduce(
        (sum, p) => sum + (Number(p.warnings) || 0),
        0,
      );
      if (policyWarnings > 0 || (Array.isArray(farm?.events) && farm!.events!.length > 0)) {
        out.redtape = true;
      }
    }

    return out;
  }, [payload, farmId, presence]);

  const coreItems = NAV_SECTIONS.filter((id) => sectionVisible(id, enabledSections));
  const modItems = MOD_NAV_SECTIONS.filter(
    (id) => sectionVisible(id, enabledSections) && modSectionActive(id, presence),
  );

  const renderItem = (id: SectionId) => {
    const meta = SECTION_NAV_META[id];
    const active = section === id;
    const hasAlert = !!alerts[id];
    return (
      <li key={id}>
        <button
          type="button"
          class={`fd-sidebar__item ${active ? "is-active" : ""}`}
          aria-current={active ? "page" : undefined}
          onClick={() => setSection(id)}
          title={t(meta.labelKey)}
        >
          {meta.icon ? (
            <img
              class="fd-sidebar__icon fd-sidebar__icon--img"
              src={meta.icon}
              alt=""
              aria-hidden="true"
              width={28}
              height={28}
              draggable={false}
            />
          ) : (
            <span
              class={`fd-sidebar__icon fd-sidebar__icon--glyph fd-sidebar__icon--${meta.glyphKind}`}
              aria-hidden="true"
            >
              {meta.glyph}
            </span>
          )}
          <span class="fd-sidebar__label">{t(meta.labelKey)}</span>
          {hasAlert ? <span class="fd-sidebar__dot" aria-hidden="true" /> : null}
        </button>
      </li>
    );
  };

  return (
    <nav class="fd-sidebar" aria-label={tOr("nav.sections", "Dashboard sections")}>
      <ul class="fd-sidebar__list">{coreItems.map(renderItem)}</ul>
      {modItems.length > 0 ? (
        <>
          <div class="fd-sidebar__group-label">{tOr("nav.modsGroup", "Mods")}</div>
          <ul class="fd-sidebar__list">{modItems.map(renderItem)}</ul>
        </>
      ) : null}
    </nav>
  );
}
