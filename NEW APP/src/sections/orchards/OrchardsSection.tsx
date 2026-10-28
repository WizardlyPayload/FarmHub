import { useMemo } from "preact/hooks";
import { tOr } from "@/i18n/i18n";
import { useDashboardStore } from "@/store/dashboard-store";
import type { DashboardPayload } from "@/types/dashboard";
import { formatFillQuantity } from "@/lib/fill-units";
import { useFillPhysics, useFillUnitMode, useUnitDisplay } from "@/lib/fill-unit-mode";
import { formatProfileMoney, saveProfileFromUnitDisplay } from "@/lib/profile-display";
import "./orchards.css";

type Orchard = NonNullable<NonNullable<DashboardPayload["orchards"]>["rows"]>[number];

const CROP_KEYS: Record<string, string> = {
  GRAPE: "orchards.grapes",
  OLIVE: "orchards.olives",
  COFFEECHERRIES: "orchards.coffee",
  BANANA: "orchards.bananas",
};

const CROP_NAMES: Record<string, string> = {
  GRAPE: "Grapes", OLIVE: "Olives", COFFEECHERRIES: "Coffee cherries", BANANA: "Bananas",
};

function cropName(code: string): string {
  return CROP_KEYS[code] ? tOr(CROP_KEYS[code], CROP_NAMES[code]) : code.replace(/_/g, " ");
}

function numberOrDash(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString() : "—";
}

function OrchardCard({ row, farmId }: { row: Orchard; farmId: number }) {
  const partlyOwned = row.landOwnershipComplete === true
    && Number(row.farmId) === 0
    && row.landOwnerFarmIds?.includes(farmId);
  return (
    <article class="fd-orchard-card">
      <header>
        <h3>{cropName(row.fruitType)}</h3>
        <span>{partlyOwned ? tOr("orchards.partlyOwned", "Partly on your farm")
          : Number(row.farmId) === farmId ? tOr("orchards.farmOwned", "Your farm")
          : tOr("orchards.mapOwned", "Map orchard")}</span>
      </header>
      <dl>
        <dt>{tOr("orchards.rows", "Rows")}</dt><dd>{numberOrDash(row.rows)}</dd>
        <dt>{tOr("orchards.length", "Total row length")}</dt><dd>{row.rowLengthMeters == null ? "—" : `${numberOrDash(row.rowLengthMeters)} m`}</dd>
        {row.growthMeasured ? (
          <>
            <dt>{tOr("orchards.readyRows", "Rows with harvestable crop")}</dt><dd>{numberOrDash(row.readyRows)}</dd>
            <dt>{tOr("orchards.witheredRows", "Rows with withered crop")}</dt><dd>{numberOrDash(row.witheredRows)}</dd>
          </>
        ) : null}
        {row.fruitType === "COFFEECHERRIES" ? (
          <><dt>{tOr("orchards.sickCoffeeRows", "Rows with curable sick growth")}</dt>
          <dd>{row.diseaseMeasured ? numberOrDash(row.sickRows) : row.diseaseScanning ? tOr("orchards.measuringDisease", "Measuring…") : tOr("common.unknown", "Unknown")}</dd></>
        ) : null}
      </dl>
      {!row.growthMeasured ? <p class="fd-orchard-note">{tOr("orchards.growthUnavailable", "Growth detail is not available for this orchard.")}</p> : null}
    </article>
  );
}

