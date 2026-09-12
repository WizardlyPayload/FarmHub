import { Fragment } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { t } from "@/i18n/i18n";
import { Badge, Card } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import type { DashboardPayload } from "@/types/dashboard";
import {
  aggregateConsumables,
  baleCategoryLabel,
  BALE_CATEGORY_KEYS,
  consumableContainerLabel,
  mergeBaleBucketForDisplay,
  resolveBaleInventoryForFarm,
  splitVehiclesAndConsumables,
  sumBaleBucket,
  sumBalesOnFarmFields,
  vehicleMatchesActiveFarm,
  type VehicleLike,
} from "@/lib/economy";
import {
  buildEnrichedStockForFarm,
  computeStockSummary,
  computeValue,
  displayFillTypeName,
  fillTypeHudUrl,
  formatCommodityLabel,
  formatLiters,
  formatMoney,
  formatPricePer1000,
  isStockRowExpanded,
  locationKindLabel,
  locationMoistureLabel,
  priceTrendDirection,
  resolveCommodityGlyph,
  resolveMaxPriceMonth,
  resolvePricePer1000,
  resolveStationName,
  setStockRowExpanded,
  stockEmptyReason,
  stockRowKey,
  type EnrichedStockItem,
  type StorageDashboardLike,
} from "@/lib/storage";
import {
  formatMoisturePercent,
  getBaleMoistureForFarm,
  getMoistureEnvironmentInfo,
  moistureGradeLabel,
  moistureRotLabel,
  moistureRotTone,
  type BaleMoistureFarmRow,
} from "@/lib/moisture";
import {
  summarizeStockMoisture,
  type StockMoistureSummary,
} from "@/lib/storage/stock-moisture";
import type { EconomyLike, PlaceableLike, StockPayload } from "@/lib/fillTypeResolve";
import { FertilizerDepotPanel } from "@/sections/storage/FertilizerDepotPanel";
import "@/sections/economy/economy.css";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function formatStockGradeSummary(summary: StockMoistureSummary | null): string {
  if (!summary || summary.grades.length === 0) return "";
  if (summary.grades.length === 1) return moistureGradeLabel(summary.grades[0].grade);
  return summary.grades
    .map((row) => `${moistureGradeLabel(row.grade)} ${Math.round(row.percent)}%`)
    .join(" · ");
}

function CommodityIcon({
  item,
  catalog,
  titles,
  glyph,
  hudEpoch,
  mapId,
  mapTitle,
}: {
  item: EnrichedStockItem;
  catalog: Record<string, string> | undefined;
  titles?: Record<string, string>;
  glyph: string;
  hudEpoch?: string | number | null;
  mapId?: string;
  mapTitle?: string;
}) {
  const url = fillTypeHudUrl(item, catalog, hudEpoch, { mapId, mapTitle }, titles);
  const [failed, setFailed] = useState(!url);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setFailed(!url);
    setRetry(0);
  }, [url]);
  if (!url || failed) {
    return (
      <span class="fd-economy__commodity-glyph" aria-hidden="true">
        {glyph}
      </span>
    );
  }
  const src = retry > 0 ? `${url}${url.includes("?") ? "&" : "?"}r=${retry}` : url;
  return (
    <img
      key={src}
      class="fd-economy__commodity-icon"
      src={src}
      alt=""
      onError={() => {
        if (retry < 5) {
          window.setTimeout(() => setRetry((n) => n + 1), 350 * (retry + 1));
          return;
        }
        setFailed(true);
      }}
    />
  );
}

