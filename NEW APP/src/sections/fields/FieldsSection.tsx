import { useEffect, useMemo, useState } from "preact/hooks";
import { t, tOr } from "@/i18n/i18n";
import { CompanionModsEmbed } from "@/sections/companions";
import { FIELD_SURFACE_IDS } from "@/lib/companionMods/fieldEconomyCards";
import { Badge, Button, Card } from "@/components/ui";
import { refreshFieldRulesCache } from "@/lib/rules-engine";
import { useDashboardStore } from "@/store/dashboard-store";
import { saveProfileFromUnitDisplay } from "@/lib/profile-display";
import { unitDisplayFromPayload } from "@/lib/fill-units";
import { formatCurrency } from "@/lib/economy";
import {
  clusterFieldsForDisplay,
  type FieldRecord,
} from "@/lib/rules-engine";
import { getFarmDashApi } from "@/services/electron-bridge";
import { rfSoilUrgency } from "@/lib/realisticFarming/land";
import {
  computeFieldStats,
  filterDisplayRows,
  filterFieldsForFarmView,
  readIncludeUnownedPref,
  writeIncludeUnownedPref,
} from "./field-helpers";
import {
  parseFieldCardSortMode,
  readFieldCardSortPref,
  resolveFieldCardSortMode,
  sortFieldCards,
  writeFieldCardSortPref,
  type FieldCardSortMode,
} from "./field-sort";
import type { FieldFilterType } from "./types";
import { FieldCard } from "./FieldCard";
import { UiStatePanel } from "@/components/ux/UiStatePanel";
import { FreshnessChip } from "@/components/ux/FreshnessChip";
import { buildModuleUiState } from "@/lib/ux-state";
import { refreshDashboard } from "@/services/ws-client";
import { isSoilCollectionPending } from "./soil-collection-state";
import "./fields.css";

const FILTERS: { id: FieldFilterType; labelKey: string }[] = [
  { id: "all", labelKey: "fields.filterAll" },
  { id: "harvest", labelKey: "fields.filterHarvestReady" },
  { id: "needswork", labelKey: "fields.filterNeedsWork" },
  { id: "growing", labelKey: "fields.filterGrowing" },
  { id: "empty", labelKey: "fields.filterEmpty" },
];

type ClusterPref = { manualGroups: number[][] };

const DEFAULT_CLUSTER_PREF: ClusterPref = { manualGroups: [] };

function vehiclesList(vehicles: unknown): unknown[] {
  if (Array.isArray(vehicles)) return vehicles;
  if (vehicles && typeof vehicles === "object") return Object.values(vehicles);
  return [];
}

/** Collector `reason` codes -> the explanation shown when SF reports nothing. */
const SOIL_STAND_DOWN_KEYS: Record<string, string> = {
  "pf-conflict": "fields.rf.soil.standDownPfConflict",
  "mod-absent": "fields.rf.soil.standDownModAbsent",
  "manager-missing": "fields.rf.soil.standDownManagerMissing",
  "system-missing": "fields.rf.soil.standDownSystemMissing",
  "api-missing": "fields.rf.soil.standDownApiMissing",
  "settings-disabled": "fields.rf.soil.standDownSettingsDisabled",
  "not-initialized": "fields.rf.soil.standDownNotInitialized",
  "not-authority": "fields.rf.soil.standDownNotAuthority",
};

interface SoilTriage {
  active: boolean;
  urgent: number;
  watch: number;
  good: number;
}

/** Count Soil Fertilizer bands. Card order is chosen separately (see field-sort). */
function buildSoilTriage(rows: FieldRecord[]): SoilTriage {
  const scored = rows.map((row) => rfSoilUrgency(row.soilFertilizer));
  const active = scored.some((urgency) => urgency != null);
  if (!active) {
    return { active: false, urgent: 0, watch: 0, good: 0 };
  }

  let urgent = 0;
  let watch = 0;
  let good = 0;
  for (const urgency of scored) {
    if (urgency == null) continue;
    if (urgency >= 55) urgent += 1;
    else if (urgency >= 30) watch += 1;
    else good += 1;
  }

  return { active: true, urgent, watch, good };
}

