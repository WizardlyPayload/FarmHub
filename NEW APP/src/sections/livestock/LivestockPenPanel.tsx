import { createPortal } from "preact/compat";
import { useEffect, useMemo, useState } from "preact/hooks";
import { createColumnHelper, type ColumnDef } from "@tanstack/table-core";
import { t } from "@/i18n/i18n";
import { useDashboardStore } from "@/store/dashboard-store";
import { Badge, Button, Card } from "@/components/ui";
import { UiStatePanel } from "@/components/ux/UiStatePanel";
import { FreshnessChip } from "@/components/ux/FreshnessChip";
import { buildModuleUiState } from "@/lib/ux-state";
import { refreshDashboard } from "@/services/ws-client";
import {
  displayAnimalEarTag,
  displayAnimalHealth,
  findAnimalById,
  formatAnimalType,
  getHealthClass,
  livestockTableRowId,
  resolveAnimalLocationLabel,
  resolveAnimalLocationType,
  resolveAnimalSubTypeRaw,
  roundAgeMonths,
  shouldShowHealthErrorBadge,
} from "@/lib/livestock-format";
import {
  applyAdvancedFilters,
  buildActiveFilterChips,
  clampDualRange,
  createDefaultAdvancedFilters,
  isAdvancedFiltersDefault,
} from "@/lib/livestock-filters";
import {
  applySummaryFilter,
  computeLivestockSummary,
  sortLivestockAnimals,
} from "@/lib/livestock-normalize";
import { calculateAnimalValue } from "@/lib/livestock-value";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useHydratedLivestockAnimals } from "@/lib/use-hydrated-livestock";
import {
  buildGeneticsOverview,
  formatGeneticsPercent,
} from "@/lib/genetics-overview";
import {
  buildExportRows,
  downloadTextFile,
  exportRowsToCsv,
  exportRowsToExcelHtml,
  openPrintableReport,
} from "@/lib/livestock-export";
import { flexRender, useLivestockTable } from "@/lib/livestock-table";
import type {
  AdvancedFilters,
  ExportFormat,
  LivestockAnimal,
  LivestockFilterMode,
  SummaryFilter,
} from "@/lib/livestock-types";
import { AnimalDetailsModal } from "./AnimalDetailsModal";
import { AnimalDetailPanel } from "./AnimalDetailPanel";
import { PenDetailModal } from "./PenDetailModal";
import "./livestock.css";

export type LivestockPenPane = "animals" | "statistics" | "genetics";

export interface LivestockPenPanelProps {
  /** When set, only animals in this husbandry/pen. When null/undefined, all farm animals. */
  husbandryId?: string | number | null;
  /** Compact chrome when embedded under a pasture card. */
  embedded?: boolean;
  /** Controlled pane (Animals / Statistics / Genetics). */
  pane?: LivestockPenPane;
  onPaneChange?: (pane: LivestockPenPane) => void;
  /** Uncontrolled initial pane when `pane` is omitted. */
  initialPane?: LivestockPenPane;
  /**
   * Mount the side card here (pastures left rail) so the animals table is not squeezed.
   * When omitted, the card sits to the left of the table in the same grid.
   */
  detailHost?: HTMLElement | null;
}

const columnHelper = createColumnHelper<LivestockAnimal>();

function animalMatchesHusbandry(
  animal: LivestockAnimal,
  husbandryId: string | number
): boolean {
  const target = String(husbandryId);
  const hid = animal.husbandryId ?? animal.huId;
  return hid != null && String(hid) === target;
}

function formatGender(gender: unknown): string {
  const g = String(gender ?? "").trim().toLowerCase();
  if (g === "male" || g === "m") return t("livestock.genderMale");
  if (g === "female" || g === "f") return t("livestock.genderFemale");
  return t("livestock.genderUnknown");
}

function formatWeight(animal: LivestockAnimal): string {
  const w = Number(animal.weight ?? 0);
  if (
    (animal.__lodSynth || animal.__lodClusterAggregate || animal.__lodSynthEstimate) &&
    (!Number.isFinite(w) || w <= 0)
  ) {
    return t("common.notAvailable");
  }
  return t("livestock.fmtWeightKg", { kg: w.toFixed(1) });
}