export function OrchardsSection() {
  const payload = useDashboardStore((s) => s.payload);
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);
  const fillMode = useFillUnitMode();
  const fillPhysics = useFillPhysics();
  const unitDisplay = useUnitDisplay();
  const moneyProfile = saveProfileFromUnitDisplay(unitDisplay);
  const farmId = Number(activeFarmId ?? 1) || 1;
  const orchardState = payload?.orchards;
  const { owned, map } = useMemo(() => {
    const all = Array.isArray(orchardState?.rows) ? orchardState.rows : [];
    return {
      owned: all.filter((row) => Number(row.farmId) === farmId
        || (row.landOwnershipComplete === true && row.landOwnerFarmIds?.includes(farmId))),
      map: all.filter((row) => Number(row.farmId) === 0
        && !(row.landOwnershipComplete === true && row.landOwnerFarmIds?.includes(farmId))),
    };
  }, [orchardState, farmId]);
  const dlc = payload?.beansAndAlpacas;
  const workers = dlc?.enabled ? dlc.workersByFarm?.[String(farmId)] : undefined;
  const washingCapacity = dlc?.enabled ? dlc.washingCapacityByFarm?.[String(farmId)] : undefined;
  const unknown = tOr("common.unknown", "Unknown");
  const workerNumber = (value: number | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? numberOrDash(value) : unknown;
  const workerWage = workers?.dailyWagePerWorker;
  const capacityComplete = typeof washingCapacity?.stationCount === "number"
    && Number.isFinite(washingCapacity.stationCount)
    && washingCapacity.stationCount >= 0
    && typeof washingCapacity.measuredStations === "number"
    && washingCapacity.measuredStations === washingCapacity.stationCount;
  const availableCapacity = capacityComplete && typeof washingCapacity?.availableLitres === "number"
    && Number.isFinite(washingCapacity.availableLitres) && washingCapacity.availableLitres >= 0
    ? formatFillQuantity(washingCapacity.availableLitres, "BANANA", fillMode, fillPhysics, unitDisplay) : unknown;

  return (
    <main class="fd-orchards">
      <header class="fd-orchards__head">
        <h1>{tOr("orchards.title", "Orchards")}</h1>
        <p>{tOr("orchards.intro", "Grapes and olives from the base game, with coffee and banana orchards when the expansion is active.")}</p>
      </header>
      {orchardState && "truncated" in orchardState && orchardState.truncated === true ? (
        <p class="fd-orchards__message fd-orchards__notice" role="status">
          {tOr("orchards.truncated", "Only the first 128 orchards are listed. This snapshot is incomplete; more orchards may exist on the map.")}
        </p>
      ) : null}
      {orchardState?.available === false && !dlc?.enabled ? (
        <p class="fd-orchards__message">{tOr("orchards.noLiveData", "Live orchard data is unavailable. Load the save with the current Farm Dashboard mod to see its orchards.")}</p>
      ) : null}
      <section aria-label={tOr("orchards.yourOrchards", "Your orchards")}>
        <h2>{tOr("orchards.yourOrchards", "Your orchards")}</h2>
        {owned.length ? <div class="fd-orchards__grid">{owned.map((row) => <OrchardCard key={row.id} row={row} farmId={farmId} />)}</div> : (
          <p class="fd-orchards__message">{tOr("orchards.noneOwned", "No orchards are owned by the selected farm.")}</p>
        )}
      </section>
      {map.length ? (
        <section aria-label={tOr("orchards.mapOrchards", "Map orchards")}>
          <h2>{tOr("orchards.mapOrchards", "Map orchards")}</h2>
          <p class="fd-orchard-note">{tOr("orchards.mapNote", "These orchards exist on the map but are not owned by your farm. Their rows are shown for reference.")}</p>
          <div class="fd-orchards__grid">{map.map((row) => <OrchardCard key={row.id} row={row} farmId={farmId} />)}</div>
        </section>
      ) : null}
      {dlc?.enabled ? (
        <section class="fd-orchards__dlc" aria-label={tOr("orchards.expansion", "Expansion orchard systems")}>
          <h2>{tOr("orchards.expansion", "Expansion orchard systems")}</h2>
          <div class="fd-orchards__grid">
            <article class="fd-orchard-card">
              <h3>{tOr("orchards.bananaWorkers", "Banana workers")}</h3>
              {workers || washingCapacity ? (
                <div class="fd-orchard-worker-detail">
                  {workers ? (
                    <>
                      <div class="fd-orchard-worker-detail__group">
                        <h4>{tOr("orchards.workerStaffing", "Staffing and cost")}</h4>
                        <dl>
                          <dt>{tOr("orchards.hired", "Hired")}</dt><dd>{workerNumber(workers.count)}</dd>
                          <dt>{tOr("orchards.workerLimit", "Worker limit")}</dt><dd>{workerNumber(workers.maxCount)}</dd>
                          <dt>{tOr("orchards.dailyWagePerWorker", "Daily wage per worker")}</dt>
                          <dd>{typeof workerWage === "number" && Number.isFinite(workerWage) ? formatProfileMoney(workerWage, moneyProfile) : unknown}</dd>
                        </dl>
                      </div>
                      <div class="fd-orchard-worker-detail__group">
                        <h4>{tOr("orchards.workerActivity", "Today's actions")}</h4>
                        <dl>
                          <dt>{tOr("orchards.estimatedDailyActions", "Estimated actions needed today")}</dt><dd>{workerNumber(workers.estimatedDailyActions)}</dd>
                          <dt>{tOr("orchards.actionsUsedToday", "Actions used today")}</dt><dd>{workerNumber(workers.actionsUsedToday)}</dd>
                          <dt>{tOr("orchards.actionsLeft", "Actions left today")}</dt><dd>{workerNumber(workers.actionsRemainingToday)}</dd>
                        </dl>
                      </div>
                    </>
                  ) : <p class="fd-orchard-note">{tOr("orchards.workerUnavailable", "Worker data is not available for the selected farm.")}</p>}
                  <div class="fd-orchard-worker-detail__group">
                    <h4>{tOr("orchards.workerCoverage", "Plants and facilities")}</h4>
                    <dl>
                      <dt>{tOr("orchards.washingStations", "Washing stations")}</dt><dd>{workerNumber(workers?.washingStations)}</dd>
                      <dt>{tOr("orchards.availableBananaCapacity", "Available banana capacity after rail reservations")}</dt><dd>{availableCapacity}</dd>
                      <dt>{tOr("orchards.plants", "Banana plants")}</dt><dd>{workerNumber(workers?.bananaPlants)}</dd>
                      <dt>{tOr("orchards.plantsInReach", "Plants in worker reach")}</dt><dd>{workerNumber(workers?.plantsInWorkerReach)}</dd>
                    </dl>
                  </div>
                </div>
              ) : <p class="fd-orchard-note">{tOr("orchards.workerUnavailable", "Worker data is not available for the selected farm.")}</p>}
            </article>
            <article class="fd-orchard-card">
              <h3>{tOr("orchards.settings", "Orchard settings")}</h3>
              <dl>
                <dt>{tOr("orchards.disease", "Disease")}</dt><dd>{dlc.orchardDiseaseEnabled == null ? "—" : dlc.orchardDiseaseEnabled ? tOr("common.on", "On") : tOr("common.off", "Off")}</dd>
                <dt>{tOr("orchards.frost", "Frost damage")}</dt><dd>{dlc.frostDamageEnabled == null ? "—" : dlc.frostDamageEnabled ? tOr("common.on", "On") : tOr("common.off", "Off")}</dd>
              </dl>
            </article>
          </div>
        </section>
      ) : null}
    </main>
  );
}