/** Billing uses parcel IDs; the mod's menu toggle uses engine field IDs. */
function readRealisticWeatherIrrigationCharges(fields: FieldRecord[], farmId: number) {
  const parcels = new Map<number, { active: boolean; pending: number }>();
  const ambiguous = new Set<number>();
  for (const field of fields) {
    if (Number(field.ownerFarmId ?? field.farmId ?? 0) !== farmId) continue;
    const row = field.realisticWeatherIrrigation;
    // The native collector sets farmlandId from field.farmland.id when present.
    const id = Number(field.farmlandId);
    const pending = Number(row?.pendingNextDay);
    if (!row || !Number.isInteger(id) || id < 1 || Number(row.parcelId) !== id ||
        typeof row.active !== "boolean" || !Number.isFinite(pending) || pending < 0 || ambiguous.has(id)) continue;
    const prior = parcels.get(id);
    if (prior && (prior.active !== row.active || prior.pending !== pending)) {
      parcels.delete(id);
      ambiguous.add(id);
    } else {
      parcels.set(id, { active: row.active, pending });
    }
  }
  if (!parcels.size) return null;
  const pending = [...parcels.values()].reduce((sum, row) => sum + row.pending, 0);
  if (pending <= 0) return null;
  return {
    ids: [...parcels.entries()].filter(([, row]) => row.pending > 0).map(([id]) => id).sort((a, b) => a - b),
    pending,
  };
}

function readRealisticWeatherIrrigationMenu(fields: FieldRecord[], farmId: number) {
  const names = new Map<number, string>();
  for (const field of fields) {
    if (Number(field.ownerFarmId ?? field.farmId ?? 0) !== farmId) continue;
    const row = field.realisticWeatherIrrigationMenu;
    const fieldId = Number(field.id);
    if (!row || row.active !== true || Number(row.fieldId) !== fieldId || !Number.isInteger(fieldId)) continue;
    names.set(fieldId, String(field.name || `Field ${fieldId}`));
  }
  return [...names.entries()].sort(([a], [b]) => a - b).map(([, name]) => name);
}

function asFieldFilter(raw: string | undefined): FieldFilterType {
  if (raw === "harvest" || raw === "needswork" || raw === "growing" || raw === "empty" || raw === "all") {
    return raw;
  }
  return "all";
}

function normalizeClusterPref(raw: unknown): ClusterPref {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CLUSTER_PREF };
  const row = raw as { manualGroups?: unknown };
  return {
    manualGroups: Array.isArray(row.manualGroups)
      ? row.manualGroups
          .map((g) =>
            (Array.isArray(g) ? g : [])
              .map((x) => parseInt(String(x), 10))
              .filter((n) => Number.isFinite(n) && n > 0),
          )
          .filter((g) => g.length > 0)
      : [],
  };
}

