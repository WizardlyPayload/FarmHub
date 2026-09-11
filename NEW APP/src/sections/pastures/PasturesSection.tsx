import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { t, tOr } from "@/i18n/i18n";
import { Badge, Button, Card } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import { isMultiFarmEnabled } from "@/lib/farm-scope";
import {
  formatPastureHealthPercent,
  formatResourceDurationHint,
  fmtAgeMonthsStr,
  getHealthClass,
  getLowHealthAnimalsForPastures,
  getWarningTypeTitle,
  parsePasturesFromPayload,
} from "@/lib/pastures-parsers";
import {
  pastureFoodLiters,
  pastureResourceMonitored,
  pastureStrawLiters,
  pastureWaterLiters,
  shouldShowPastureResource,
} from "@/lib/pastures-display";
import type { Pasture, PastureAnimal, PastureWarning } from "@/lib/pastures-types";
import {
  LivestockPenPanel,
  type LivestockPenPane,
} from "@/sections/livestock/LivestockPenPanel";
import { DairyCorePanel } from "@/sections/pastures/DairyCorePanel";
import { useHydratedLivestockAnimals } from "@/lib/use-hydrated-livestock";
import "./pastures.css";

type ModalState =
  | { kind: "none" }
  | { kind: "details"; pasture: Pasture }
  | { kind: "farmWide" }
  | { kind: "warning"; pasture: Pasture; warning: PastureWarning }
  | { kind: "lowHealth"; animals: Array<PastureAnimal & { pastureName: string; health: number }> };

function asLivestockPane(raw: string | undefined): LivestockPenPane {
  if (raw === "genetics" || raw === "statistics" || raw === "animals") return raw;
  return "animals";
}

function DurationHint({
  foodReport,
  resource,
}: {
  foodReport: Pasture["foodReport"];
  resource: "food" | "water" | "straw";
}) {
  const hint = formatResourceDurationHint(foodReport, resource);
  if (!hint) return null;
  return <span class="fd-pasture-duration"> ({hint})</span>;
}

function ResourceLine({
  pasture,
  resource,
}: {
  pasture: Pasture;
  resource: "food" | "water" | "straw";
}) {
  const fr = pasture.foodReport;
  if (!shouldShowPastureResource(fr, resource, pasture.animalCount)) return null;

  const labels = {
    food: t("pastures.card.availableFood"),
    water: t("pastures.card.water"),
    straw: t("pastures.card.straw"),
  } as const;

  const liters =
    resource === "food"
      ? pastureFoodLiters(fr)
      : resource === "water"
        ? pastureWaterLiters(fr)
        : pastureStrawLiters(fr);

  const monitored = pastureResourceMonitored(fr, resource);

  return (
    <div>
      <strong>{labels[resource]}:</strong>{" "}
      {monitored ? (
        <>
          {liters.toFixed(0)}L
          <DurationHint foodReport={fr} resource={resource} />
        </>
      ) : (
        <span class="fd-muted-sm">{t("pastures.card.notMonitored")}</span>
      )}
    </div>
  );
}

function isDairyPasture(pasture: Pasture): boolean {
  return (pasture.animals || []).some((animal) => {
    const subTypeUpper = (animal.subType || "").toUpperCase();
    return (
      subTypeUpper.includes("COW") ||
      subTypeUpper === "COW" ||
      subTypeUpper.includes("GOAT")
    );
  });
}

