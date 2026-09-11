import { useEffect, useMemo, useState } from "preact/hooks";
import { t, tOr } from "@/i18n/i18n";
import { Badge, Button } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import { WeatherModal } from "@/components/WeatherModal";
import { formatGameTimeDisplay } from "@/lib/game-time";
import {
  asWeatherSnapshot,
  engineWeatherChip,
  formatWeatherTemp,
  weatherConditionLabelKey,
} from "@/lib/weather";
import {
  computeFinancialSummary,
  formatCurrency,
  resolveBaleInventoryForFarm,
  splitVehiclesAndConsumables,
  sumBaleBucket,
  sumBalesOnFarmFields,
} from "@/lib/economy";
import {
  entityOwnerFarmId,
  getPlayerFarmRecords,
  isMultiFarmEnabled,
} from "@/lib/farm-scope";
import { switchActiveFarm } from "@/services/ws-client";
import { computeFieldStats } from "@/sections/fields/field-helpers";
import { clusterFieldsForDisplay, type FieldRecord } from "@/lib/rules-engine";
import { classifyFleetEntities, getDisplayFleet, summarizeFleetCards } from "@/lib/vehicles";
import { getOwnedChainsForFarm, type ProductionPayload } from "@/lib/productions";
import { startModStoreImageExport } from "@/lib/mod-export-progress";
import { getFarmDashApi } from "@/services/electron-bridge";
import { isFarmDashLocalConfigHost } from "@/platform/viewer-mode";
import { showToast } from "@/platform/ChangesModal";
import { parsePasturesFromPayload } from "@/lib/pastures-parsers";
import {
  countLivestockHeads,
  normalizeLivestockAnimals,
} from "@/lib/livestock-normalize";
import { detectModPresence } from "@/app/section-meta";
import { summarizeAdsFleet } from "@/lib/vehicleAds";
import {
  getBaleMoistureForFarm,
  type BaleMoistureFarmRow,
} from "@/lib/moisture";
import { getRedTapeForActiveFarm, type RedTapePayload } from "@/lib/redTape";
import {
  formatLiters,
  getStockForActiveFarm,
} from "@/lib/storage";
import type { StockPayload } from "@/lib/fillTypeResolve";
import {
  getNotificationHistory,
  getTimeAgo,
  subscribeNotifications,
  type NotificationItem,
} from "@/platform/notifications";
import type { DashboardPayload, SectionId, SectionParams } from "@/types/dashboard";
import {
  OverviewFarmCardMinis,
  OverviewMiniBoards,
} from "@/sections/overview/OverviewMiniBoards";
import {
  getNpcFavorForFarm,
  getProStaffForFarm,
  getWorldEvents,
  npcFavorHighlights,
} from "@/lib/realisticFarming/life";
import {
  detectedPresenceMods,
  formatTimeGuardBadge,
  getTimeGuard,
  getWeatherGuard,
} from "@/lib/realisticFarming/cores";
import { fertilizerDepotOrders } from "@/lib/realisticFarming/depot";
import "./overview.css";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

type OverviewAlert = {
  key: string;
  label: string;
  section: SectionId;
  params?: SectionParams;
};

type FarmCardStats = {
  id: number;
  name: string;
  money: number;
  loan: number;
  playersOnline: number;
  fieldsOwned: number;
  needsWork: number;
  harvestReady: number;
  livestockHeads: number;
  fleetCount: number;
  motorizedCount: number;
  stockLiters: number;
  productionOwned: number;
  productionIssues: number;
  pastureWarnings: number;
  adsRepair: number;
  fieldBales: number;
  yardBales: number;
};

function farmPlayersOnline(farm: Record<string, unknown>): number {
  const players = farm.players;
  if (Array.isArray(players)) return players.length;
  if (players && typeof players === "object") return Object.keys(players).length;
  return 0;
}