export function FieldsSection() {
  const payload = useDashboardStore((s) => s.payload);
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);
  const activeServerId = useDashboardStore((s) => s.activeServerId);
  const connection = useDashboardStore((s) => s.connection);
  const sectionParams = useDashboardStore((s) => s.sectionParams);
  const setSectionParams = useDashboardStore((s) => s.setSectionParams);
  const [filterType, setFilterType] = useState<FieldFilterType>(() =>
    asFieldFilter(sectionParams.filter)
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [includeUnowned, setIncludeUnowned] = useState(readIncludeUnownedPref);
  const [sortMode, setSortMode] = useState<FieldCardSortMode>(readFieldCardSortPref);
  const [organicTick, setOrganicTick] = useState(0);
  const [rulesTick, setRulesTick] = useState(0);
  const [clusterPrefsByServer, setClusterPrefsByServer] = useState<
    Record<string, ClusterPref>
  >({});

  useEffect(() => {
    if (sectionParams.filter) setFilterType(asFieldFilter(sectionParams.filter));
  }, [sectionParams.filter]);

  useEffect(() => {
    let cancelled = false;
    const api = getFarmDashApi();
    if (!api?.getUiPreferences) {
      return;
    }
    void api
      .getUiPreferences()
      .then((prefs) => {
        if (cancelled) return;
        const by = prefs?.fieldClusterPrefsByServer || {};
        const next: Record<string, ClusterPref> = {};
        for (const [sid, raw] of Object.entries(by)) {
          next[String(sid)] = normalizeClusterPref(raw);
        }
        setClusterPrefsByServer(next);
      })
      .catch(() => {
        /* Electron prefs are optional; never block the field list on a rejected IPC. */
      });
    return () => {
      cancelled = true;
    };
  }, [activeServerId]);

  const farmId = Number(activeFarmId ?? 1) || 1;
  const serverKey = String(activeServerId || "");

  const allFields = useMemo(() => {
    const raw = payload?.fields;
    return Array.isArray(raw) ? (raw as FieldRecord[]) : [];
  }, [payload?.fields]);

  const farmFields = useMemo(
    () => filterFieldsForFarmView(allFields, farmId, { includeUnowned }),
    [allFields, farmId, includeUnowned],
  );

  const clusterPref = useMemo(() => {
    if (!serverKey) return DEFAULT_CLUSTER_PREF;
    return clusterPrefsByServer[serverKey] || DEFAULT_CLUSTER_PREF;
  }, [clusterPrefsByServer, serverKey]);

  const displayRows = useMemo(
    () => clusterFieldsForDisplay(farmFields, clusterPref) as FieldRecord[],
    [farmFields, clusterPref],
  );

  const matching = useMemo(
    () => filterDisplayRows(displayRows, filterType, searchTerm),
    [displayRows, filterType, searchTerm],
  );

  const soilTriage = useMemo(() => buildSoilTriage(matching), [matching]);
  const resolvedSort = resolveFieldCardSortMode(sortMode, soilTriage.active);
  const filtered = useMemo(
    () => sortFieldCards(matching, sortMode, { soilActive: soilTriage.active }),
    [matching, sortMode, soilTriage.active],
  );

  const stats = useMemo(() => computeFieldStats(displayRows), [displayRows]);
  const areaProfile = saveProfileFromUnitDisplay(unitDisplayFromPayload(payload));
  const realisticWeatherIrrigationCharges = useMemo(
    () => readRealisticWeatherIrrigationCharges(allFields, farmId),
    [allFields, farmId],
  );
  const realisticWeatherIrrigationMenu = useMemo(
    () => readRealisticWeatherIrrigationMenu(allFields, farmId),
    [allFields, farmId],
  );
  const areaAcres = areaProfile?.effective?.acre === true;
  const areaValue = stats.totalArea === "—" || !areaAcres
    ? stats.totalArea
    : (Number(stats.totalArea) * 2.471053814671653).toFixed(1);

  const ownedCount = useMemo(() => {
    return allFields.filter((f) => Number(f.ownerFarmId ?? f.farmId ?? 0) === farmId).length;
  }, [allFields, farmId]);

  const unownedCount = useMemo(() => {
    return allFields.filter((f) => Number(f.ownerFarmId ?? f.farmId ?? 0) === 0).length;
  }, [allFields]);

  const hasManualMerge = (clusterPref.manualGroups || []).some((g) => g.length >= 2);
  const mergeHint = hasManualMerge ? t("fields.emptyMergeHint") : null;

  const gameSettings = (payload?.gameSettings || payload?.settings || {}) as Record<
    string,
    unknown
  >;
  const vehicles = vehiclesList(payload?.vehicles);
  const currentSeason = (payload?.weather as { currentSeason?: unknown } | undefined)
    ?.currentSeason;
  const soilPending = isSoilCollectionPending(payload);

  // Soil Fertilizer installed but returning nothing is invisible otherwise: the cards
  // just fall back to base-game bars and look like the mod was never there.
  const soilStandDown = useMemo(() => {
    if (soilTriage.active || soilPending) return null;
    const rf = payload?.realisticFarming;
    const summary = rf?.soilFertilizer;
    if (!summary || summary.enabled) return null;
    const presenceMods = Array.isArray(rf?.presence?.mods) ? rf.presence.mods : [];
    const installed = presenceMods.some(
      (mod) => mod.id === "FS25_SoilFertilizer" && mod.detected,
    );
    if (!installed) return null;
    const key = SOIL_STAND_DOWN_KEYS[String(summary.reason || "")];
    return t(key || "fields.rf.soil.standDownUnknown");
  }, [payload?.realisticFarming, soilTriage.active, soilPending]);

  const waiting = !payload || (connection === "connecting" && allFields.length === 0);
  const errored = connection === "error" && allFields.length === 0;

  const fieldCountLabel =
    filtered.length === 1
      ? t("fields.fieldCountOne", { count: filtered.length })
      : t("fields.fieldCountMany", { count: filtered.length });

  const onFilter = (id: FieldFilterType) => {
    setFilterType(id);
    setSectionParams({ ...sectionParams, filter: id === "all" ? undefined : id });
  };

  const toggleIncludeUnowned = () => {
    const next = !includeUnowned;
    setIncludeUnowned(next);
    writeIncludeUnownedPref(next);
  };

  const onSortMode = (next: string) => {
    const mode = parseFieldCardSortMode(next);
    setSortMode(mode);
    writeFieldCardSortPref(mode);
  };

  const refreshRules = () => {
    void refreshFieldRulesCache().then(() => {
      setRulesTick((n) => n + 1);
      setOrganicTick((n) => n + 1);
    });
  };

  const emptyBody = (() => {
    if (errored) {
      return (
        <UiStatePanel
          ui={buildModuleUiState({ state: "error", errorCode: "E_SERVER_OFFLINE", source: "unknown" })}
          title={t("fields.apiErrorTitle")}
          body={t("fields.apiErrorBody")}
          nextAction="rehandshake"
          onRetry={() => void refreshDashboard()}
        />
      );
    }
    if (waiting || allFields.length === 0) {
      return (
        <UiStatePanel
          ui={buildModuleUiState({
            state: connection === "connecting" ? "loading" : "empty",
            source: payload?.dataSource || "unknown",
          })}
          title={t("fields.waitingDataTitle")}
          body={t("fields.waitingDataBody")}
        />
      );
    }
    if (farmFields.length === 0) {
      return (
        <UiStatePanel
          ui={buildModuleUiState({ state: "empty", source: payload?.dataSource || "unknown" })}
          title={t("fields.noOwnedTitle")}
          body={t("fields.noOwnedBody", {
            farmId,
            owned: ownedCount,
            total: allFields.length,
          })}
        >
          {unownedCount > 0 && !includeUnowned ? (
            <p>{t("fields.noOwnedUnownedHint", { count: unownedCount })}</p>
          ) : null}
          <p class="fd-fields__empty-hint">{t("fields.emptyHideHint")}</p>
          {mergeHint ? <p class="fd-fields__empty-hint">{mergeHint}</p> : null}
        </UiStatePanel>
      );
    }
    if (filtered.length === 0) {
      return (
        <UiStatePanel
          ui={buildModuleUiState({ state: "empty", source: payload?.dataSource || "unknown" })}
          title={t("fields.noFilterMatch")}
          body={t("fields.emptyHideHint")}
        >
          {mergeHint ? <p class="fd-fields__empty-hint">{mergeHint}</p> : null}
        </UiStatePanel>
      );
    }
    return null;
  })();

  return (
    <div class="fd-fields">
      <header class="fd-fields__header">
        <h2>{t("fields.title")}</h2>
        <FreshnessChip payload={payload} onRefresh={() => void refreshDashboard()} />
      </header>


      <div class="fd-fields__stats">
        <Card title={t("fields.totalFields")}>
          <p class="fd-fields__stat-value">{stats.count}</p>
        </Card>
        <Card title={t("fields.totalArea")}>
          <p class="fd-fields__stat-value">{areaValue}</p>
          <span class="fd-fields__stat-unit">{areaAcres ? "ac" : t("fields.hectares")}</span>
        </Card>
        <Card title={t("fields.needsWork")}>
          <p class="fd-fields__stat-value">{stats.needsWork}</p>
        </Card>
        <Card title={t("fields.harvestReady")}>
          <p class="fd-fields__stat-value">{stats.harvestReady}</p>
        </Card>
      </div>

      {realisticWeatherIrrigationMenu.length ? (
        <p class="fd-fields__irrigation-note">
          {tOr("fields.realisticWeatherIrrigation", "Realistic Weather menu shows irrigation active on: {{fields}}.", {
            fields: realisticWeatherIrrigationMenu.join(", "),
          })}
        </p>
      ) : null}
      {realisticWeatherIrrigationCharges ? (
        <p class="fd-fields__irrigation-note">
          {tOr("fields.realisticWeatherIrrigationPending", "Realistic Weather shows {{amount}} unpaid for the next day on parcels {{parcels}}.", {
            amount: formatCurrency(realisticWeatherIrrigationCharges.pending, areaProfile),
            parcels: realisticWeatherIrrigationCharges.ids.join(", "),
          })}
        </p>
      ) : null}

      <CompanionModsEmbed categories={["fields"]} ids={FIELD_SURFACE_IDS} title={tOr("companions.embedFields", "Field companion mods")} />

      <div class="fd-section-toolbar fd-fields__toolbar">
        <div class="fd-fields__toolbar-start">
          <span title={t("fields.refreshRulesTitle")}>
            <Button variant="ghost" onClick={refreshRules}>
              {t("fields.refreshRules")}
            </Button>
          </span>
          <div class="fd-fields__filters">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                class={`fd-btn fd-btn--ghost fd-fields__filter${filterType === f.id ? " is-active" : ""}`}
                onClick={() => onFilter(f.id)}
              >
                {t(f.labelKey)}
              </button>
            ))}
          </div>
          <label class="fd-fields__toggle" title={t("fields.includeUnownedTitle")}>
            <input
              type="checkbox"
              checked={includeUnowned}
              onChange={toggleIncludeUnowned}
            />
            <span>{t("fields.includeUnowned")}</span>
          </label>
          <label class="fd-fields__sort" title={t("fields.sortTitle")}>
            <span>{t("fields.sortLabel")}</span>
            <select
              value={resolvedSort}
              onChange={(e) => onSortMode((e.target as HTMLSelectElement).value)}
              aria-label={t("fields.sortLabel")}
            >
              <option value="number">{t("fields.sortNumber")}</option>
              <option value="crop">{t("fields.sortCrop")}</option>
              <option value="size">{t("fields.sortSize")}</option>
              <option value="work">{t("fields.sortWork")}</option>
              {soilTriage.active ? (
                <option value="soil">{t("fields.sortSoil")}</option>
              ) : null}
            </select>
          </label>
        </div>
        <div class="fd-fields__toolbar-end">
          <Badge>{fieldCountLabel}</Badge>
          <input
            class="fd-fields__search"
            type="search"
            value={searchTerm}
            placeholder={t("fields.searchPlaceholder")}
            onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>

      {soilStandDown ? (
        <p class="fd-fields__stand-down">
          <strong>{t("fields.rf.soil.standDownTitle")}</strong> {soilStandDown}
        </p>
      ) : null}
      {soilPending ? (
        <p class="fd-fields__stand-down">
          <strong>{t("fields.rf.soil.pendingTitle")}</strong>{" "}
          {t("fields.rf.soil.pendingBody")}
        </p>
      ) : null}

      {!emptyBody && soilTriage.active ? (
        <div class="fd-fields__triage">
          <div class="fd-fields__triage-chips">
            {soilTriage.urgent > 0 ? (
              <span class="fd-fields__triage-chip is-poor">
                {t("fields.rf.soil.countUrgent", { count: soilTriage.urgent })}
              </span>
            ) : null}
            {soilTriage.watch > 0 ? (
              <span class="fd-fields__triage-chip is-fair">
                {t("fields.rf.soil.countWatch", { count: soilTriage.watch })}
              </span>
            ) : null}
            {soilTriage.good > 0 ? (
              <span class="fd-fields__triage-chip is-good">
                {t("fields.rf.soil.countGood", { count: soilTriage.good })}
              </span>
            ) : null}
          </div>
          {resolvedSort === "soil" ? (
            <span class="fd-fields__triage-note">{t("fields.rf.soil.sortedByUrgency")}</span>
          ) : null}
        </div>
      ) : null}

      {emptyBody ? (
        emptyBody
      ) : (
        <div class="fd-fields__grid" key={`${organicTick}-${rulesTick}-${serverKey}`}>
          {filtered.map((field) => {
            const id = String(field._displayClusterId || field.farmlandId || field.id);
            return (
              <FieldCard
                key={id}
                field={field}
                soilPending={soilPending}
                gameSettings={gameSettings}
                vehicles={vehicles}
                farmId={farmId}
                currentSeason={currentSeason}
                onSkipOrganic={() => setOrganicTick((n) => n + 1)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