function DualRange(props: {
  label: string;
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
  onChange: (min: number, max: number) => void;
}) {
  const { label, min, max, valueMin, valueMax, onChange } = props;
  return (
    <div class="fd-livestock__field">
      <label>{label}</label>
      <div class="fd-livestock__dual">
        <input
          type="range"
          min={min}
          max={max}
          value={valueMin}
          onInput={(e) => {
            const next = Number((e.currentTarget as HTMLInputElement).value);
            const clamped = clampDualRange(next, valueMax, "min");
            onChange(clamped.min, clamped.max);
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={valueMax}
          onInput={(e) => {
            const next = Number((e.currentTarget as HTMLInputElement).value);
            const clamped = clampDualRange(valueMin, next, "max");
            onChange(clamped.min, clamped.max);
          }}
        />
        <div class="fd-livestock__dual-values">
          <span>{valueMin}%</span>
          <span>{valueMax}%</span>
        </div>
      </div>
    </div>
  );
}

export function LivestockPenPanel(props: LivestockPenPanelProps) {
  const {
    husbandryId = null,
    embedded = false,
    pane: paneControlled,
    onPaneChange,
    initialPane = "animals",
    detailHost = null,
  } = props;

  const payload = useDashboardStore((s) => s.payload);
  const connection = useDashboardStore((s) => s.connection);
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);
  const activeServerId = useDashboardStore((s) => s.activeServerId);

  const [paneUncontrolled, setPaneUncontrolled] = useState<LivestockPenPane>(initialPane);
  const pane = paneControlled ?? paneUncontrolled;
  const setPane = (next: LivestockPenPane) => {
    onPaneChange?.(next);
    if (paneControlled == null) setPaneUncontrolled(next);
  };

  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("all");
  const [filterMode, setFilterMode] = useState<LivestockFilterMode>("none");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [advanced, setAdvanced] = useState<AdvancedFilters>(createDefaultAdvancedFilters());
  const [draftAdvanced, setDraftAdvanced] = useState<AdvancedFilters>(createDefaultAdvancedFilters());
  const [exportOpen, setExportOpen] = useState(false);
  const exportTrapRef = useFocusTrap(exportOpen, () => setExportOpen(false));
  const [detailAnimal, setDetailAnimal] = useState<LivestockAnimal | null>(null);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const [penId, setPenId] = useState<string | null>(null);

  const { animals: allAnimals, lodState } = useHydratedLivestockAnimals({
    animalsData: payload?.animals,
    activeFarmId,
    activeServerId,
    husbandryId,
  });

  const animals = useMemo(() => {
    if (husbandryId == null || husbandryId === "") return allAnimals;
    return allAnimals.filter((a) => animalMatchesHusbandry(a, husbandryId));
  }, [allAnimals, husbandryId]);

  useEffect(() => {
    setSelectedAnimalId(null);
    setDetailAnimal(null);
    setPenId(null);
  }, [husbandryId]);

  useEffect(() => {
    if (paneControlled != null) return;
    if (initialPane) setPaneUncontrolled(initialPane);
  }, [initialPane, paneControlled]);

  const summary = useMemo(() => computeLivestockSummary(animals), [animals]);

  const geneticsOverview = useMemo(() => buildGeneticsOverview(animals), [animals]);

  const selectedAnimal = useMemo(() => {
    if (!selectedAnimalId) return null;
    return findAnimalById(animals, selectedAnimalId);
  }, [animals, selectedAnimalId]);

  const useInlineDetail = !!selectedAnimal && !detailHost;

  const detailPanel = selectedAnimal ? (
    <AnimalDetailPanel
      animal={selectedAnimal}
      onFullDetails={() => setDetailAnimal(selectedAnimal)}
      onOpenPen={
        selectedAnimal.husbandryId != null
          ? () => {
              const id = selectedAnimal.husbandryId;
              if (id != null) setPenId(String(id));
            }
          : undefined
      }
      onClose={() => setSelectedAnimalId(null)}
    />
  ) : null;

  const waitingForData = !payload || (connection === "connecting" && animals.length === 0);
  const hasNoAnimals = !waitingForData && animals.length === 0;

  const filteredAnimals = useMemo(() => {
    let rows = sortLivestockAnimals(animals);
    if (filterMode === "summary") {
      rows = applySummaryFilter(rows, summaryFilter);
    } else if (filterMode === "advanced") {
      rows = applyAdvancedFilters(rows, advanced);
    }
    return rows;
  }, [animals, filterMode, summaryFilter, advanced]);

  const filterStatus = useMemo(() => {
    const count = filteredAnimals.length;
    if (filterMode === "summary") {
      if (summaryFilter === "lactating") return t("livestock.filterStatusLactating", { count });
      if (summaryFilter === "pregnant") return t("livestock.filterStatusPregnant", { count });
      if (summaryFilter === "health") return t("livestock.filterStatusHealth", { count });
    }
    if (filterMode === "advanced") {
      return t("livestock.filterStatusGeneric", {
        count,
        filter: "filtered",
      });
    }
    return t("livestock.filterStatusAll", { count });
  }, [filteredAnimals.length, filterMode, summaryFilter, animals.length]);

  const activeChips = useMemo(() => {
    if (filterMode !== "advanced") return [];
    return buildActiveFilterChips(advanced).map((chip) => {
      if (chip.key === "type" && chip.params?.type) {
        const typeKey = `livestock.animalType${chip.params.type}`;
        const typeName = t(typeKey) !== typeKey ? t(typeKey) : String(chip.params.type);
        return { ...chip, params: { type: typeName }, text: undefined as string | undefined };
      }
      if (["health", "metabolism", "fertility", "quality", "productivity"].includes(chip.key)) {
        return {
          ...chip,
          text: `${t(chip.labelKey)}: ${chip.params?.min}%–${chip.params?.max}%`,
        };
      }
      return { ...chip, text: undefined as string | undefined };
    });
  }, [advanced, filterMode]);

  const selectAnimalRow = (animal: LivestockAnimal) => {
    if (animal.__emptyPen) {
      const pid = animal.husbandryId ?? animal.huId;
      if (pid != null) setPenId(String(pid));
      setSelectedAnimalId(null);
      return;
    }
    setSelectedAnimalId(String(animal.id));
    setDetailAnimal(animal);
  };

  const openAnimalDetails = (animalId: string | number) => {
    const animal = findAnimalById(animals, animalId);
    if (!animal || animal.__emptyPen) return;
    setSelectedAnimalId(String(animal.id));
    setDetailAnimal(animal);
  };

  const openPen = (id: string | number | null | undefined) => {
    if (id == null) return;
    setPenId(String(id));
  };

  const columns = useMemo<ColumnDef<LivestockAnimal, unknown>[]>(
    () =>
      [
        columnHelper.accessor(
          (row) => displayAnimalEarTag(row),
          {
            id: "id",
            header: () => t("livestock.colId"),
            cell: (info) => {
              const animal = info.row.original;
              if (animal.__emptyPen) {
                return (
                  <span>
                    <code>#{String(animal.husbandryId ?? "")}</code>{" "}
                    <Badge>{t("livestock.emptyPenShort")}</Badge>
                  </span>
                );
              }
              return (
                <span>
                  <code>#{displayAnimalEarTag(animal, animals)}</code>
                  {animal.__lodClusterAggregate && Number(animal.clusterCount) > 0 ? (
                    <Badge>×{Number(animal.clusterCount)}</Badge>
                  ) : null}
                </span>
              );
            },
          }
        ),
        columnHelper.accessor(
          (row) =>
            row.__emptyPen
              ? row.fillSummary || t("livestock.emptyPenBadge")
              : formatAnimalType(resolveAnimalSubTypeRaw(row) || t("common.unknown")),
          {
            id: "type",
            header: () => t("livestock.colType"),
            cell: (info) => info.getValue(),
          }
        ),
        columnHelper.accessor((row) => (row.__emptyPen ? -1 : Number(row.age) || 0), {
          id: "age",
          header: () => t("livestock.colAge"),
          cell: (info) =>
            info.row.original.__emptyPen
              ? "—"
              : t("livestock.fmtAgeMonths", { months: roundAgeMonths(info.getValue()) }),
        }),
        columnHelper.accessor((row) => String(row.gender || ""), {
          id: "gender",
          header: () => t("livestock.colGender"),
          cell: (info) => (info.row.original.__emptyPen ? "—" : formatGender(info.getValue())),
        }),
        columnHelper.display({
          id: "health",
          header: () => t("livestock.colHealth"),
          enableSorting: false,
          cell: (info) => {
            const animal = info.row.original;
            if (animal.__emptyPen) return "—";
            const h = displayAnimalHealth(animal);
            return (
              <div class="fd-livestock__health">
                <div class="fd-livestock__health-bar">
                  <div
                    class={`fd-livestock__health-fill ${getHealthClass(h)}`}
                    style={{ width: `${Math.max(0, Math.min(100, h))}%` }}
                  />
                </div>
                <span>{Math.round(h)}%</span>
              </div>
            );
          },
        }),
        columnHelper.accessor((row) => Number(row.weight) || 0, {
          id: "weight",
          header: () => t("livestock.colWeight"),
          cell: (info) => (info.row.original.__emptyPen ? "—" : formatWeight(info.row.original)),
        }),
        columnHelper.accessor((row) => calculateAnimalValue(row).value, {
          id: "value",
          header: () => t("livestock.colValue"),
          cell: (info) => `$${info.getValue().toLocaleString()}`,
        }),
        columnHelper.display({
          id: "status",
          header: () => t("livestock.colStatus"),
          enableSorting: false,
          cell: (info) => {
            const animal = info.row.original;
            if (animal.__emptyPen) return <Badge>{t("livestock.emptyPenShort")}</Badge>;
            const badges = [];
            if (shouldShowHealthErrorBadge(animal)) {
              badges.push(<Badge tone="danger">{t("livestock.badgeError")}</Badge>);
            }
            if (animal.isPregnant) {
              badges.push(<Badge tone="warn">{t("livestock.badgePregnant")}</Badge>);
            }
            if (animal.isLactating) {
              badges.push(<Badge tone="accent">{t("livestock.badgeLactating")}</Badge>);
            }
            if (animal.isParent) badges.push(<Badge>{t("livestock.badgeParent")}</Badge>);
            return badges.length ? <span class="fd-livestock__chips">{badges}</span> : "—";
          },
        }),
        columnHelper.accessor((row) => resolveAnimalLocationLabel(row), {
          id: "location",
          header: () => t("livestock.colLocation"),
          cell: (info) => {
            const loc = info.getValue();
            if (!loc || loc === "Unknown") {
              return <Badge>{t("livestock.locationUnknownBadge")}</Badge>;
            }
            const tone = resolveAnimalLocationType(info.row.original).includes("Pig")
              ? "warn"
              : "accent";
            return <Badge tone={tone}>{loc}</Badge>;
          },
        }),
        columnHelper.display({
          id: "actions",
          header: () => t("livestock.colActions"),
          enableSorting: false,
          cell: (info) => {
            const animal = info.row.original;
            if (animal.__emptyPen) {
              return (
              <div class="fd-livestock__actions" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" onClick={() => openPen(animal.husbandryId)}>
                  {t("livestock.openPenDetailTitle")}
                </Button>
              </div>
            );
            }
            return (
              <div class="fd-livestock__actions" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" onClick={() => openAnimalDetails(animal.id)}>
                  {t("livestock.btnDetails")}
                </Button>
                {animal.husbandryId != null ? (
                  <Button variant="ghost" onClick={() => openPen(animal.husbandryId)}>
                    {t("livestock.penDetailTitle")}
                  </Button>
                ) : null}
              </div>
            );
          },
        }),
      ] as ColumnDef<LivestockAnimal, unknown>[],
    // openAnimalDetails/openPen close over latest animals via state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [animals]
  );

  const { table, globalFilter, setGlobalFilter } = useLivestockTable({
    data: filteredAnimals,
    columns,
    getRowId: (row, index) => livestockTableRowId(row, index),
    initialPageSize: 25,
  });

  useEffect(() => {
    if (!filtersOpen) return;
    const timer = window.setTimeout(() => {
      setAdvanced(draftAdvanced);
      setFilterMode("advanced");
      setSummaryFilter("all");
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftAdvanced, filtersOpen]);

  const onSummaryClick = (filter: SummaryFilter) => {
    setSummaryFilter(filter);
    setFilterMode(filter === "all" ? "none" : "summary");
    setAdvanced(createDefaultAdvancedFilters());
    setDraftAdvanced(createDefaultAdvancedFilters());
  };

  const resetFilters = () => {
    const defaults = createDefaultAdvancedFilters();
    setDraftAdvanced(defaults);
    setAdvanced(defaults);
    setFilterMode("none");
    setSummaryFilter("all");
  };

  const applyFiltersNow = () => {
    setAdvanced(draftAdvanced);
    setFilterMode(isAdvancedFiltersDefault(draftAdvanced) ? "none" : "advanced");
    setSummaryFilter("all");
  };

  const runExport = (format: ExportFormat) => {
    const rows = buildExportRows(filteredAnimals);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (format === "csv") {
      downloadTextFile(`livestock-${stamp}.csv`, exportRowsToCsv(rows), "text/csv;charset=utf-8");
    } else if (format === "excel") {
      downloadTextFile(
        `livestock-${stamp}.xls`,
        exportRowsToExcelHtml(rows),
        "application/vnd.ms-excel;charset=utf-8"
      );
    } else if (format === "pdf" || format === "print") {
      openPrintableReport(rows, t("export.title"));
    }
    setExportOpen(false);
  };

  return (
    <div class={`fd-livestock ${embedded ? "fd-livestock--embedded" : ""}`}>
      <div class="fd-livestock__header">
        {embedded ? null : (
          <div>
            <h2>{t("livestock.heading")}</h2>
            <FreshnessChip payload={payload} onRefresh={() => void refreshDashboard()} />
          </div>
        )}
        <div class="fd-livestock__tabs" role="tablist">
          <button
            type="button"
            class={`fd-livestock__tab ${pane === "animals" ? "is-active" : ""}`}
            onClick={() => setPane("animals")}
          >
            {t("livestock.animalsList")}
          </button>
          <button
            type="button"
            class={`fd-livestock__tab ${pane === "statistics" ? "is-active" : ""}`}
            onClick={() => setPane("statistics")}
          >
            {t("stats.title")}
          </button>
          <button
            type="button"
            class={`fd-livestock__tab ${pane === "genetics" ? "is-active" : ""}`}
            onClick={() => setPane("genetics")}
          >
            {t("genetics.title")}
          </button>
        </div>
      </div>

      {pane === "statistics" ? (
        <Card title={t("stats.title")}>
          <p class="fd-livestock__placeholder">{t("livestock.statsUnwired")}</p>
        </Card>
      ) : null}

      {pane === "genetics" ? (
        <Card title={t("genetics.title")}>
          {geneticsOverview.withGenetics === 0 ? (
            <div class="fd-livestock__empty">
              <h4>{t("genetics.placeholder")}</h4>
              {hasNoAnimals ? (
                <p>{t("livestock.emptyNoAnimalsBody")}</p>
              ) : (
                <p>{t("genetics.noDataHint")}</p>
              )}
            </div>
          ) : (
            <div class="fd-genetics">
              <div class="fd-genetics__summary">
                <Badge tone="accent">
                  {t("genetics.withData", {
                    with: geneticsOverview.withGenetics,
                    total: geneticsOverview.totalAnimals,
                  })}
                </Badge>
                <Badge>
                  {t("genetics.coverage", { pct: geneticsOverview.coveragePct })}
                </Badge>
                {geneticsOverview.averages ? (
                  <Badge>
                    {t("genetics.herdAverage")}:{" "}
                    {formatGeneticsPercent(geneticsOverview.averages.overall)}
                  </Badge>
                ) : null}
              </div>

              {geneticsOverview.averages ? (
                <div class="fd-genetics__traits">
                  {(
                    [
                      ["livestock.geneticsShortHealth", geneticsOverview.averages.health],
                      ["livestock.geneticsFilterMetabolism", geneticsOverview.averages.metabolism],
                      ["livestock.geneticsShortFertility", geneticsOverview.averages.fertility],
                      ["livestock.geneticsShortQuality", geneticsOverview.averages.quality],
                      ["livestock.geneticsShortProductivity", geneticsOverview.averages.productivity],
                    ] as const
                  ).map(([labelKey, value]) => (
                    <div key={labelKey} class="fd-genetics__trait">
                      <span>{t(labelKey)}</span>
                      <strong>{formatGeneticsPercent(value)}</strong>
                      <div class="fd-genetics__bar" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, Math.round(value * 50))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {geneticsOverview.byType.length > 0 ? (
                <div class="fd-genetics__bands">
                  <h4>{t("genetics.byType")}</h4>
                  <ul>
                    {geneticsOverview.byType.map((row) => {
                      const typeKey = `livestock.animalType${row.typeKey}`;
                      const label = t(typeKey) !== typeKey ? t(typeKey) : row.typeLabel;
                      return (
                        <li key={row.typeKey}>
                          <span>
                            {label} ({row.count})
                          </span>
                          <strong>{formatGeneticsPercent(row.avgOverall)}</strong>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {geneticsOverview.bands.length > 0 ? (
                <div class="fd-genetics__bands">
                  <h4>{t("genetics.distribution")}</h4>
                  <ul>
                    {geneticsOverview.bands.map((b) => (
                      <li key={b.key}>
                        <span>{t(b.key)}</span>
                        <strong>{b.count}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {geneticsOverview.top.length > 0 ? (
                <div class="fd-genetics__top">
                  <h4>{t("genetics.topAnimals")}</h4>
                  <p class="fd-livestock__status">{t("genetics.clickAnimal")}</p>
                  <table class="fd-genetics__table">
                    <thead>
                      <tr>
                        <th>{t("livestock.colId")}</th>
                        <th>{t("livestock.colType")}</th>
                        <th>{t("genetics.overall")}</th>
                        <th>{t("livestock.geneticsHeading")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {geneticsOverview.top.map((row) => (
                        <tr
                          key={String(row.id)}
                          class="fd-genetics__row-click"
                          onClick={() => openAnimalDetails(row.id)}
                        >
                          <td>{row.name}</td>
                          <td>{row.typeLabel}</td>
                          <td>{formatGeneticsPercent(row.overall)}</td>
                          <td>{t(row.bandKey)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}
        </Card>
      ) : null}

      {pane === "animals" ? (
        <>
          {waitingForData ? (
            <UiStatePanel
              ui={buildModuleUiState({
                state: connection === "connecting" ? "loading" : "empty",
                source: payload?.dataSource || "unknown",
              })}
              title={t("livestock.emptyWaitingTitle")}
              body={t("livestock.emptyWaitingBody")}
            />
          ) : hasNoAnimals ? (
            <UiStatePanel
              ui={buildModuleUiState({ state: "empty", source: payload?.dataSource || "unknown" })}
              title={t("livestock.emptyNoAnimalsTitle")}
              body={t("livestock.emptyNoAnimalsBody")}
            />
          ) : (
            <>
          {lodState.capHit || lodState.trimmed > 0 ? (
            <div class="fd-livestock__banner" role="status">
              {t("livestock.lodCapBanner", {
                emitted: lodState.emitted,
                cap: lodState.cap,
                trimmed: lodState.trimmed,
              })}
            </div>
          ) : null}

          <div class="fd-livestock__summary">
            <button
              type="button"
              class={`fd-livestock__summary-card ${summaryFilter === "all" && filterMode !== "advanced" ? "is-active" : ""}`}
              onClick={() => onSummaryClick("all")}
            >
              <h3>{t("livestock.total")}</h3>
              <strong>{summary.totalCount}</strong>
            </button>
            <button
              type="button"
              class={`fd-livestock__summary-card ${summaryFilter === "lactating" ? "is-active" : ""}`}
              onClick={() => onSummaryClick("lactating")}
            >
              <h3>{t("livestock.lactating")}</h3>
              <strong>{summary.lactatingCount}</strong>
            </button>
            <button
              type="button"
              class={`fd-livestock__summary-card ${summaryFilter === "pregnant" ? "is-active" : ""}`}
              onClick={() => onSummaryClick("pregnant")}
            >
              <h3>{t("livestock.pregnant")}</h3>
              <strong>{summary.pregnantCount}</strong>
            </button>
            <button
              type="button"
              class={`fd-livestock__summary-card ${summaryFilter === "health" ? "is-active" : ""}`}
              onClick={() => onSummaryClick("health")}
            >
              <h3>{t("livestock.avgHealth")}</h3>
              <strong>{summary.avgHealth}%</strong>
            </button>
          </div>

          <Card>
            <div class="fd-livestock__filters-head">
              <h3 class="fd-card__title" style={{ margin: 0 }}>
                {t("livestock.filters")}
              </h3>
              <div class="fd-livestock__filters-actions">
                <Button variant="ghost" onClick={() => setFiltersOpen((v) => !v)}>
                  {filtersOpen ? t("livestock.hideFilters") : t("livestock.showFilters")}
                </Button>
                <Button variant="ghost" onClick={resetFilters}>
                  {t("livestock.reset")}
                </Button>
              </div>
            </div>

            {filtersOpen ? (
              <>
                <div class="fd-livestock__filters-grid">
                  <div class="fd-livestock__field">
                    <label>{t("livestock.filterAgeRange")}</label>
                    <div class="fd-livestock__range-pair">
                      <input
                        type="number"
                        min={0}
                        placeholder={t("placeholder.min")}
                        value={draftAdvanced.ageMin ?? ""}
                        onInput={(e) => {
                          const v = (e.currentTarget as HTMLInputElement).value;
                          setDraftAdvanced((f) => ({
                            ...f,
                            ageMin: v === "" ? null : Number(v),
                          }));
                        }}
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder={t("placeholder.max")}
                        value={draftAdvanced.ageMax ?? ""}
                        onInput={(e) => {
                          const v = (e.currentTarget as HTMLInputElement).value;
                          setDraftAdvanced((f) => ({
                            ...f,
                            ageMax: v === "" ? null : Number(v),
                          }));
                        }}
                      />
                    </div>
                  </div>

                  <div class="fd-livestock__field">
                    <label>{t("livestock.filterWeightRange")}</label>
                    <div class="fd-livestock__range-pair">
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder={t("placeholder.min")}
                        value={draftAdvanced.weightMin ?? ""}
                        onInput={(e) => {
                          const v = (e.currentTarget as HTMLInputElement).value;
                          setDraftAdvanced((f) => ({
                            ...f,
                            weightMin: v === "" ? null : Number(v),
                          }));
                        }}
                      />
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        placeholder={t("placeholder.max")}
                        value={draftAdvanced.weightMax ?? ""}
                        onInput={(e) => {
                          const v = (e.currentTarget as HTMLInputElement).value;
                          setDraftAdvanced((f) => ({
                            ...f,
                            weightMax: v === "" ? null : Number(v),
                          }));
                        }}
                      />
                    </div>
                  </div>

                  <DualRange
                    label={t("livestock.filterHealthRange")}
                    min={0}
                    max={100}
                    valueMin={draftAdvanced.healthMin}
                    valueMax={draftAdvanced.healthMax}
                    onChange={(min, max) =>
                      setDraftAdvanced((f) => ({ ...f, healthMin: min, healthMax: max }))
                    }
                  />
                  <DualRange
                    label={t("livestock.filterMetabolismRange")}
                    min={0}
                    max={200}
                    valueMin={draftAdvanced.metabolismMin}
                    valueMax={draftAdvanced.metabolismMax}
                    onChange={(min, max) =>
                      setDraftAdvanced((f) => ({ ...f, metabolismMin: min, metabolismMax: max }))
                    }
                  />
                  <DualRange
                    label={t("livestock.filterFertilityRange")}
                    min={0}
                    max={200}
                    valueMin={draftAdvanced.fertilityMin}
                    valueMax={draftAdvanced.fertilityMax}
                    onChange={(min, max) =>
                      setDraftAdvanced((f) => ({ ...f, fertilityMin: min, fertilityMax: max }))
                    }
                  />
                  <DualRange
                    label={t("livestock.filterQualityRange")}
                    min={0}
                    max={200}
                    valueMin={draftAdvanced.qualityMin}
                    valueMax={draftAdvanced.qualityMax}
                    onChange={(min, max) =>
                      setDraftAdvanced((f) => ({ ...f, qualityMin: min, qualityMax: max }))
                    }
                  />
                  <DualRange
                    label={t("livestock.filterProductivityRange")}
                    min={0}
                    max={200}
                    valueMin={draftAdvanced.productivityMin}
                    valueMax={draftAdvanced.productivityMax}
                    onChange={(min, max) =>
                      setDraftAdvanced((f) => ({
                        ...f,
                        productivityMin: min,
                        productivityMax: max,
                      }))
                    }
                  />

                  <div class="fd-livestock__field">
                    <label>{t("livestock.filterAnimalType")}</label>
                    <select
                      value={draftAdvanced.animalType ?? ""}
                      onChange={(e) => {
                        const v = (e.currentTarget as HTMLSelectElement).value;
                        setDraftAdvanced((f) => ({ ...f, animalType: v || null }));
                      }}
                    >
                      <option value="">{t("livestock.animalTypeAll")}</option>
                      <option value="COW">{t("livestock.animalTypeCOW")}</option>
                      <option value="BULL">{t("livestock.animalTypeBULL")}</option>
                      <option value="SHEEP">{t("livestock.animalTypeSHEEP")}</option>
                      <option value="PIG">{t("livestock.animalTypePIG")}</option>
                      <option value="CHICKEN">{t("livestock.animalTypeCHICKEN")}</option>
                      <option value="HORSE">{t("livestock.animalTypeHORSE")}</option>
                    </select>
                  </div>

                  <div class="fd-livestock__field" style={{ display: "flex", alignItems: "end" }}>
                    <Button onClick={applyFiltersNow}>{t("livestock.applyFilters")}</Button>
                  </div>
                </div>

                {activeChips.length > 0 ? (
                  <div class="fd-livestock__chips">
                    {activeChips.map((chip) => (
                      <Badge key={chip.key}>
                        {chip.text ? chip.text : t(chip.labelKey, chip.params)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </Card>

          <Card>
            <div class="fd-livestock__filters-head">
              <h3 class="fd-card__title" style={{ margin: 0 }}>
                {t("livestock.animalsList")}
              </h3>
              <div class="fd-livestock__filters-actions">
                <input
                  class="fd-livestock__search"
                  style={{ width: "14rem" }}
                  placeholder={t("livestock.dtSearch")}
                  value={globalFilter ?? ""}
                  onInput={(e) => setGlobalFilter((e.currentTarget as HTMLInputElement).value)}
                />
                <select
                  value={table.getState().pagination.pageSize}
                  onChange={(e) =>
                    table.setPageSize(Number((e.currentTarget as HTMLSelectElement).value))
                  }
                >
                  {[10, 25, 50, 100, 200, 500].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  <option value={99999}>{t("livestock.dtAll")}</option>
                </select>
              </div>
            </div>

            <p class="fd-livestock__status">{filterStatus}</p>
            <p class="fd-livestock__status fd-livestock__hint">{t("livestock.rowSelectHint")}</p>

            <div
              class={`fd-livestock__layout ${useInlineDetail ? "fd-livestock__layout--detail" : ""}`}
            >
              {useInlineDetail ? detailPanel : null}
              <div class="fd-livestock__layout-main">
                <div
                  class="fd-livestock__table-wrap"
                  style={
                    {
                      "--fd-livestock-page-rows": String(
                        Math.min(Number(table.getState().pagination.pageSize) || 25, 50),
                      ),
                    } as Record<string, string>
                  }
                >
                  <table class="fd-livestock__table">
                    <thead>
                      {table.getHeaderGroups().map((hg) => (
                        <tr key={hg.id}>
                          {hg.headers.map((header) => (
                            <th
                              key={header.id}
                              class={header.column.getCanSort() ? "" : "no-sort"}
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {{
                                asc: " ↑",
                                desc: " ↓",
                              }[header.column.getIsSorted() as string] ?? null}
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody>
                      {table.getRowModel().rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={columns.length}
                            style={{ textAlign: "center", color: "var(--farm-text-muted)" }}
                          >
                            <div class="fd-livestock__empty fd-livestock__empty--inline">
                              <h4>{t("livestock.emptyFilterTitle")}</h4>
                              <p>{t("livestock.emptyFilterBody")}</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        table.getRowModel().rows.map((row) => {
                          const animal = row.original;
                          const rowSelected =
                            selectedAnimalId != null && String(animal.id) === selectedAnimalId;
                          return (
                            <tr
                              key={row.id}
                              class={rowSelected ? "is-selected" : ""}
                              onClick={() => selectAnimalRow(animal)}
                            >
                              {row.getVisibleCells().map((cell) => (
                                <td key={cell.id}>
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                              ))}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div class="fd-livestock__table-footer">
                  <Button variant="ghost" onClick={() => setExportOpen(true)}>
                    {t("livestock.export")}
                  </Button>
                  <div class="fd-livestock__pager">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (table.getCanPreviousPage()) table.previousPage();
                      }}
                    >
                      ‹
                    </Button>
                    <span class="fd-livestock__status">
                      {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
                    </span>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (table.getCanNextPage()) table.nextPage();
                      }}
                    >
                      ›
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            {detailHost && detailPanel ? createPortal(detailPanel, detailHost) : null}
          </Card>
            </>
          )}
        </>
      ) : null}

      {exportOpen ? (
        <div class="fd-modal-backdrop" role="presentation" onClick={() => setExportOpen(false)}>
          <div
            class="fd-modal fd-modal--sm"
            ref={exportTrapRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="fd-modal__header">
              <h3 id="export-title">{t("export.title")}</h3>
              <Button variant="ghost" onClick={() => setExportOpen(false)}>
                {t("common.close")}
              </Button>
            </div>
            <p class="fd-livestock__status">{t("export.intro")}</p>
            <div class="fd-modal__export-grid">
              <Button onClick={() => runExport("csv")}>
                {t("export.csv")}
                <div class="fd-livestock__status">{t("export.csvSub")}</div>
              </Button>
              <Button variant="ghost" onClick={() => runExport("excel")}>
                {t("export.xlsx")}
                <div class="fd-livestock__status">{t("export.xlsxSub")}</div>
              </Button>
              <Button variant="ghost" onClick={() => runExport("pdf")}>
                {t("export.pdf")}
                <div class="fd-livestock__status">{t("export.pdfSub")}</div>
              </Button>
              <Button variant="ghost" onClick={() => runExport("print")}>
                {t("export.print")}
                <div class="fd-livestock__status">{t("export.printSub")}</div>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {detailAnimal ? (
        <AnimalDetailsModal animal={detailAnimal} onClose={() => setDetailAnimal(null)} />
      ) : null}

      {penId ? (
        <PenDetailModal penId={penId} serverId={activeServerId} onClose={() => setPenId(null)} />
      ) : null}
    </div>
  );
}