function StorageTab({
  payload,
  farmId,
  consumables,
}: {
  payload: DashboardPayload;
  farmId: number;
  consumables: VehicleLike[];
}) {
  const root = asRecord(payload);
  const stockDash: StorageDashboardLike = {
    activeFarmId: farmId,
    stock: payload.stock as StockPayload | null,
    economy: payload.economy as EconomyLike | null,
    placeables: (Array.isArray(root.placeables) ? root.placeables : []) as PlaceableLike[],
    fillTypeCatalog: root.fillTypeCatalog as Record<string, string> | undefined,
    fillTypeTitles: root.fillTypeTitles as Record<string, string> | undefined,
    cropFillTypeIndex: root.cropFillTypeIndex as Record<string, number> | undefined,
    fields: payload.fields,
    weather: payload.weather as { moisture?: { enabled?: boolean } } | null,
    baleInventory: payload.baleInventory,
  };

  const { items, catalog, titles, economy } = useMemo(
    () => buildEnrichedStockForFarm(stockDash),
    [payload, farmId]
  );

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    items.forEach((item, idx) => {
      const key = stockRowKey(item, idx);
      if (isStockRowExpanded(key)) init[key] = true;
    });
    return init;
  });

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      items.forEach((item, idx) => {
        const key = stockRowKey(item, idx);
        if (isStockRowExpanded(key)) next[key] = true;
      });
      return next;
    });
  }, [items]);

  const stockReason = stockEmptyReason(payload.stock as StockPayload | null, farmId, items.length);
  const stockSummary = useMemo(() => computeStockSummary(items), [items]);

  const env = getMoistureEnvironmentInfo(payload.weather as { moisture?: { enabled?: boolean; currentPercent?: number; environment?: string; dryingActiveCount?: number; baleRotEnabled?: boolean } });
  const baleMoist = getBaleMoistureForFarm(
    payload.baleInventory as { moisture?: { byFarm?: Record<string, BaleMoistureFarmRow> } },
    farmId
  );

  const farmConsumables = consumables.filter((v) => vehicleMatchesActiveFarm(v, farmId));
  const groups = aggregateConsumables(farmConsumables);

  const { onField, inStorage } = resolveBaleInventoryForFarm(
    payload.baleInventory as Record<string, unknown>,
    farmId
  );
  const fieldRollup = sumBalesOnFarmFields(
    { fields: payload.fields as never, allFields: root.allFields as never },
    farmId
  );
  const inventoryOnSum = sumBaleBucket(onField);
  const onSum = Math.max(inventoryOnSum, fieldRollup.total);
  const onFieldDisplay = fieldRollup.total > inventoryOnSum ? fieldRollup.bucket : onField;
  const storageSum = sumBaleBucket(inStorage);

  const legacyBaleHint =
    onSum === 0 && storageSum === 0 && fieldRollup.total > 0
      ? t("economy.baleInventoryLegacyHint", {
          total: fieldRollup.total,
          fields: fieldRollup.fieldsWithBales,
        })
      : null;

  const sorted = [...items].sort((a, b) =>
    displayFillTypeName(a, catalog, economy, titles).localeCompare(
      displayFillTypeName(b, catalog, economy, titles)
    )
  );
  const moistureSummaries = useMemo(
    () => new Map(items.map((item) => [item, summarizeStockMoisture(item.locations)])),
    [items],
  );
  const showCropMoisture = [...moistureSummaries.values()].some(Boolean);
  const stockColumnCount = showCropMoisture ? 10 : 8;

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const nextOpen = !prev[key];
      setStockRowExpanded(key, nextOpen);
      return { ...prev, [key]: nextOpen };
    });
  };

  const renderBaleBreakdown = (bucket: typeof onFieldDisplay) => {
    const display = mergeBaleBucketForDisplay(bucket);
    const lines = BALE_CATEGORY_KEYS.map((key) => {
      const n = Number(display?.[key]) || 0;
      if (n <= 0) return null;
      return (
        <div class="fd-economy__bale-line" key={key}>
          <Badge>{baleCategoryLabel(key)}</Badge>
          <strong>{n}</strong>
        </div>
      );
    }).filter(Boolean);
    if (lines.length === 0) {
      return <p class="fd-economy__muted">{t("economy.baleInventoryCategoryNone")}</p>;
    }
    return <div>{lines}</div>;
  };

  return (
    <div>
      {env ? (
        <div class="fd-economy__env">
          <Badge tone="default">{t("moisture.envMoisture", { pct: env.pct })}</Badge>
          {env.environment ? <Badge>{env.environment}</Badge> : null}
          {env.drying ? <Badge tone="accent">{env.drying}</Badge> : null}
          {env.rotOff ? <Badge tone="warn">{env.rotOff}</Badge> : null}
        </div>
      ) : null}

      <Card title={t("economy.storageSectionTitle")} class="fd-storage__stock-card">
        {sorted.length > 0 ? (
          <>
            <p class="fd-economy__muted">{t("storage.subtitleCount", { count: sorted.length, farmId })}</p>
            <div class="fd-economy__stats fd-economy__stats--stock">
              <div>
                <span class="fd-economy__muted">{t("storage.totalLiters")}</span>
                <strong>{formatLiters(stockSummary.totalLiters)}</strong>
              </div>
              <div>
                <span class="fd-economy__muted">{t("storage.totalValue")}</span>
                <strong>{stockSummary.totalValue > 0 ? formatMoney(stockSummary.totalValue) : "—"}</strong>
              </div>
              {stockSummary.greatDemandCount > 0 ? (
                <div>
                  <span class="fd-economy__muted">{t("storage.greatDemand")}</span>
                  <strong>{stockSummary.greatDemandCount}</strong>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {stockReason === "disabled" ? (
          <div class="fd-economy__empty">
            <h3>{t("storage.stockDisabled")}</h3>
            <p>{t("storage.hintEmpty")}</p>
          </div>
        ) : sorted.length === 0 ? (
          <div class="fd-economy__empty">
            <h3>{t("storage.subtitleEmpty")}</h3>
            <p>{t("storage.hintEmpty")}</p>
          </div>
        ) : (
          <div class="fd-economy__table-wrap">
            <table class="fd-economy__table">
              <thead>
                <tr>
                  <th>{t("storage.colCommodity")}</th>
                  <th>{t("storage.colStock")}</th>
                  {showCropMoisture ? (
                    <>
                      <th>{t("moisture.colMoisture")}</th>
                      <th>{t("moisture.colGrade")}</th>
                    </>
                  ) : null}
                  <th class="text-end">{t("storage.colPrice")}</th>
                  <th class="text-end">{t("storage.colValue")}</th>
                  <th>{t("storage.colStations")}</th>
                  <th class="text-end">{t("storage.colMaxPrice")}</th>
                  <th class="text-end">{t("storage.colMaxValue")}</th>
                  <th class="text-center">{t("storage.colMaxMonth")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item, idx) => {
                  const key = stockRowKey(item, idx);
                  const name = displayFillTypeName(item, catalog, economy, titles);
                  const glyph = resolveCommodityGlyph(item, name);
                  const liters = Number(item.totalLiters) || 0;
                  const pricePer1000 = item._pricePer1000 ?? resolvePricePer1000(item, item._crop);
                  const value = computeValue(liters, pricePer1000);
                  const maxPrice = Number(item._maxPrice) || 0;
                  const maxValue = computeValue(liters, maxPrice);
                  const maxMonth = item._maxPriceMonth || resolveMaxPriceMonth(item._crop);
                  const station = resolveStationName(item, item._crop);
                  const trend = priceTrendDirection(item.priceTrend);
                  const open = !!expanded[key];
                  const moistureSummary = moistureSummaries.get(item) || null;
                  const gradeSummary = formatStockGradeSummary(moistureSummary);
                  return (
                    <Fragment key={key}>
                      <tr
                        class={`fd-economy__row ${open ? "is-expanded" : ""}`}
                        onClick={() => toggle(key)}
                      >
                        <td>
                          <span class="fd-economy__commodity-name">
                            <CommodityIcon
                              item={item}
                              catalog={catalog}
                              titles={titles}
                              glyph={glyph}
                              hudEpoch={payload.fillTypeHudEpoch}
                              mapId={payload.mapId || payload.serverInfo?.mapId}
                              mapTitle={
                                payload.mapTitle || payload.serverInfo?.mapName
                              }
                            />
                            {name}
                          </span>
                          {item.greatDemand ? (
                            <>
                              {" "}
                              <Badge tone="warn">{t("storage.greatDemand")}</Badge>
                            </>
                          ) : null}
                        </td>
                        <td>{formatLiters(liters)}</td>
                        {showCropMoisture ? (
                          <>
                            <td>
                              {moistureSummary?.moisturePct != null
                                ? formatMoisturePercent(moistureSummary.moisturePct)
                                : null}
                            </td>
                            <td>{gradeSummary}</td>
                          </>
                        ) : null}
                        <td class="text-end">
                          {pricePer1000 > 0 ? formatPricePer1000(pricePer1000) : "—"}{" "}
                          <span class={`fd-economy__trend--${trend}`}>
                            {trend === "up" ? "▲" : trend === "down" ? "▼" : "−"}
                          </span>
                        </td>
                        <td
                          class={`text-end ${value > 0 && (item.greatDemand || value >= 10000) ? "fd-economy__value-hi" : ""}`}
                        >
                          {value > 0 ? formatMoney(value) : "—"}
                        </td>
                        <td>
                          {station || (
                            <span class="fd-economy__muted">{t("storage.noSellingPoint")}</span>
                          )}
                        </td>
                        <td class="text-end">{maxPrice > 0 ? formatPricePer1000(maxPrice) : "—"}</td>
                        <td class="text-end">{maxValue > 0 ? formatMoney(maxValue) : "—"}</td>
                        <td class="text-center">{maxMonth || "—"}</td>
                      </tr>
                      {open ? (
                        <tr class="fd-economy__detail">
                          <td colSpan={stockColumnCount}>
                            <LocationDetails item={item} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {baleMoist ? (
        <Card title={t("moisture.baleSummaryTitle")} class="fd-economy__bale-moist">
          <div class="fd-economy__env">
            {Object.keys(baleMoist.gradeCounts || {})
              .sort()
              .map((g) => (
                <Badge key={g}>
                  {moistureGradeLabel(g)}: {(baleMoist.gradeCounts || {})[g]}
                </Badge>
              ))}
          </div>
          {(Number(baleMoist.rottingCount) || 0) > 0 || (Number(baleMoist.gettingWetCount) || 0) > 0 ? (
            <p class="fd-economy__warn">
              {t("moisture.baleRotSummary", {
                rotting: Number(baleMoist.rottingCount) || 0,
                wet: Number(baleMoist.gettingWetCount) || 0,
              })}
            </p>
          ) : null}
          {(baleMoist.worst || []).length > 0 ? (
            <div class="fd-economy__table-wrap">
              <table class="fd-economy__table">
                <thead>
                  <tr>
                    <th>{t("moisture.colFill")}</th>
                    <th>{t("moisture.colMoisture")}</th>
                    <th>{t("moisture.colGrade")}</th>
                    <th>{t("moisture.colRot")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(baleMoist.worst || []).map((row, i) => (
                    <tr key={i}>
                      <td>{row.fillType || "—"}</td>
                      <td>{formatMoisturePercent(row.moisturePct)}</td>
                      <td>{moistureGradeLabel(row.grade)}</td>
                      <td>
                        {row.rotStatus ? (
                          <Badge tone={moistureRotTone(row.rotStatus)}>{moistureRotLabel(row.rotStatus)}</Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card title={t("economy.consumablesBaleSummaryTitle")}>
        <p class="fd-economy__muted">{t("economy.consumablesBaleInventorySubtitle")}</p>
        <div class="fd-economy__bale-grid">
          <div>
            <div class="fd-economy__meta-row">
              <strong>{t("economy.balesLooseOnFields")}</strong>
              <span class="fd-economy__finance-value" style={{ fontSize: "1.2rem" }}>
                {onSum}
              </span>
            </div>
            <p class="fd-economy__muted">{t("economy.balesLooseOnFieldsHint")}</p>
            {renderBaleBreakdown(onFieldDisplay)}
          </div>
          <div>
            <div class="fd-economy__meta-row">
              <strong>{t("economy.balesInStorage")}</strong>
              <span class="fd-economy__finance-value" style={{ fontSize: "1.2rem" }}>
                {storageSum}
              </span>
            </div>
            <p class="fd-economy__muted">{t("economy.balesInStorageHint")}</p>
            {renderBaleBreakdown(inStorage)}
          </div>
        </div>
        {onSum === 0 && storageSum === 0 ? (
          <p class="fd-economy__muted">{t("economy.baleInventoryEmptyAll")}</p>
        ) : null}
        {legacyBaleHint ? <p class="fd-economy__muted">{legacyBaleHint}</p> : null}
      </Card>

      <h3 class="fd-economy__market-cat">{t("economy.palletsSectionTitle")}</h3>
      <p class="fd-economy__muted">{t("economy.consumablesHelp")}</p>
      {groups.length === 0 ? (
        <div class="fd-economy__empty">
          <h3>{t("economy.consumablesEmpty")}</h3>
          <p>{t("economy.consumablesHelp")}</p>
        </div>
      ) : (
        <div class="fd-economy__grid">
          {groups.map((g) => (
            <Card
              key={`${g.fillType}-${g.containerKind}`}
              title={formatCommodityLabel(g.fillType)}
            >
              <p class="fd-economy__muted">{consumableContainerLabel(g.containerKind)}</p>
              {g.full > 0 ? (
                <div class="fd-economy__meta-row">
                  <Badge tone="accent">{t("economy.consumablesFullCount", { count: g.full })}</Badge>
                  <span class="fd-economy__muted">{t("economy.consumablesFullLabel")}</span>
                </div>
              ) : null}
              {g.partials.map((p, i) => (
                <div class="fd-economy__muted" key={i}>
                  {t("economy.consumablesPartialLine", {
                    pct: p.pct,
                    liters: Math.round(p.level),
                    capacity: Math.round(p.capacity),
                  })}
                </div>
              ))}
              {g.full <= 0 && g.partials.length === 0 ? (
                <span class="fd-economy__muted">{t("economy.consumablesNoFill")}</span>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function LocationDetails({ item }: { item: EnrichedStockItem }) {
  const locs = item.locations || [];
  if (locs.length === 0) {
    return <p class="fd-economy__muted">{t("storage.noLocations")}</p>;
  }
  return (
    <table class="fd-economy__table">
      <thead>
        <tr>
          <th>{t("storage.colLocation")}</th>
          <th>{t("storage.colKind")}</th>
          <th class="text-end">{t("storage.colLiters")}</th>
          <th>{t("storage.colMoisture")}</th>
        </tr>
      </thead>
      <tbody>
        {locs.map((loc, i) => (
          <tr key={i}>
            <td>{loc.name || "—"}</td>
            <td>{locationKindLabel(loc)}</td>
            <td class="text-end">{formatLiters(loc.liters)}</td>
            <td>{locationMoistureLabel(loc)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


export function StorageSection() {
  const payload = useDashboardStore((s) => s.payload);
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);
  if (!payload || payload.error) {
    return (
      <div class="fd-economy">
        <header class="fd-section-header">
          <h2>{t("nav.section.storage")}</h2>
          <p class="fd-muted-sm">{t("storage.hintEmpty")}</p>
        </header>
      </div>
    );
  }
  const farmId = activeFarmId ?? 1;
  const { consumables } = splitVehiclesAndConsumables(payload.vehicles);
  return (
    <div class="fd-economy">
      <header class="fd-section-header">
        <h2>{t("nav.section.storage")}</h2>
      </header>
      <FertilizerDepotPanel fertilizerDepot={payload.realisticFarming?.fertilizerDepot} />
      <StorageTab payload={payload} farmId={farmId} consumables={consumables} />
    </div>
  );
}

export { StorageTab };
