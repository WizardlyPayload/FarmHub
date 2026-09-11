import { useEffect, useMemo, useState } from "preact/hooks";
import { t, tOr } from "@/i18n/i18n";
import { Badge, Button, Card } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import type { DashboardPayload } from "@/types/dashboard";
import {
  buildMarketCropGroups,
  calculateCondition,
  computeFinancialSummary,
  formatCropName,
  formatCurrency,
  isPurchaseTypeMatch,
  marketCategoryMeta,
  marketMatchesSearch,
  normalizeSellPoints,
  purchasesEmptyMessageKey,
  resolveVehicleBrandLabel,
  resolveVehicleDisplayName,
  sortPurchasesList,
  splitVehiclesAndConsumables,
  vehicleIconGlyph,
  vehicleMatchesActiveFarm,
  type MarketCategoryKey,
  type MarketPrices,
  type PurchaseFilter,
  type VehicleLike,
} from "@/lib/economy";
import { isRedTapeModActive, type RedTapePayload } from "@/lib/redTape";
import {
  isHirePurchasingModActive,
  type HirePurchasingPayload,
} from "@/lib/hirePurchasing";
import { isInvoicesModActive, type InvoicesPayload } from "@/lib/invoices";
import { RfEconomyPanels } from "@/sections/economy/RfEconomyPanels";
import "@/sections/economy/economy.css";

type EconomyTab = "market" | "purchases";
type PurchaseSort = "price" | "age" | "name";
type MarketView = "crop" | "location";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function FinanceSummary({ payload, farmId }: { payload: DashboardPayload; farmId: number }) {
  const { equipment } = splitVehiclesAndConsumables(payload.vehicles);
  const summary = computeFinancialSummary({
    farmInfo: Array.isArray(payload.farmInfo) ? (payload.farmInfo as Array<{ id?: number; money?: number; loan?: number }>) : null,
    money: payload.money,
    loan: Number(asRecord(payload).loan) || 0,
    finance: payload.finance as { buildings?: { totalValue?: number }; animals?: { totalValue?: number }; land?: { totalValue?: number } },
    vehicles: equipment,
    activeFarmId: farmId,
  });

  const cards = [
    { title: t("economy.currentMoney"), value: formatCurrency(summary.money), hint: t("economy.availableFunds") },
    { title: t("economy.totalPurchases"), value: formatCurrency(summary.totalPurchases), hint: t("economy.equipmentValue") },
    { title: t("economy.outstandingLoan"), value: formatCurrency(summary.loan), hint: t("economy.currentDebt") },
    { title: t("economy.netWorth"), value: formatCurrency(summary.netWorth), hint: t("economy.assetsMinusDebt") },
  ];

  return (
    <div class="fd-economy__finance">
      {cards.map((c) => (
        <Card key={c.title} class="fd-economy__finance-card" title={c.title}>
          <div class="fd-economy__finance-value">{c.value}</div>
          <div class="fd-economy__finance-hint">{c.hint}</div>
        </Card>
      ))}
    </div>
  );
}