function HealthBar({ health }: { health: number }) {
  const pct = Math.max(0, Math.min(100, health));
  return (
    <span class="fd-health-bar">
      <span class="fd-health-bar__track">
        <span
          class={`fd-health-bar__fill ${getHealthClass(health)}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span>{Math.round(health)}%</span>
    </span>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
}) {
  const trapRef = useFocusTrap(true, onClose);
  return (
    <div
      class="fd-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="fd-modal" ref={trapRef}>
        <div class="fd-modal__head">
          <h3>{title}</h3>
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
        <div>{children}</div>
        {footer ? <div class="fd-modal__foot">{footer}</div> : null}
      </div>
    </div>
  );
}

function PastureCard({
  pasture,
  onDetails,
  onLivestock,
  onWarning,
  showResources = true,
}: {
  pasture: Pasture;
  onDetails: () => void;
  onLivestock: () => void;
  onWarning: (index: number) => void;
  showResources?: boolean;
}) {
  const warnings = pasture.allWarnings || [];
  const prod = Math.round(Number(pasture.conditionReport?.productivity) || 0);
  const hasMilkData =
    pasture.milkProductionData && pasture.milkProductionData.lactatingCows > 0;
  const dairy = hasMilkData && isDairyPasture(pasture);

  if (pasture.isEmptyPasture) {
    return (
      <Card>
        <div class="fd-pasture-card__head">
          <h4>{pasture.name}</h4>
          <div class="fd-pasture-card__actions">
            <Button variant="ghost" onClick={onDetails}>
              {t("pastures.btnDetails")}
            </Button>
          </div>
        </div>
        <p class="fd-muted-sm">{t("pastures.emptyPenHint")}</p>
      </Card>
    );
  }

  return (
    <Card>
      <div class="fd-pasture-card__head">
        <h4>{pasture.name}</h4>
        <div class="fd-pasture-card__actions">
          <Button variant="ghost" onClick={onDetails}>
            {t("pastures.btnDetails")}
          </Button>
          <Button variant="ghost" onClick={onLivestock}>
            {t("pastures.btnLivestock")}
          </Button>
        </div>
      </div>
      <div class="fd-pasture-metrics">
        <div>
          <strong>{t("pastures.card.totalAnimals")}:</strong> {pasture.animalCount}
        </div>
        <div>
          <strong>{t("pastures.card.avgHealth")}:</strong> {formatPastureHealthPercent(pasture)}
        </div>
        <div>
          <strong>{t("pastures.card.males")}:</strong> {pasture.maleCount || 0}
        </div>
        <div>
          <strong>{t("pastures.card.females")}:</strong> {pasture.femaleCount || 0}
        </div>
        <div>
          <strong>{t("pastures.card.productivity")}:</strong> {prod}%
        </div>
        {dairy ? (
          <div>
            <strong>{t("pastures.card.lactating")}:</strong>{" "}
            {t("pastures.card.lactatingAnimals", {
              count: pasture.milkProductionData.lactatingCows,
            })}
          </div>
        ) : null}
        {showResources ? (
          <div class="fd-pasture-resources">
            <h5>{t("pastures.card.resourcesHeading")}</h5>
            <ResourceLine pasture={pasture} resource="food" />
            <ResourceLine pasture={pasture} resource="water" />
            <ResourceLine pasture={pasture} resource="straw" />
          </div>
        ) : null}
        {dairy ? (
          <div>
            <strong>{t("pastures.card.production")}:</strong>{" "}
            {pasture.milkProductionData.hourlyProduction.toFixed(1)}L/h
          </div>
        ) : null}
      </div>

      {warnings.length > 0 ? (
        <div class="fd-pasture-warnings">
          <h5>{t("pastures.warningsHeading")}</h5>
          <div class="fd-pasture-warn-grid">
            {warnings.map((warning, index) => (
              <button
                key={index}
                type="button"
                class={`fd-pasture-warn fd-pasture-warn--${warning.severity}`}
                onClick={() => onWarning(index)}
              >
                <span>{warning.message}</span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function DetailsModal({
  pasture,
  onClose,
  onViewLivestock,
}: {
  pasture: Pasture;
  onClose: () => void;
  onViewLivestock: () => void;
}) {
  const cr = pasture.conditionReport;
  const fr = pasture.foodReport;
  return (
    <ModalShell
      title={t("pastures.details.title", { name: pasture.name })}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button onClick={onViewLivestock}>{t("pastures.details.viewLivestockTable")}</Button>
        </>
      }
    >
      <div class="fd-modal-grid">
        <Card
          title={`${t("pastures.details.conditionReport")} · ${
            cr.hasRealData
              ? t("pastures.details.badgeLiveData")
              : t("pastures.details.badgeEstimated")
          }`}
        >
          <table class="fd-kv-table">
            <tbody>
              <tr>
                <td>{t("pastures.details.totalAnimals")}</td>
                <td>{pasture.animalCount}</td>
              </tr>
              <tr>
                <td>{t("pastures.details.males")}</td>
                <td>{pasture.maleCount || 0}</td>
              </tr>
              <tr>
                <td>{t("pastures.details.females")}</td>
                <td>{pasture.femaleCount || 0}</td>
              </tr>
              <tr>
                <td>{t("pastures.details.productivity")}</td>
                <td>{Math.round(Number(cr?.productivity) || 0)}%</td>
              </tr>
              <tr>
                <td>{t("pastures.details.avgHealth")}</td>
                <td>{formatPastureHealthPercent(pasture)}</td>
              </tr>
              {(fr?.SLURRY ?? 0) > 0 ? (
                <tr>
                  <td>{t("pastures.details.slurryStorage")}</td>
                  <td>{parseFloat(String(fr.SLURRY)).toFixed(0)}L</td>
                </tr>
              ) : (fr?.LIQUIDMANURE ?? 0) > 0 ? (
                <tr>
                  <td>{t("pastures.details.liquidManureStorage")}</td>
                  <td>{parseFloat(String(fr.LIQUIDMANURE)).toFixed(0)}L</td>
                </tr>
              ) : null}
              {cr.eggs > 0 ? (
                <tr>
                  <td>{t("pastures.details.eggProduction")}</td>
                  <td>
                    {cr.eggs}/{t("pastures.details.perDay")}
                  </td>
                </tr>
              ) : null}
              {cr.wool > 0 ? (
                <tr>
                  <td>{t("pastures.details.woolProduction")}</td>
                  <td>
                    {cr.wool}/{t("pastures.details.perDay")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>

        <Card
          title={`${t("pastures.details.storageAndProduction")} · ${
            fr.hasRealData
              ? t("pastures.details.badgeLiveData")
              : t("pastures.details.badgeNotMonitored")
          }`}
        >
          <table class="fd-kv-table">
            <tbody>
              <tr>
                <td>
                  <strong>{t("pastures.details.feedStorage")}</strong>
                </td>
                <td />
              </tr>
              <tr>
                <td>{t("pastures.details.totalCapacity")}</td>
                <td>{fr.totalCapacity}L</td>
              </tr>
              <tr>
                <td>{t("pastures.details.availableFood")}</td>
                <td>
                  {parseFloat(String(fr.availableFood || fr.totalMixedRation || 0)).toFixed(0)}L
                  <DurationHint foodReport={fr} resource="food" />
                </td>
              </tr>
              {fr.hay > 0 ? (
                <tr>
                  <td>{t("pastures.details.hay")}</td>
                  <td>{parseFloat(String(fr.hay)).toFixed(0)}L</td>
                </tr>
              ) : null}
              {fr.silage > 0 ? (
                <tr>
                  <td>{t("pastures.details.silage")}</td>
                  <td>{parseFloat(String(fr.silage)).toFixed(0)}L</td>
                </tr>
              ) : null}
              {fr.grass > 0 ? (
                <tr>
                  <td>{t("pastures.details.grass")}</td>
                  <td>{parseFloat(String(fr.grass)).toFixed(0)}L</td>
                </tr>
              ) : null}
              {(fr.straw ?? 0) > 0 ? (
                <tr>
                  <td>{t("pastures.details.straw")}</td>
                  <td>
                    {parseFloat(String(fr.straw)).toFixed(0)}L
                    <DurationHint foodReport={fr} resource="straw" />
                  </td>
                </tr>
              ) : null}
              {(fr.water ?? 0) > 0 ? (
                <tr>
                  <td>{t("pastures.details.water")}</td>
                  <td>
                    {parseFloat(String(fr.water)).toFixed(0)}L
                    <DurationHint foodReport={fr} resource="water" />
                  </td>
                </tr>
              ) : null}
              {(fr.MANURE ?? 0) > 0 ||
              (fr.SLURRY ?? 0) > 0 ||
              (fr.LIQUIDMANURE ?? 0) > 0 ||
              (fr.meadow ?? 0) > 0 ? (
                <tr>
                  <td>
                    <strong>{t("pastures.details.productionStorage")}</strong>
                  </td>
                  <td />
                </tr>
              ) : null}
              {(fr.MANURE ?? 0) > 0 ? (
                <tr>
                  <td>{t("pastures.details.manure")}</td>
                  <td>{parseFloat(String(fr.MANURE)).toFixed(0)}L</td>
                </tr>
              ) : null}
              {(fr.SLURRY ?? 0) > 0 ? (
                <tr>
                  <td>{t("pastures.details.slurry")}</td>
                  <td>{parseFloat(String(fr.SLURRY)).toFixed(0)}L</td>
                </tr>
              ) : null}
              {(fr.LIQUIDMANURE ?? 0) > 0 ? (
                <tr>
                  <td>{t("pastures.details.liquidManure")}</td>
                  <td>{parseFloat(String(fr.LIQUIDMANURE)).toFixed(0)}L</td>
                </tr>
              ) : null}
              {(fr.meadow ?? 0) > 0 ? (
                <tr>
                  <td>{t("pastures.details.meadow")}</td>
                  <td>{parseFloat(String(fr.meadow)).toFixed(0)}L</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title={t("pastures.details.livestockSummary")}>
        <p>
          <strong>{t("pastures.details.totalAnimals")}:</strong> {pasture.animalCount}
        </p>
        <p>
          <strong>{t("pastures.details.averageHealth")}:</strong> {formatPastureHealthPercent(pasture)}
        </p>
      </Card>

      {!cr.hasRealData || !fr.hasRealData ? (
        <div class="fd-alert fd-alert--info">
          <strong>{t("pastures.details.prodDataUnavailable")}</strong>
          <p>{t("pastures.details.prodDataUnavailableBody")}</p>
          <ul>
            <li>{t("pastures.details.prodReasonRL")}</li>
            <li>{t("pastures.details.prodReasonNoMonitoring")}</li>
            <li>{t("pastures.details.prodReasonNew")}</li>
          </ul>
          <p class="fd-muted-sm">{t("pastures.details.prodEstimatesNote")}</p>
        </div>
      ) : null}
    </ModalShell>
  );
}

function FarmWideLivestockModal({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <ModalShell title={title} onClose={onClose}>
      <div class="fd-pastures__farmwide-panel">
        <LivestockPenPanel embedded />
      </div>
    </ModalShell>
  );
}

function WarningModal({
  pasture,
  warning,
  onClose,
}: {
  pasture: Pasture;
  warning: PastureWarning;
  onClose: () => void;
}) {
  const alertTone =
    warning.severity === "danger"
      ? "danger"
      : warning.severity === "warning"
        ? "warning"
        : "info";
  return (
    <ModalShell
      title={`${getWarningTypeTitle(warning.type)} — ${pasture.name}`}
      onClose={onClose}
    >
      <div class={`fd-alert fd-alert--${alertTone}`}>
        <strong>{warning.message}</strong>
      </div>
      {warning.affectedAnimals && warning.affectedAnimals.length > 0 ? (
        <div class="fd-livestock-table-wrap">
          <table class="fd-livestock-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t("pastures.tableName")}</th>
                <th>{t("pastures.tableType")}</th>
                <th>{t("pastures.tableHealth")}</th>
                <th>{t("pastures.tableAge")}</th>
                <th>{t("pastures.tableStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {warning.affectedAnimals.map((animal) => {
                const displayName =
                  animal.name && String(animal.name).trim() !== ""
                    ? animal.name
                    : `#${animal.id}`;
                const statuses: string[] = [];
                if ((animal.health ?? 100) < 20) statuses.push(t("pastures.statusCritical"));
                else if ((animal.health ?? 100) < 50) statuses.push(t("pastures.statusPoor"));
                if (animal.isPregnant) statuses.push(t("pastures.statusPregnant"));
                if (animal.isLactating) statuses.push(t("pastures.statusLactating"));
                return (
                  <tr key={String(animal.id)}>
                    <td>{animal.id}</td>
                    <td>{displayName}</td>
                    <td>{animal.subType || animal.type || "Unknown"}</td>
                    <td>
                      <HealthBar health={Number(animal.health) || 0} />
                    </td>
                    <td>{fmtAgeMonthsStr(animal.age || 0)}</td>
                    <td>
                      {statuses.map((s) => (
                        <Badge key={s}>{s}</Badge>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : warning.details?.message ? (
        <p class="fd-muted-sm">{String(warning.details.message)}</p>
      ) : null}
    </ModalShell>
  );
}

function LowHealthModal({
  animals,
  onClose,
}: {
  animals: Array<PastureAnimal & { pastureName: string; health: number }>;
  onClose: () => void;
}) {
  const CAP = 200;
  const displayRows = animals.slice(0, CAP);
  return (
    <ModalShell
      title={t("pastures.lowHealthDrilldownTitle", { count: animals.length })}
      onClose={onClose}
    >
      {animals.length === 0 ? (
        <div class="fd-alert fd-alert--success">{t("pastures.lowHealthAllGood")}</div>
      ) : (
        <>
          <div class="fd-alert fd-alert--warning">
            <strong>{animals.length}</strong> {t("pastures.lowHealthNeedAttention")}
          </div>
          <div class="fd-livestock-table-wrap">
            <table class="fd-livestock-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t("pastures.tableName")}</th>
                  <th>{t("pastures.tableType")}</th>
                  <th>{t("pastures.tablePasture")}</th>
                  <th>{t("pastures.tableHealth")}</th>
                  <th>{t("pastures.tableStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((animal) => {
                  const displayName =
                    animal.name && String(animal.name).trim() !== ""
                      ? animal.name
                      : `#${animal.id}`;
                  const statuses: string[] = [];
                  if (animal.health <= 0 && (animal.__lodSynth || animal.__lodSynthEstimate)) {
                    statuses.push(tOr("common.unknown", "Unknown"));
                  } else if (animal.health < 20) {
                    statuses.push(t("pastures.statusCritical"));
                  } else {
                    statuses.push(t("pastures.statusPoor"));
                  }
                  if (animal.isPregnant) statuses.push(t("pastures.statusPregnant"));
                  if (animal.isLactating) statuses.push(t("pastures.statusLactating"));
                  return (
                    <tr key={`${animal.pastureName}-${animal.id}`}>
                      <td>{animal.id}</td>
                      <td>{displayName}</td>
                      <td>{animal.subType || animal.type || "Unknown"}</td>
                      <td>{animal.pastureName}</td>
                      <td>
                        <HealthBar health={animal.health} />
                      </td>
                      <td>
                        {statuses.map((s) => (
                          <Badge key={s} tone="warn">
                            {s}
                          </Badge>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ModalShell>
  );
}

export function PasturesSection() {
  const payload = useDashboardStore((s) => s.payload);
  const connection = useDashboardStore((s) => s.connection);
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);
  const activeServerId = useDashboardStore((s) => s.activeServerId);
  const sectionParams = useDashboardStore((s) => s.sectionParams);
  const setSectionParams = useDashboardStore((s) => s.setSectionParams);

  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(sectionParams.id || null);
  const [animalDetailHost, setAnimalDetailHost] = useState<HTMLDivElement | null>(null);
  const [penPane, setPenPane] = useState<LivestockPenPane>(() =>
    asLivestockPane(sectionParams.tab)
  );

  const { animals: hydratedAnimals } = useHydratedLivestockAnimals({
    animalsData: payload?.animals,
    activeFarmId,
    activeServerId,
  });

  const pasturesView = useMemo(() => {
    if (!payload) return [] as Pasture[];
    return parsePasturesFromPayload(payload, activeFarmId, hydratedAnimals as PastureAnimal[]);
  }, [payload, activeFarmId, hydratedAnimals]);

  const filteredPastures = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pasturesView;
    return pasturesView.filter((p) => String(p.name || "").toLowerCase().includes(q));
  }, [pasturesView, search]);

  const totalPastures = pasturesView.length;
  const totalLivestock = pasturesView.reduce((sum, p) => sum + p.animalCount, 0);
  const totalBirthWarnings = pasturesView.reduce(
    (sum, p) => sum + p.allWarnings.filter((w) => w.type === "birth").length,
    0
  );
  const avgHealth =
    totalLivestock > 0
      ? (() => {
          const known = pasturesView.filter((p) => p.avgHealthKnown !== false && p.animalCount > 0);
          const heads = known.reduce((sum, p) => sum + p.animalCount, 0);
          if (heads <= 0) return "—";
          return String(
            Math.round(known.reduce((sum, p) => sum + p.avgHealth * p.animalCount, 0) / heads)
          );
        })()
      : "—";
  const lowHealthAnimals = getLowHealthAnimalsForPastures(pasturesView);
  const multiFarm = isMultiFarmEnabled(payload?.farmInfo);

  const waitingForData = !payload || (connection === "connecting" && pasturesView.length === 0);
  const selectedPasture = useMemo(() => {
    if (!filteredPastures.length) return null;
    if (selectedId) {
      return filteredPastures.find((p) => String(p.id) === selectedId) || filteredPastures[0];
    }
    return filteredPastures[0];
  }, [filteredPastures, selectedId]);

  useEffect(() => {
    if (sectionParams.id) setSelectedId(String(sectionParams.id));
    if (sectionParams.tab) setPenPane(asLivestockPane(sectionParams.tab));
  }, [sectionParams.id, sectionParams.tab]);

  useEffect(() => {
    if (!filteredPastures.length) {
      setSelectedId(null);
      return;
    }
    const stillValid =
      selectedId != null && filteredPastures.some((p) => String(p.id) === selectedId);
    if (!stillValid) {
      setSelectedId(String(filteredPastures[0].id));
    }
  }, [filteredPastures]);

  const selectPasture = (id: string) => {
    setSelectedId(id);
    setSectionParams({
      ...sectionParams,
      id,
      tab: penPane === "animals" ? undefined : penPane,
    });
  };

  const focusAnimalsTab = (pastureId?: string | number) => {
    const id = pastureId != null ? String(pastureId) : selectedId || sectionParams.id;
    if (id) setSelectedId(id);
    setPenPane("animals");
    setSectionParams({
      ...sectionParams,
      id: id || undefined,
      tab: undefined,
    });
  };

  const onPenPaneChange = (pane: LivestockPenPane) => {
    setPenPane(pane);
    setSectionParams({
      ...sectionParams,
      id: selectedId || sectionParams.id,
      tab: pane === "animals" ? undefined : pane,
    });
  };

  return (
    <div class="fd-pastures">
      <header class="fd-section-header">
        <h2>{t("pastures.title")}</h2>
        <p class="fd-lead">{t("pastures.subtitle")}</p>
      </header>

      <div class="fd-pasture-summary">
        <Card class="fd-pasture-stat">
          <p class="fd-pasture-stat__label">{t("pastures.totalPastures")}</p>
          <p class="fd-pasture-stat__value">{totalPastures}</p>
        </Card>
        <Card class="fd-pasture-stat">
          <p class="fd-pasture-stat__label">{t("pastures.activeLivestock")}</p>
          <p class="fd-pasture-stat__value">{totalLivestock}</p>
        </Card>
        <Card class="fd-pasture-stat">
          <p class="fd-pasture-stat__label">{t("pastures.birthWarnings")}</p>
          <p class="fd-pasture-stat__value">{totalBirthWarnings}</p>
        </Card>
        <Card class="fd-pasture-stat fd-pasture-stat--clickable">
          <button
            type="button"
            class="fd-pasture-stat"
            style={{
              background: "transparent",
              border: "none",
              width: "100%",
              cursor: "pointer",
              fontFamily: "inherit",
              color: "inherit",
              padding: 0,
            }}
            onClick={() => setModal({ kind: "lowHealth", animals: lowHealthAnimals })}
          >
            <p class="fd-pasture-stat__label">{t("pastures.avgHealth")}</p>
            <p class="fd-pasture-stat__value">{avgHealth === "—" ? "—" : `${avgHealth}%`}</p>
            <span class="fd-pasture-stat__hint">
              {t("pastures.summary.lowHealthCount", { count: lowHealthAnimals.length })}
            </span>
          </button>
        </Card>
      </div>

      <DairyCorePanel
        dairy={payload?.realisticFarming?.dairy}
        farmId={activeFarmId ?? 1}
      />

      <div class="fd-section-toolbar">
        <input
          type="search"
          class="fd-pastures__search"
          value={search}
          placeholder={t("pastures.searchPlaceholder")}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        />
        <Badge>{filteredPastures.length}</Badge>
      </div>

      {waitingForData ? (
        <Card>
          <div class="fd-pasture-empty">
            <h4>{t("pastures.emptyWaitingTitle")}</h4>
            <p>{t("pastures.emptyWaitingBody")}</p>
          </div>
        </Card>
      ) : pasturesView.length === 0 ? (
        <Card>
          <div class="fd-pasture-empty">
            <h4>{t("pastures.emptyStateTitle")}</h4>
            <p>{t("pastures.emptyStateHint")}</p>
          </div>
        </Card>
      ) : filteredPastures.length === 0 ? (
        <Card>
          <div class="fd-pasture-empty">
            <h4>{t("pastures.emptySearchTitle")}</h4>
            <p>{t("pastures.emptySearchBody")}</p>
          </div>
        </Card>
      ) : (
        <div class="fd-pastures__layout">
          <div class="fd-pastures__rail">
            <Card class="fd-pastures__list-card">
            <div class="fd-pasture-overview__head">
              <h3>{t("pastures.masterListHeading")}</h3>
              <Button variant="ghost" onClick={() => setModal({ kind: "farmWide" })}>
                {t("pastures.viewAllLivestock")}
              </Button>
            </div>
            <div class="fd-pastures__list">
              {filteredPastures.map((pasture) => {
                const id = String(pasture.id);
                const warnCount = (pasture.allWarnings || []).length;
                const active = selectedPasture ? String(selectedPasture.id) === id : false;
                return (
                  <button
                    key={id}
                    type="button"
                    class={`fd-pastures__list-item ${active ? "is-active" : ""}`}
                    onClick={() => selectPasture(id)}
                  >
                    <span>
                      <strong>{pasture.name}</strong>
                      <span class="fd-muted-sm">
                        {pasture.animalCount} {t("pastures.card.totalAnimals").toLowerCase()}
                      </span>
                    </span>
                    {warnCount > 0 ? <Badge tone="warn">{warnCount}</Badge> : null}
                  </button>
                );
              })}
            </div>
          </Card>
            <div ref={setAnimalDetailHost} class="fd-pastures__animal-slot" />
          </div>

          {selectedPasture ? (
            <div class="fd-pastures__detail">
              <PastureCard
                pasture={selectedPasture}
                showResources
                onDetails={() => setModal({ kind: "details", pasture: selectedPasture })}
                onLivestock={() => focusAnimalsTab(selectedPasture.id)}
                onWarning={(index) => {
                  const warning = selectedPasture.allWarnings[index];
                  if (warning) setModal({ kind: "warning", pasture: selectedPasture, warning });
                }}
              />
              <div class="fd-pastures__detail-panel">
                <LivestockPenPanel
                  key={String(selectedPasture.id)}
                  husbandryId={selectedPasture.id}
                  embedded
                  pane={penPane}
                  onPaneChange={onPenPaneChange}
                  detailHost={animalDetailHost}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}

      {modal.kind === "details" ? (
        <DetailsModal
          pasture={modal.pasture}
          onClose={() => setModal({ kind: "none" })}
          onViewLivestock={() => {
            const id = modal.pasture.id;
            setModal({ kind: "none" });
            focusAnimalsTab(id);
          }}
        />
      ) : null}
      {modal.kind === "farmWide" ? (
        <FarmWideLivestockModal
          title={
            multiFarm ? t("pastures.allLivestockThisFarm") : t("pastures.allLivestock")
          }
          onClose={() => setModal({ kind: "none" })}
        />
      ) : null}
      {modal.kind === "warning" ? (
        <WarningModal
          pasture={modal.pasture}
          warning={modal.warning}
          onClose={() => setModal({ kind: "none" })}
        />
      ) : null}
      {modal.kind === "lowHealth" ? (
        <LowHealthModal
          animals={modal.animals}
          onClose={() => setModal({ kind: "none" })}
        />
      ) : null}
    </div>
  );
}