function farmFieldStats(fields: FieldRecord[] | undefined, farmId: number) {
  const scoped = (Array.isArray(fields) ? fields : []).filter((f) => {
    const oid = entityOwnerFarmId(f);
    return oid <= 0 || oid === farmId;
  });
  return computeFieldStats(
    clusterFieldsForDisplay(scoped, { autoMerge: false, manualGroups: [] }) as FieldRecord[],
  );
}

function farmLivestockHeads(animals: unknown, farmId: number): number {
  const { animals: rows } = normalizeLivestockAnimals(animals, farmId);
  return countLivestockHeads(rows);
}

function farmPastureWarnings(
  payload: DashboardPayload | null | undefined,
  farmId: number
): number {
  if (!payload) return 0;
  return parsePasturesFromPayload(payload, farmId).reduce(
    (n, p) => n + (Array.isArray(p.allWarnings) ? p.allWarnings.length : 0),
    0
  );
}

function farmProductionIssues(
  production: ProductionPayload | null | undefined,
  farmInfo: unknown,
  farmId: number
): number {
  const chains = getOwnedChainsForFarm(production, farmId, farmInfo);
  return chains.filter((c) => {
    if (c.isActive === false) return true;
    const slots = Array.isArray(c.productions) ? c.productions : [];
    return slots.some((s) => s.status && /idle|empty|blocked|error/i.test(String(s.status)));
  }).length;
}

function farmMoney(farmInfo: unknown, farmId: number, fallbackMoney?: number): number {
  const list = Array.isArray(farmInfo) ? farmInfo : [];
  const row = list.find((f) => Number((f as { id?: number }).id) === farmId) as
    | { money?: number }
    | undefined;
  if (row) return Number(row.money) || 0;
  return Number(fallbackMoney) || 0;
}

function farmLoan(farmInfo: unknown, farmId: number, fallbackLoan?: number): number {
  const list = Array.isArray(farmInfo) ? farmInfo : [];
  const row = list.find((f) => Number((f as { id?: number }).id) === farmId) as
    | { loan?: number }
    | undefined;
  if (row && row.loan != null) return Number(row.loan) || 0;
  return Number(fallbackLoan) || 0;
}

function farmStockLiters(stock: StockPayload | null | undefined, farmId: number): number {
  const row = getStockForActiveFarm(stock, farmId);
  const items = Array.isArray(row?.items) ? row!.items! : [];
  return items.reduce((sum, item) => sum + (Number(item?.totalLiters) || 0), 0);
}

