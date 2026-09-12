import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Badge, Button, Card } from "@/components/ui";
import { t, tOr } from "@/i18n/i18n";
import { summarizeAdsFleet } from "@/lib/vehicleAds";
import {
  getDecadeFilterLabel,
  summarizeVehicleYearsFleet,
  VEHICLE_DECADE_FILTER_OPTIONS,
} from "@/lib/vehicleYears";
import {
  filterFleetVehicles,
  getDisplayFleet,
  parseVehicleDeepLinkFilter,
  refreshShopImageFilenamesFromApi,
  resolveVehicleRoleFilter,
  summarizeFleetCards,
  vehicleMatchesDeepLinkId,
  vehicleRowKey,
  type FleetVehicle,
  type VehicleFilterState,
  type VehicleSummaryFilter,
} from "@/lib/vehicles";
import { useDashboardStore } from "@/store/dashboard-store";
import { VehicleCard } from "@/sections/vehicles/VehicleCard";
import { VehicleTable } from "@/sections/vehicles/VehicleTable";
import "@/sections/vehicles/vehicles.css";

const EMPTY_FILTERS: VehicleFilterState = { type: "", fuel: "", status: "", decade: "" };

export function VehiclesSection() {
  const payload = useDashboardStore((s) => s.payload);
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);
  const sectionParams = useDashboardStore((s) => s.sectionParams);
  const setSectionParams = useDashboardStore((s) => s.setSectionParams);
  const setSection = useDashboardStore((s) => s.setSection);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<VehicleFilterState>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<VehicleFilterState>(EMPTY_FILTERS);
  const [summaryFilter, setSummaryFilter] = useState<VehicleSummaryFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imagesReady, setImagesReady] = useState(0);
  const [viewMode, setViewMode] = useState<"cards" | "table">(
    () => (sectionParams.view === "table" ? "table" : "cards")
  );

  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshShopImageFilenamesFromApi().then(() => setImagesReady((n) => n + 1));
  }, []);

  useEffect(() => {
    const { summary, decade } = parseVehicleDeepLinkFilter(sectionParams.filter);
    if (summary && summary !== "all") {
      setSummaryFilter(summary);
      if (summary === "low-fuel") {
        const next = { ...EMPTY_FILTERS, fuel: "low" };
        setFilters(next);
        setDraftFilters(next);
      } else if (summary === "damaged") {
        const next = { ...EMPTY_FILTERS, status: "damaged" };
        setFilters(next);
        setDraftFilters(next);
      } else if (summary === "needs-repair") {
        const next = { ...EMPTY_FILTERS, status: "needs-repair" };
        setFilters(next);
        setDraftFilters(next);
      } else if (summary === "overdue") {
        setFilters(EMPTY_FILTERS);
        setDraftFilters(EMPTY_FILTERS);
      } else {
        setFilters(EMPTY_FILTERS);
        setDraftFilters(EMPTY_FILTERS);
      }
    } else if (!sectionParams.filter) {
      /* keep user filters */
    }

    if (decade) {
      const next = { ...EMPTY_FILTERS, decade };
      setFilters(next);
      setDraftFilters(next);
      setSummaryFilter("all");
    }

    if (sectionParams.role) {
      const roleFilters = resolveVehicleRoleFilter(sectionParams.role);
      const next = { ...EMPTY_FILTERS, ...roleFilters };
      setFilters(next);
      setDraftFilters(next);
      setSummaryFilter("all");
    }

    if (sectionParams.id) {
      setSelectedId(String(sectionParams.id));
    } else {
      setSelectedId(null);
    }

    if (sectionParams.view === "table" || sectionParams.view === "cards") {
      setViewMode(sectionParams.view);
    }
  }, [sectionParams.filter, sectionParams.view, sectionParams.id, sectionParams.role]);

  const fleet = useMemo(
    () => getDisplayFleet(payload?.vehicles, activeFarmId ?? 1),
    [payload?.vehicles, activeFarmId]
  );

  const summary = useMemo(() => summarizeFleetCards(fleet), [fleet]);
  const adsFleet = useMemo(() => summarizeAdsFleet(fleet), [fleet]);
  const vyFleet = useMemo(() => summarizeVehicleYearsFleet(fleet), [fleet]);

  const filtered = useMemo(
    () => filterFleetVehicles(fleet, filters, summaryFilter === "all" ? null : summaryFilter),
    [fleet, filters, summaryFilter, imagesReady]
  );

  const selectedVehicle = useMemo((): FleetVehicle | null => {
    if (!selectedId) return null;
    return (
      fleet.find((v) => vehicleRowKey(v) === selectedId) ||
      fleet.find((v) => vehicleMatchesDeepLinkId(v, selectedId)) ||
      null
    );
  }, [fleet, selectedId]);

  const visible = useMemo(() => {
    if (!selectedVehicle) return filtered;
    const key = vehicleRowKey(selectedVehicle);
    if (filtered.some((v) => vehicleRowKey(v) === key)) return filtered;
    return [selectedVehicle, ...filtered];
  }, [filtered, selectedVehicle]);

  useEffect(() => {
    if (!selectedId) return;
    const el =
      gridRef.current?.querySelector(`[data-vehicle-id="${CSS.escape(selectedId)}"]`) ||
      document.querySelector(`[data-vehicle-id="${CSS.escape(selectedId)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedId, visible.length, viewMode]);

  const onSummaryClick = (kind: VehicleSummaryFilter) => {
    setSummaryFilter(kind);
    if (kind === "all") {
      setFilters(EMPTY_FILTERS);
      setDraftFilters(EMPTY_FILTERS);
      setSectionParams({ ...sectionParams, filter: undefined });
    } else {
      setFilters(EMPTY_FILTERS);
      setDraftFilters(EMPTY_FILTERS);
      setSectionParams({ ...sectionParams, filter: kind });
    }
  };

  const applyFilters = () => {
    setFilters({ ...draftFilters });
    setSummaryFilter("all");
    const nextParams = { ...sectionParams, filter: undefined as string | undefined };
    if (draftFilters.decade) nextParams.filter = `decade:${draftFilters.decade}`;
    setSectionParams(nextParams);
  };

  const setView = (mode: "cards" | "table") => {
    setViewMode(mode);
    setSectionParams({ ...sectionParams, view: mode });
  };

  const selectVehicle = (vehicle: FleetVehicle) => {
    const id = vehicleRowKey(vehicle);
    setSelectedId(id);
    setSectionParams({ ...sectionParams, id });
  };

  return (
    <div class="fd-vehicles">
      <header class="fd-vehicles__header">
        <h2>{t("vehicles.title")}</h2>
        <p class="fd-muted">{t("vehicles.subtitle")}</p>
      </header>

      <div class="fd-vehicles__summary">
        <SummaryCard
          title={t("vehicles.summaryTotal")}
          hint={t("vehicles.summaryTotalHint")}
          value={summary.totalCount}
          active={summaryFilter === "all" && !filters.decade && !filters.type}
          onClick={() => onSummaryClick("all")}
        />
        <SummaryCard
          title={t("vehicles.summaryLowFuel")}
          hint={t("vehicles.summaryLowFuelHint")}
          value={summary.lowFuelCount}
          tone="warn"
          active={summaryFilter === "low-fuel"}
          onClick={() => onSummaryClick("low-fuel")}
        />
        <SummaryCard
          title={t("vehicles.summaryHighDamage")}
          hint={t("vehicles.summaryHighDamageHint")}
          value={summary.damagedCount}
          tone="danger"
          active={summaryFilter === "damaged"}
          onClick={() => onSummaryClick("damaged")}
        />
        {adsFleet.enabled ? (
          <SummaryCard
            title={tOr("vehicles.adsAttention", "ADS attention")}
            hint={tOr(
              "vehicles.adsAttentionHint",
              "Breakdowns, overdue service, or inspection warnings"
            )}
            value={adsFleet.needsRepairCount}
            tone="warn"
            active={summaryFilter === "needs-repair"}
            onClick={() => onSummaryClick("needs-repair")}
          />
        ) : null}
      </div>

      <div class="fd-section-toolbar fd-vehicles__filters-bar">
        <div class="fd-vehicles__view-toggle" role="group" aria-label={t("vehicles.title")}>
          <Button
            variant={viewMode === "table" ? "primary" : "ghost"}
            onClick={() => setView("table")}
          >
            {t("vehicles.viewTable")}
          </Button>
          <Button
            variant={viewMode === "cards" ? "primary" : "ghost"}
            onClick={() => setView("cards")}
          >
            {t("vehicles.viewCards")}
          </Button>
        </div>
        <div class="fd-vehicles__filters-actions">
          <Button variant="ghost" onClick={() => setFiltersOpen((o) => !o)}>
            {filtersOpen ? t("vehicles.hideFilters") : t("vehicles.showFilters")}
          </Button>
          <Badge>{visible.length}</Badge>
        </div>
      </div>

      {filtersOpen ? (
        <Card title={t("vehicles.filtersTitle")} class="fd-vehicles__filters">
          <div class="fd-vehicles__filter-grid">
            <label>
              <span>{t("vehicles.labelVehicleType")}</span>
              <select
                value={draftFilters.type}
                onChange={(e) =>
                  setDraftFilters((f) => ({
                    ...f,
                    type: (e.target as HTMLSelectElement).value,
                  }))
                }
              >
                <option value="">{t("vehicles.optAllTypes")}</option>
                <option value="tractor">{t("vehicles.optTractors")}</option>
                <option value="motorized">{t("vehicles.optMotorized")}</option>
                <option value="trailer">{t("vehicles.optTrailers")}</option>
                <option value="implement">{t("vehicles.optImplements")}</option>
                <option value="cultivator">{t("vehicles.optCultivators")}</option>
              </select>
            </label>
            <label>
              <span>{t("vehicles.labelFuelLevel")}</span>
              <select
                value={draftFilters.fuel}
                onChange={(e) =>
                  setDraftFilters((f) => ({
                    ...f,
                    fuel: (e.target as HTMLSelectElement).value,
                  }))
                }
              >
                <option value="">{t("vehicles.optFuelAll")}</option>
                <option value="empty">{t("vehicles.optFuelEmpty")}</option>
                <option value="low">{t("vehicles.optFuelLow")}</option>
                <option value="medium">{t("vehicles.optFuelMedium")}</option>
                <option value="full">{t("vehicles.optFuelFull")}</option>
              </select>
            </label>
            <label>
              <span>{t("vehicles.labelStatus")}</span>
              <select
                value={draftFilters.status}
                onChange={(e) =>
                  setDraftFilters((f) => ({
                    ...f,
                    status: (e.target as HTMLSelectElement).value,
                  }))
                }
              >
                <option value="">{t("vehicles.optStatusAll")}</option>
                <option value="active">{t("vehicles.optStatusEngineOn")}</option>
                <option value="inactive">{t("vehicles.optStatusEngineOff")}</option>
                <option value="damaged">{t("vehicles.optStatusDamaged")}</option>
                <option value="needs-repair">{t("vehicles.optStatusNeedsRepair")}</option>
                <option value="overdue">{t("vehicles.optStatusOverdue")}</option>
                <option value="breakdown">{t("vehicles.optStatusBreakdown")}</option>
              </select>
            </label>
            {vyFleet.enabled ? (
              <label>
                <span>{t("vehicles.labelDecade")}</span>
                <select
                  value={draftFilters.decade}
                  onChange={(e) =>
                    setDraftFilters((f) => ({
                      ...f,
                      decade: (e.target as HTMLSelectElement).value,
                    }))
                  }
                >
                  <option value="">{t("vehicles.optDecadeAll")}</option>
                  {VEHICLE_DECADE_FILTER_OPTIONS.map((id) => (
                    <option key={id} value={id}>
                      {getDecadeFilterLabel(id)}
                    </option>
                  ))}
                  <option value="unknown">{t("vehicles.decadeUnknown")}</option>
                </select>
              </label>
            ) : null}
            <Button onClick={applyFilters}>{t("vehicles.applyFilters")}</Button>
          </div>
        </Card>
      ) : null}

      {visible.length === 0 ? (
        <div class="fd-vehicles__empty">
          <h3>{t("vehicles.emptyNoneTitle")}</h3>
          <p class="fd-muted">{t("vehicles.emptyNoneBody")}</p>
        </div>
      ) : (
        <div class="fd-vehicles__workspace">
          <div class="fd-vehicles__main">
            {viewMode === "table" ? (
              <VehicleTable
                vehicles={visible}
                focusedId={selectedId}
                onFocus={(v) => selectVehicle(v)}
              />
            ) : (
              <div class="fd-vehicles__grid" ref={gridRef}>
                {visible.map((v) => (
                  <VehicleCard
                    key={vehicleRowKey(v)}
                    vehicle={v}
                    focused={Boolean(selectedId && vehicleRowKey(v) === selectedId)}
                    onSelect={() => selectVehicle(v)}
                    onShowOnMap={() =>
                      setSection("map", { id: String(v.id ?? vehicleRowKey(v)) })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  hint,
  value,
  displayValue,
  tone,
  active,
  onClick,
}: {
  title: string;
  hint: string;
  value: number;
  displayValue?: string;
  tone?: "warn" | "danger";
  active?: boolean;
  onClick?: () => void;
}) {
  const shown = displayValue ?? String(value);
  if (onClick) {
    return (
      <button
        type="button"
        class={`fd-vehicles-summary-card${active ? " is-active" : ""}${tone ? ` is-${tone}` : ""}`}
        onClick={onClick}
      >
        <span class="fd-vehicles-summary-card__title">{title}</span>
        <strong class="fd-vehicles-summary-card__value">{shown}</strong>
        <small class="fd-muted">{hint}</small>
      </button>
    );
  }
  return (
    <div class={`fd-vehicles-summary-card${tone ? ` is-${tone}` : ""}`}>
      <span class="fd-vehicles-summary-card__title">{title}</span>
      <strong class="fd-vehicles-summary-card__value">{shown}</strong>
      <small class="fd-muted">{hint}</small>
    </div>
  );
}