function PurchasesTab({
  equipment,
  farmId,
}: {
  equipment: VehicleLike[];
  farmId: number;
}) {
  const [filter, setFilter] = useState<PurchaseFilter>("all");
  const [sortBy, setSortBy] = useState<PurchaseSort>("price");

  const ownedAll = useMemo(
    () => equipment.filter((v) => vehicleMatchesActiveFarm(v, farmId)),
    [equipment, farmId]
  );

  const owned = useMemo(() => {
    const filtered = ownedAll.filter((v) => isPurchaseTypeMatch(v.vehicleType, filter));
    return sortPurchasesList(filtered, sortBy);
  }, [ownedAll, filter, sortBy]);

  const emptyKey = purchasesEmptyMessageKey(filter, ownedAll.length);

  return (
    <div>
      <div class="fd-economy__toolbar">
        <div class="fd-economy__btn-group">
          {(
            [
              ["all", "economy.filterAllEquipment"],
              ["vehicles", "economy.filterVehicles"],
              ["implements", "economy.filterImplements"],
            ] as const
          ).map(([id, key]) => (
            <button
              key={id}
              type="button"
              class={`fd-economy__chip ${filter === id ? "is-active" : ""}`}
              onClick={() => setFilter(id)}
            >
              {t(key)}
            </button>
          ))}
        </div>
        <div class="fd-economy__btn-group">
          {(
            [
              ["price", "economy.sortPrice"],
              ["age", "economy.sortAge"],
              ["name", "economy.sortName"],
            ] as const
          ).map(([id, key]) => (
            <button
              key={id}
              type="button"
              class={`fd-economy__chip ${sortBy === id ? "is-active" : ""}`}
              onClick={() => setSortBy(id)}
            >
              {t(key)}
            </button>
          ))}
        </div>
      </div>

      {owned.length === 0 ? (
        <div class="fd-economy__empty">
          <h3>{t(emptyKey)}</h3>
        </div>
      ) : (
        <div class="fd-economy__grid">
          {owned.map((vehicle, i) => {
            const condition = calculateCondition(vehicle.damage || 0);
            const age = Number(vehicle.age) || 0;
            const hours =
              vehicle.operatingTime != null
                ? Math.round((Number(vehicle.operatingTime) || 0) / 3600000)
                : null;
            const glyph = vehicleIconGlyph(vehicle.vehicleType);
            return (
              <Card
                key={`${resolveVehicleDisplayName(vehicle)}-${i}`}
                title={`${glyph} ${resolveVehicleDisplayName(vehicle)}`}
              >
                <div class="fd-economy__meta-row">
                  <span class="fd-economy__meta-label">{t("economy.purchasePrice")}</span>
                  <strong>{formatCurrency(vehicle.price || 0)}</strong>
                </div>
                <div class="fd-economy__meta-row">
                  <span class="fd-economy__meta-label">{t("economy.purchaseType")}</span>
                  <span>{vehicle.typeName || vehicle.vehicleType || tOr("common.unknown", "Unknown")}</span>
                </div>
                <div class="fd-economy__meta-row">
                  <span class="fd-economy__meta-label">{t("economy.purchaseAge")}</span>
                  <span>{t("economy.purchaseAgeMonths", { months: age })}</span>
                </div>
                <div class="fd-economy__meta-row">
                  <span class="fd-economy__meta-label">{t("economy.purchaseCondition")}</span>
                  <Badge tone={condition.tone}>{condition.text}</Badge>
                </div>
                <div class="fd-economy__meta-row">
                  <span class="fd-economy__meta-label">{t("economy.purchaseBrand")}</span>
                  <Badge>{resolveVehicleBrandLabel(vehicle.brand) || "—"}</Badge>
                </div>
                {hours != null ? (
                  <div class="fd-economy__meta-row">
                    <span class="fd-economy__meta-label">{t("economy.purchaseOperatingHours")}</span>
                    <span>{t("economy.purchaseOperatingHoursVal", { hours })}</span>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MarketTab({ economy }: { economy: Record<string, unknown> | null | undefined }) {
  const [view, setView] = useState<MarketView>("crop");
  const [search, setSearch] = useState("");
  const [openSell, setOpenSell] = useState<number | null>(0);
  const [basePricesHint, setBasePricesHint] = useState(false);

  const marketPrices = (economy?.marketPrices || null) as MarketPrices | null;

  const groups = useMemo(() => buildMarketCropGroups(marketPrices || undefined), [marketPrices]);
  const sellPoints = useMemo(() => normalizeSellPoints(marketPrices || undefined), [marketPrices]);
  const term = search.trim().toLowerCase();

  const hasCrops = Object.values(groups).some((g) => g.length > 0);

  const categoryOrder: MarketCategoryKey[] = [
    "crops",
    "products",
    "greenery",
    "greenhouse",
    "yieldBoost",
    "others",
  ];

  const filteredCropCount = useMemo(() => {
    if (!term) return -1;
    let n = 0;
    for (const cat of categoryOrder) {
      n += groups[cat].filter(
        (item) =>
          item.displayName.toLowerCase().includes(term) || item.name.toLowerCase().includes(term)
      ).length;
    }
    return n;
  }, [groups, term]);

  const filteredLocationCount = useMemo(() => {
    if (!term) return -1;
    return sellPoints.filter((sp) =>
      marketMatchesSearch(
        [term],
        sp.name,
        Object.keys(sp.prices || {})
          .map((c) => formatCropName(c) || "")
          .join(" ")
      )
    ).length;
  }, [sellPoints, term]);

  if (!hasCrops) {
    return (
      <div class="fd-economy__empty">
        <h3>{t("economy.marketEmptyTitle")}</h3>
        <p>{t("economy.marketEmptyHint")}</p>
      </div>
    );
  }

  const showCropNoResults = view === "crop" && term && filteredCropCount === 0;
  const showLocationNoResults = view === "location" && term && filteredLocationCount === 0;

  return (
    <div>
      <div class="fd-economy__toolbar">
        <input
          class="fd-economy__search"
          type="search"
          value={search}
          placeholder={t("economy.marketPlaceholder")}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        />
        <div class="fd-economy__subtabs">
          <button
            type="button"
            class={`fd-economy__chip ${view === "crop" ? "is-active" : ""}`}
            onClick={() => setView("crop")}
          >
            {t("economy.marketByCrop")}
          </button>
          <button
            type="button"
            class={`fd-economy__chip ${view === "location" ? "is-active" : ""}`}
            onClick={() => setView("location")}
          >
            {t("economy.marketByLocation")}
          </button>
        </div>
      </div>

      {showCropNoResults || showLocationNoResults ? (
        <div class="fd-economy__empty">
          <h3>{t("economy.marketNoResults")}</h3>
          <p>
            {t("economy.marketNoResultsDetail", {
              term: search.trim(),
              view: t(view === "crop" ? "economy.marketNoResultsCrops" : "economy.marketNoResultsLocations"),
            })}
          </p>
        </div>
      ) : null}

      {view === "crop" && !showCropNoResults ? (
        <>
          {categoryOrder.map((cat) => {
            const items = groups[cat].filter(
              (item) =>
                !term ||
                item.displayName.toLowerCase().includes(term) ||
                item.name.toLowerCase().includes(term)
            );
            if (items.length === 0) return null;
            const meta = marketCategoryMeta(cat);
            return (
              <div key={cat}>
                <h4 class="fd-economy__market-cat">{t(meta.nameKey)}</h4>
                <div class="fd-economy__grid">
                  {items.map((item) => {
                    const locs = [...(item.data.locations || [])].sort(
                      (a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)
                    );
                    const best = locs[0];
                    const poor =
                      best && best.name === "Market Base Prices" && locs.length > 1;
                    return (
                      <Card key={item.name} title={item.displayName} class={poor ? "fd-economy__poor" : ""}>
                        {poor ? (
                          <div class="fd-economy__warn">{t("economy.poorMarket")}</div>
                        ) : null}
                        <div class="fd-economy__loc-list">
                          {locs.length === 0 ? (
                            <span class="fd-economy__muted">{t("economy.noLocations")}</span>
                          ) : (
                            locs.map((loc, idx) => (
                              <div
                                key={`${loc.name}-${idx}`}
                                class={`fd-economy__loc-row ${idx === 0 ? "is-best" : ""}`}
                              >
                                <span>
                                  {loc.name === "Market Base Prices" ? (
                                    <button
                                      type="button"
                                      class="fd-economy__link-btn"
                                      title={t("economy.marketBasePricesHint")}
                                      onClick={() => setBasePricesHint((v) => !v)}
                                    >
                                      {loc.name} ⓘ
                                    </button>
                                  ) : (
                                    loc.name || "—"
                                  )}
                                </span>
                                <span>${Number(loc.price || 0).toFixed(0)}</span>
                              </div>
                            ))
                          )}
                        </div>
                        {basePricesHint ? (
                          <p class="fd-economy__muted" style={{ marginTop: "0.5rem" }}>
                            <strong>{t("economy.marketBasePricesTitle")}:</strong>{" "}
                            {t("economy.marketBasePricesHint")}
                          </p>
                        ) : null}
                        {locs.length > 1 ? (
                          <div class="fd-economy__meta-row" style={{ marginTop: "0.5rem" }}>
                            <span class="fd-economy__meta-label">{t("economy.avgPrice")}</span>
                            <strong>${Number(item.data.avgPrice || 0).toFixed(0)}</strong>
                          </div>
                        ) : null}
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      ) : null}
      {view === "location" && !showLocationNoResults ? (
        sellPoints.length === 0 ? (
        <div class="fd-economy__empty">{t("economy.noSellPoints")}</div>
      ) : (
        sellPoints
          .filter((sp) =>
            marketMatchesSearch(
              [term],
              sp.name,
              Object.keys(sp.prices || {})
                .map((c) => formatCropName(c) || "")
                .join(" ")
            )
          )
          .map((sp, index) => {
            // prices already stripped of livestock + zero quotes in normalizeSellPoints
            const prices = Object.entries(sp.prices || {}).sort((a, b) => a[0].localeCompare(b[0]));
            const open = openSell === index;
            return (
              <div class="fd-economy__accordion" key={`${sp.name}-${index}`}>
                <button
                  type="button"
                  class="fd-economy__accordion-head"
                  onClick={() => setOpenSell(open ? null : index)}
                >
                  <span>{sp.name}</span>
                  <span>
                    <Badge>{prices.length}</Badge>
                    {sp.isSpecialEvent ? <Badge tone="warn">{t("economy.specialEvent")}</Badge> : null}
                  </span>
                </button>
                {open ? (
                  <div class="fd-economy__accordion-body">
                    <div class="fd-economy__table-wrap">
                      <table class="fd-economy__table">
                        <thead>
                          <tr>
                            <th>{t("economy.colCrop")}</th>
                            <th class="text-end">{t("economy.colPriceTon")}</th>
                            <th class="text-end">{t("economy.colMultiplier")}</th>
                            <th class="text-center">{t("economy.colStatus")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prices.map(([cropName, info]) => {
                            const label = formatCropName(cropName);
                            if (!label) return null;
                            const mult = Number(info.multiplier) || 1;
                            const cropAvg =
                              Number(marketPrices?.crops?.[cropName]?.avgPrice) || Number(info.price) || 0;
                            const price = Number(info.price) || 0;
                            const aboveAvg = price > cropAvg;
                            return (
                              <tr key={cropName}>
                                <td>{label}</td>
                                <td class="text-end">${price.toFixed(0)}</td>
                                <td class="text-end">
                                  <Badge
                                    tone={mult > 1.1 ? "accent" : mult < 0.9 ? "danger" : "default"}
                                  >
                                    {(mult * 100).toFixed(0)}%
                                  </Badge>
                                </td>
                                <td class="text-center">
                                  {info.isSpecialEvent ? (
                                    <Badge tone="warn">{t("economy.specialEvent")}</Badge>
                                  ) : aboveAvg ? (
                                    <Badge tone="accent">{t("economy.priceAboveAvg")}</Badge>
                                  ) : (
                                    <Badge tone="danger">{t("economy.priceBelowAvg")}</Badge>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
      )
      ) : null}
    </div>
  );
}


export function EconomySection() {
  const payload = useDashboardStore((s) => s.payload);
  const farmId = useDashboardStore((s) => s.activeFarmId) ?? 1;
  const sectionParams = useDashboardStore((s) => s.sectionParams);
  const setSectionParams = useDashboardStore((s) => s.setSectionParams);
  const setSection = useDashboardStore((s) => s.setSection);

  const initialTab = ((): EconomyTab => {
    const raw = sectionParams.tab;
    if (raw === "market" || raw === "purchases") return raw;
    return "market";
  })();
  const [tab, setTab] = useState<EconomyTab>(initialTab);

  useEffect(() => {
    const raw = sectionParams.tab;
    if (raw === "market" || raw === "purchases") setTab(raw);
    // Soft redirect if an older client still lands with tab=storage / tab=redtape.
    // Prefer store hash alias for storage; this covers in-section param updates.
    if (raw === "storage") {
      setSection("storage");
    }
    if (raw === "redtape") {
      setSection("redtape");
    }
    if (raw === "invoices") {
      setSection("invoices");
    }
    if (raw === "hirepurchasing") {
      setSection("hirepurchasing");
    }
  }, [sectionParams.tab, setSection]);

  if (!payload || payload.error) {
    return (
      <div class="fd-economy">
        <div class="fd-economy__empty">
          <h3>{t("economy.noData")}</h3>
          <p>{payload?.error || t("economy.marketEmptyHint")}</p>
        </div>
      </div>
    );
  }

  const { equipment } = splitVehiclesAndConsumables(payload.vehicles);
  const redTapeActive = isRedTapeModActive(payload.redTape as RedTapePayload | null);
  const hirePurchasingActive = isHirePurchasingModActive(
    payload.hirePurchasing as HirePurchasingPayload | null | undefined,
  );
  const invoicesActive = isInvoicesModActive(
    payload.invoices as InvoicesPayload | null | undefined,
  );

  const tabs: Array<{ id: EconomyTab; label: string }> = [
    { id: "market", label: t("economy.tabMarket") },
    { id: "purchases", label: t("economy.tabPurchases") },
  ];

  const selectTab = (id: EconomyTab) => {
    setTab(id);
    setSectionParams({ ...sectionParams, tab: id });
  };

  return (
    <div class="fd-economy">
      <header class="fd-economy__header">
        <h2>{t("economy.title")}</h2>
        <p>{t("economy.subtitle")}</p>
        {redTapeActive || hirePurchasingActive || invoicesActive ? (
          <div class="fd-economy__mod-links">
            {redTapeActive ? (
              <Button variant="ghost" onClick={() => setSection("redtape")}>
                {t("economy.openRedTape")}
              </Button>
            ) : null}
            {invoicesActive ? (
              <Button variant="ghost" onClick={() => setSection("invoices")}>
                {t("economy.openInvoices")}
              </Button>
            ) : null}
            {hirePurchasingActive ? (
              <Button
                variant="ghost"
                onClick={() => setSection("hirepurchasing")}
              >
                {t("economy.openHirePurchasing")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <FinanceSummary payload={payload} farmId={farmId} />

      <RfEconomyPanels rf={payload.realisticFarming} farmId={farmId} />

      <div class="fd-economy__tabs" role="tablist">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            role="tab"
            aria-selected={tab === tb.id}
            class={`fd-economy__tab ${tab === tb.id ? "is-active" : ""}`}
            onClick={() => selectTab(tb.id)}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "market" ? <MarketTab economy={payload.economy as Record<string, unknown>} /> : null}
      {tab === "purchases" ? <PurchasesTab equipment={equipment} farmId={farmId} /> : null}
    </div>
  );
}