export function OverviewSection() {
  const payload = useDashboardStore((s) => s.payload);
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);
  const setSection = useDashboardStore((s) => s.setSection);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [notifHistory, setNotifHistory] = useState<NotificationItem[]>(() =>
    getNotificationHistory()
  );

  useEffect(() => subscribeNotifications(() => setNotifHistory(getNotificationHistory())), []);

  const farmId = Number(activeFarmId ?? 1) || 1;
  const multiFarm = isMultiFarmEnabled(payload?.farmInfo);
  const weather = asWeatherSnapshot(payload?.weather);
  const weatherChip = engineWeatherChip(weather);
  const showWeather = weatherChip.show;
  const gameTimeLabel = formatGameTimeDisplay(payload?.gameTime) ?? t("landing.gameLoading");
  const localHost = isFarmDashLocalConfigHost();
  const canImportMods = localHost && !!getFarmDashApi()?.exportModStoreImages;

  const finance = useMemo(() => {
    if (!payload) return null;
    const { equipment } = splitVehiclesAndConsumables(payload.vehicles);
    return computeFinancialSummary({
      farmInfo: Array.isArray(payload.farmInfo)
        ? (payload.farmInfo as Array<{ id?: number; money?: number; loan?: number }>)
        : null,
      money: payload.money,
      loan: Number(asRecord(payload).loan) || 0,
      finance: payload.finance as {
        buildings?: { totalValue?: number };
        animals?: { totalValue?: number };
        land?: { totalValue?: number };
      },
      vehicles: equipment,
      activeFarmId: farmId,
    });
  }, [payload, farmId]);

  const fieldStats = useMemo(
    () => farmFieldStats(payload?.fields as FieldRecord[] | undefined, farmId),
    [payload?.fields, farmId]
  );

  const livestockHeads = useMemo(
    () => farmLivestockHeads(payload?.animals, farmId),
    [payload?.animals, farmId]
  );

  const pastureWarnings = useMemo(
    () => farmPastureWarnings(payload, farmId),
    [payload, farmId]
  );

  const productionIssues = useMemo(
    () =>
      farmProductionIssues(
        payload?.production as ProductionPayload | null | undefined,
        payload?.farmInfo,
        farmId
      ),
    [payload?.production, payload?.farmInfo, farmId]
  );

  const fleetClassified = useMemo(
    () => classifyFleetEntities(payload?.vehicles, farmId),
    [payload?.vehicles, farmId]
  );
  const fleet = fleetClassified.fleet;
  const fleetSummary = useMemo(() => summarizeFleetCards(fleet), [fleet]);
  const adsSummary = useMemo(() => summarizeAdsFleet(fleet), [fleet]);
  const modPresence = useMemo(() => detectModPresence(payload, farmId), [payload, farmId]);
  const rf = payload?.realisticFarming;
  const timeGuardBadge = useMemo(
    () => formatTimeGuardBadge(getTimeGuard(rf)),
    [rf],
  );
  const weatherGuard = useMemo(() => getWeatherGuard(rf), [rf]);
  const presenceMods = useMemo(
    () => (modPresence.realisticFarming ? detectedPresenceMods(rf) : []),
    [modPresence.realisticFarming, rf],
  );

  const farmCards = useMemo((): FarmCardStats[] => {
    if (!multiFarm || !payload) return [];
    const rootLoan = Number(asRecord(payload).loan) || 0;
    return getPlayerFarmRecords(payload.farmInfo).map((farm) => {
      const id = Number(farm.id ?? farm.farmId) || 0;
      const name = String(farm.name || tOr("overview.farmFallbackName", "Farm {{id}}", { id })) || `Farm ${id}`;
      const fields = farmFieldStats(payload.fields as FieldRecord[] | undefined, id);
      const fleetRows = getDisplayFleet(payload.vehicles, id);
      const ownedChains = getOwnedChainsForFarm(
        payload.production as ProductionPayload | null | undefined,
        id,
        payload.farmInfo
      );
      const productionIssues = farmProductionIssues(
        payload.production as ProductionPayload | null | undefined,
        payload.farmInfo,
        id
      );
      const pastureWarnings = farmPastureWarnings(payload, id);
      const adsRepair = summarizeAdsFleet(fleetRows).needsRepairCount;
      const { onField, inStorage } = resolveBaleInventoryForFarm(
        payload.baleInventory as Record<string, unknown> | null | undefined,
        id
      );
      const fieldRollup = sumBalesOnFarmFields(
        { fields: payload.fields as never, allFields: asRecord(payload).allFields as never },
        id
      );
      const fieldBales = Math.max(sumBaleBucket(onField), fieldRollup.total);
      const yardBales = sumBaleBucket(inStorage);
      return {
        id,
        name,
        money: farmMoney(payload.farmInfo, id, payload.money),
        loan: farmLoan(payload.farmInfo, id, rootLoan),
        playersOnline: farmPlayersOnline(farm),
        fieldsOwned: fields.count,
        needsWork: fields.needsWork,
        harvestReady: fields.harvestReady,
        livestockHeads: farmLivestockHeads(payload.animals, id),
        fleetCount: fleetRows.length,
        motorizedCount: fleetRows.filter((v) => v.isMotorized !== false).length,
        stockLiters: farmStockLiters(payload.stock as StockPayload | null | undefined, id),
        productionOwned: ownedChains.length,
        productionIssues,
        pastureWarnings,
        adsRepair,
        fieldBales,
        yardBales,
      };
    });
  }, [multiFarm, payload]);

  const storageCounts = useMemo(() => {
    const { onField, inStorage } = resolveBaleInventoryForFarm(
      payload?.baleInventory as Record<string, unknown> | null | undefined,
      farmId
    );
    const root = asRecord(payload);
    const fieldRollup = sumBalesOnFarmFields(
      { fields: payload?.fields as never, allFields: root.allFields as never },
      farmId
    );
    const inventoryOnSum = sumBaleBucket(onField);
    const fieldBales = Math.max(inventoryOnSum, fieldRollup.total);
    const yardBales = sumBaleBucket(inStorage);
    return { fieldBales, yardBales, palletTotal: fleetClassified.storage.length };
  }, [payload, farmId, fleetClassified.storage.length]);

  const alerts = useMemo((): OverviewAlert[] => {
    const items: OverviewAlert[] = [];
    if (fieldStats.needsWork > 0) {
      items.push({
        key: "fields-work",
        label: tOr("overview.alertFieldsNeedWork", "{{count}} fields need work", {
          count: fieldStats.needsWork,
        }),
        section: "fields",
        params: { filter: "needswork" },
      });
    }
    if (fieldStats.harvestReady > 0) {
      items.push({
        key: "fields-harvest",
        label: tOr("overview.alertFieldsHarvest", "{{count}} fields ready to harvest", {
          count: fieldStats.harvestReady,
        }),
        section: "fields",
        params: { filter: "harvest" },
      });
    }
    if (pastureWarnings > 0) {
      items.push({
        key: "pastures",
        label: tOr("overview.alertPastures", "{{count}} pasture warnings", {
          count: pastureWarnings,
        }),
        section: "pastures",
      });
    }
    if (productionIssues > 0) {
      items.push({
        key: "productions",
        label: tOr("overview.alertProductions", "{{count}} production issues", {
          count: productionIssues,
        }),
        section: "productions",
      });
    }
    if (fleetSummary.lowFuelCount > 0) {
      items.push({
        key: "fuel",
        label: tOr("overview.alertLowFuel", "{{count}} vehicles low on fuel", {
          count: fleetSummary.lowFuelCount,
        }),
        section: "vehicles",
        params: { filter: "low-fuel" },
      });
    }
    if (modPresence.ads && adsSummary.needsRepairCount > 0) {
      items.push({
        key: "ads",
        label: tOr("overview.alertAds", "ADS needs attention ({{count}})", {
          count: adsSummary.needsRepairCount,
        }),
        section: "ads",
      });
    }
    if (modPresence.redtape) {
      const farm = getRedTapeForActiveFarm(payload?.redTape as RedTapePayload | null, farmId);
      const policyWarnings = (farm?.policies || []).reduce(
        (sum, p) => sum + (Number(p.warnings) || 0),
        0
      );
      const eventCount = Array.isArray(farm?.events) ? farm!.events!.length : 0;
      if (policyWarnings > 0 || eventCount > 0) {
        items.push({
          key: "redtape",
          label:
            policyWarnings > 0
              ? tOr("overview.alertRedTape", "Red Tape: {{count}} policy warnings", {
                  count: policyWarnings,
                })
              : tOr("overview.alertRedTapeEvents", "Red Tape: {{count}} recent events", {
                  count: eventCount,
                }),
          section: "redtape",
        });
      }
    }
    if (modPresence.moisture) {
      const baleMoist = getBaleMoistureForFarm(
        payload?.baleInventory as { moisture?: { byFarm?: Record<string, BaleMoistureFarmRow> } },
        farmId
      );
      const rotting = Number(baleMoist?.rottingCount) || 0;
      const wet = Number(baleMoist?.gettingWetCount) || 0;
      if (rotting > 0 || wet > 0) {
        items.push({
          key: "moisture",
          label: tOr("overview.alertMoisture", "Moisture: {{rotting}} rotting · {{wet}} getting wet", {
            rotting,
            wet,
          }),
          section: "storage",
        });
      }
    }
    if (modPresence.worldevents) {
      const events = getWorldEvents(payload?.realisticFarming);
      if (events?.active) {
        items.push({
          key: "rf-worldevents",
          label: tOr("overview.alertWorldEvent", "World event: {{name}}", {
            name: events.active.name,
          }),
          section: "worldevents",
        });
      }
    }
    if (modPresence.npcfavor) {
      const favorFarm = getNpcFavorForFarm(payload?.realisticFarming, farmId);
      const activeFavorCount = favorFarm?.activeFavors?.length ?? 0;
      const highlights = npcFavorHighlights(payload?.realisticFarming, farmId, 1);
      if (activeFavorCount > 0) {
        items.push({
          key: "rf-npcfavor",
          label: tOr("overview.alertNpcFavors", "{{count}} active NPC favors", {
            count: activeFavorCount,
          }),
          section: "npcfavor",
        });
      } else if (highlights[0]) {
        items.push({
          key: "rf-npcfavor-friend",
          label: tOr("overview.alertNpcFriend", "Strong NPC favor: {{name}}", {
            name: highlights[0].name || highlights[0].npcId,
          }),
          section: "npcfavor",
        });
      }
    }
    if (modPresence.prostaff) {
      const staff = getProStaffForFarm(payload?.realisticFarming, farmId);
      if (staff && (Number(staff.level) || 0) > 0) {
        items.push({
          key: "rf-prostaff",
          label: tOr("overview.alertProStaff", "Pro Staff level {{level}}", {
            level: Number(staff.level) || 0,
          }),
          section: "prostaff",
        });
      }
    }
    if (modPresence.fertilizerdepot) {
      const orders = fertilizerDepotOrders(payload?.realisticFarming?.fertilizerDepot);
      if (orders.length > 0) {
        items.push({
          key: "rf-depot",
          label: tOr("overview.alertDepotOrders", "{{count}} fertilizer depot order(s)", {
            count: orders.length,
          }),
          section: "fertilizerdepot",
        });
      }
    }
    return items;
  }, [
    fieldStats,
    pastureWarnings,
    productionIssues,
    fleetSummary.lowFuelCount,
    modPresence,
    adsSummary.needsRepairCount,
    payload?.redTape,
    payload?.baleInventory,
    payload?.realisticFarming,
    farmId,
  ]);

  const onImportMods = async () => {
    if (importBusy) return;
    setImportBusy(true);
    try {
      await startModStoreImageExport();
    } catch (e) {
      console.error("[overview-import-mod-images]", e);
      showToast(tOr("landing.importModsFailed", "Mod image import failed."));
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div class="fd-overview">
      <header class="fd-overview__header">
        <div>
          <h1>{tOr("overview.title", "Save overview")}</h1>
          <p class="fd-muted">
            {tOr("overview.lead", "Status at a glance — jump straight to what needs attention.")}
          </p>
        </div>
        <div class="fd-overview__meta">
          <Badge tone="accent">{gameTimeLabel}</Badge>
          {timeGuardBadge ? (
            <Badge tone="default">{timeGuardBadge}</Badge>
          ) : null}
          {payload?.mapTitle ? <Badge>{String(payload.mapTitle)}</Badge> : null}
          {showWeather ? (
            <button
              type="button"
              class="fd-overview__weather"
              onClick={() => setWeatherOpen(true)}
              title={t("weather.title")}
            >
              <span>{formatWeatherTemp(weatherChip.temperature)}</span>
              <span>{t(weatherConditionLabelKey(weatherChip.condition))}</span>
            </button>
          ) : null}
          {canImportMods ? (
            <Button variant="ghost" onClick={() => void onImportMods()}>
              {importBusy ? t("landing.scanning") : t("landing.importMods")}
            </Button>
          ) : null}
        </div>
      </header>

      {presenceMods.length > 0 ? (
        <section class="fd-overview__rf-mods" aria-label={tOr("overview.modsTitle", "Active mods")}>
          <h2 class="fd-overview__rf-mods-title">{tOr("overview.modsTitle", "Active mods")}</h2>
          <div class="fd-overview__rf-mod-chips">
            {presenceMods.map((mod) => (
              <Badge key={mod.id} tone="accent">
                {mod.title}
                {mod.version ? ` ${mod.version}` : ""}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}

      {multiFarm ? (
        <section class="fd-overview__farms" aria-label={tOr("overview.farmsTitle", "Your farms")}>
          <h2>{tOr("overview.farmsTitle", "Your farms")}</h2>
          <div
            class={`fd-overview__farm-list${farmCards.length > 4 ? " fd-overview__farm-list--scroll" : ""}`}
          >
            {farmCards.map((farm) => {
              const active = farm.id === farmId;
              const showChips =
                farm.productionIssues > 0 || farm.pastureWarnings > 0 || farm.adsRepair > 0;
              return (
                <article
                  key={farm.id}
                  class={`fd-overview__farm-card${active ? " fd-overview__farm-card--active" : ""}`}
                >
                  <button
                    type="button"
                    class="fd-overview__farm-card-summary"
                    onClick={() => switchActiveFarm(farm.id)}
                  >
                    <div class="fd-overview__farm-card-line1">
                      <h3>{farm.name}</h3>
                      {active ? (
                        <Badge tone="accent">{tOr("overview.farmActive", "Active")}</Badge>
                      ) : null}
                      {farm.playersOnline > 0 ? (
                        <Badge tone="default">
                          {tOr("overview.farmPlayersOnline", "{{count}} online", {
                            count: farm.playersOnline,
                          })}
                        </Badge>
                      ) : null}
                      <strong class="fd-overview__farm-money">{formatCurrency(farm.money)}</strong>
                      {farm.loan > 0 ? (
                        <span class="fd-muted fd-overview__farm-loan">
                          {tOr("overview.farmLoan", "Loan {{amount}}", {
                            amount: formatCurrency(farm.loan),
                          })}
                        </span>
                      ) : null}
                    </div>
                    <div class="fd-overview__farm-stats" aria-label={farm.name}>
                      <div class="fd-overview__farm-stat">
                        <small>{tOr("overview.farmStatFields", "Fields")}</small>
                        <strong>{farm.fieldsOwned}</strong>
                        <span class="fd-muted">
                          {tOr("overview.farmNeedWorkStat", "{{count}} need work", {
                            count: farm.needsWork,
                          })}
                          {" · "}
                          {tOr("overview.farmHarvestStat", "{{count}} harvest", {
                            count: farm.harvestReady,
                          })}
                        </span>
                      </div>
                      <div class="fd-overview__farm-stat">
                        <small>{tOr("overview.farmStatLivestock", "Livestock")}</small>
                        <strong>{farm.livestockHeads}</strong>
                        <span class="fd-muted">
                          {tOr("overview.farmPastureChip", "{{count}} pasture", {
                            count: farm.pastureWarnings,
                          })}
                        </span>
                      </div>
                      <div class="fd-overview__farm-stat">
                        <small>{tOr("overview.farmStatFleet", "Fleet")}</small>
                        <strong>{farm.fleetCount}</strong>
                        <span class="fd-muted">
                          {tOr("overview.farmMotorizedStat", "{{count}} motorized", {
                            count: farm.motorizedCount,
                          })}
                        </span>
                      </div>
                      <div class="fd-overview__farm-stat">
                        <small>{tOr("overview.farmStatStorage", "Storage")}</small>
                        <strong>{formatLiters(farm.stockLiters)}</strong>
                        <span class="fd-muted">
                          {tOr("overview.farmBalesStat", "{{yard}} yard · {{field}} field", {
                            yard: farm.yardBales,
                            field: farm.fieldBales,
                          })}
                        </span>
                      </div>
                      <div class="fd-overview__farm-stat">
                        <small>{tOr("overview.farmStatProductions", "Productions")}</small>
                        <strong>{farm.productionOwned}</strong>
                        <span class="fd-muted">
                          {tOr("overview.farmProdChip", "{{count}} prod", {
                            count: farm.productionIssues,
                          })}
                        </span>
                      </div>
                    </div>
                    {showChips ? (
                      <div class="fd-overview__farm-card-line3">
                        {farm.productionIssues > 0 ? (
                          <span class="fd-overview__farm-chip fd-overview__farm-chip--warn">
                            {tOr("overview.farmProdChip", "{{count}} prod", {
                              count: farm.productionIssues,
                            })}
                          </span>
                        ) : null}
                        {farm.pastureWarnings > 0 ? (
                          <span class="fd-overview__farm-chip fd-overview__farm-chip--warn">
                            {tOr("overview.farmPastureChip", "{{count}} pasture", {
                              count: farm.pastureWarnings,
                            })}
                          </span>
                        ) : null}
                        {farm.adsRepair > 0 ? (
                          <span class="fd-overview__farm-chip fd-overview__farm-chip--warn">
                            {tOr("overview.farmAdsRepairChip", "{{count}} ADS repair", {
                              count: farm.adsRepair,
                            })}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </button>
                  {payload ? (
                    <OverviewFarmCardMinis
                      payload={payload}
                      farmId={farm.id}
                      activeFarmId={farmId}
                      setSection={setSection}
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <>
          <section class="fd-overview__grid">
            <button type="button" class="fd-overview__tile" onClick={() => setSection("economy")}>
              <h3>{t("nav.section.economy")}</h3>
              <div class="fd-overview__finance">
                <div>
                  <span class="fd-muted">{t("economy.currentMoney")}</span>
                  <strong>{finance ? formatCurrency(finance.money) : "—"}</strong>
                </div>
                <div>
                  <span class="fd-muted">{t("economy.outstandingLoan")}</span>
                  <strong>{finance ? formatCurrency(finance.loan) : "—"}</strong>
                </div>
                <div>
                  <span class="fd-muted">{t("economy.netWorth")}</span>
                  <strong>{finance ? formatCurrency(finance.netWorth) : "—"}</strong>
                </div>
              </div>
            </button>

            <button
              type="button"
              class="fd-overview__tile"
              onClick={() =>
                setSection("fields", { filter: fieldStats.needsWork > 0 ? "needswork" : "all" })
              }
            >
              <h3>{t("nav.section.fields")}</h3>
              <p class="fd-overview__stat">
                <strong>{fieldStats.count}</strong>
                <span class="fd-muted">{t("fields.totalFields")}</span>
              </p>
              <p class="fd-overview__stat-line">
                {tOr("overview.fieldsOps", "{{needsWork}} need work · {{harvest}} ready", {
                  needsWork: fieldStats.needsWork,
                  harvest: fieldStats.harvestReady,
                })}
              </p>
            </button>

            <button type="button" class="fd-overview__tile" onClick={() => setSection("pastures")}>
              <h3>{t("nav.section.pastures")}</h3>
              <p class="fd-overview__stat">
                <strong>{livestockHeads}</strong>
                <span class="fd-muted">{tOr("overview.animalsLabel", "Animals")}</span>
              </p>
              <p class="fd-overview__stat-line">
                {tOr("overview.pasturesAnimalsLine", "{{heads}} animals · {{warnings}} warnings", {
                  heads: livestockHeads,
                  warnings: pastureWarnings,
                })}
              </p>
            </button>

            <button type="button" class="fd-overview__tile" onClick={() => setSection("vehicles")}>
              <h3>{t("nav.section.vehicles")}</h3>
              <p class="fd-overview__stat">
                <strong>{fleetSummary.totalCount}</strong>
                <span class="fd-muted">{tOr("overview.farmStatFleet", "Fleet")}</span>
              </p>
              {storageCounts.palletTotal > 0 ? (
                <p class="fd-overview__stat-line">
                  {tOr("overview.fleetPalletsInStorage", "{{count}} pallets in Storage", {
                    count: storageCounts.palletTotal,
                  })}
                </p>
              ) : null}
              {fleetSummary.lowFuelCount > 0 ? (
                <p class="fd-overview__stat-line">
                  {tOr("overview.fleetLowFuel", "{{count}} low fuel", {
                    count: fleetSummary.lowFuelCount,
                  })}
                </p>
              ) : null}
            </button>

            <button type="button" class="fd-overview__tile" onClick={() => setSection("productions")}>
              <h3>{t("nav.section.productions")}</h3>
              <p class="fd-overview__stat">
                <strong>{productionIssues}</strong>
                <span class="fd-muted">{tOr("overview.issuesLabel", "Issues")}</span>
              </p>
            </button>

            <button type="button" class="fd-overview__tile" onClick={() => setSection("storage")}>
              <h3>{t("nav.section.storage")}</h3>
              <p class="fd-overview__stat-line">
                {tOr("overview.storageCounts", "{{field}} field · {{yard}} yard · {{pallets}} pallets", {
                  field: storageCounts.fieldBales,
                  yard: storageCounts.yardBales,
                  pallets: storageCounts.palletTotal,
                })}
              </p>
              <p class="fd-muted fd-overview__stat-hint">
                {tOr("overview.storageHint", "Bales & pallet stock")}
              </p>
            </button>

            <button type="button" class="fd-overview__tile" onClick={() => setSection("map")}>
              <h3>{t("nav.section.map")}</h3>
              <p class="fd-muted">{t("landing.fleetMap")}</p>
            </button>
          </section>

          <div class="fd-overview__activity-row">
          <section
            class="fd-overview__receipt"
            aria-label={tOr("overview.receiptTitle", "Activity")}
          >
            <div class="fd-overview__receipt-paper">
              <header class="fd-overview__receipt-head">
                <h2>{tOr("overview.receiptTitle", "Activity")}</h2>
                <span class="fd-overview__receipt-rule" aria-hidden="true" />
              </header>

              {alerts.length === 0 && notifHistory.length === 0 ? (
                <p class="fd-overview__receipt-empty">
                  {tOr("overview.receiptEmpty", "No recent activity.")}
                </p>
              ) : (
                <ul class="fd-overview__receipt-list">
                  {alerts.map((a) => (
                    <li key={`alert-${a.key}`}>
                      <button
                        type="button"
                        class="fd-overview__receipt-line fd-overview__receipt-line--alert"
                        onClick={() => setSection(a.section, a.params)}
                      >
                        <span class="fd-overview__receipt-time">*</span>
                        <span class="fd-overview__receipt-body">{a.label}</span>
                      </button>
                    </li>
                  ))}
                  {notifHistory.map((n, i) => (
                    <li key={`notif-${n.timestamp ?? ""}-${i}`}>
                      <div class="fd-overview__receipt-line">
                        <span class="fd-overview__receipt-time">
                          {n.timestamp ? getTimeAgo(n.timestamp) : "—"}
                        </span>
                        <span class="fd-overview__receipt-body">
                          <strong>{n.title}</strong>
                          {n.message ? <span>{n.message}</span> : null}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <footer class="fd-overview__receipt-foot" aria-hidden="true">
                <span class="fd-overview__receipt-rule" />
                <span>· · ·</span>
              </footer>
            </div>
          </section>

          {payload ? (
            <OverviewMiniBoards
              payload={payload}
              farmId={farmId}
              setSection={setSection}
            />
          ) : null}
          </div>
        </>
      )}

      {weatherOpen && showWeather ? (
        <WeatherModal
          weather={weather}
          weatherGuard={weatherGuard}
          onClose={() => setWeatherOpen(false)}
        />
      ) : null}
    </div>
  );
}
