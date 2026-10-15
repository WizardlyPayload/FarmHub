import { Badge, Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import { fieldLeasingPageView } from "@/lib/companionMods/fieldEconomyCards";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  ModAbout,
  ModBarChart,
  ModEmpty,
  ModKeyValues,
  ModPage,
  ModStatTiles,
  ModTable,
  asList,
  formatNumber,
  formatPercent,
  num,
  useCompanionPage,
  useMoney,
  type CompanionPageProps,
  type ModChartPoint,
  type ModStatTile,
} from "@/sections/mods/shared";

type LeaseRow = {
  farmId?: number;
  farmlandId?: number;
  name?: string;
  areaHa?: number;
  currentLandPrice?: number;
  signedPrice?: number;
  periodsPaid?: number;
  monthlyCost?: number;
  canEnd?: boolean;
  periodsUntilEnd?: number;
};

type Settings = { priceMultiplierPercent?: number; minDurationPeriods?: number };
type Finance = { today?: number; recentDays?: number[] };

function hectares(value: unknown): string {
  return num(value) == null ? "—" : tOr("companionPage.fieldLeasing.hectares", "{{value}} ha", { value: formatNumber(value, 2) });
}

function periods(value: unknown): string {
  return num(value) == null ? "—" : tOr("companionPage.fieldLeasing.periods", "{{count}} periods", { count: formatNumber(value, 0) });
}

function endStatus(lease: LeaseRow) {
  if (lease.canEnd === true) return <Badge tone="accent">{tOr("companionPage.fieldLeasing.canEndNow", "Can end now")}</Badge>;
  if (lease.canEnd === false) {
    return <Badge>{tOr("companionPage.fieldLeasing.canEndIn", "In {{count}} periods", { count: formatNumber(lease.periodsUntilEnd, 0) })}</Badge>;
  }
  return "—";
}

export function Page({ entry }: CompanionPageProps) {
  const money = useMoney();
  const { page, payload } = useCompanionPage(entry.key);
  const selectedFarmId = useDashboardStore((s) => s.activeFarmId);
  const live = (payload?.companionMods as { fieldLeases?: unknown } | null | undefined)?.fieldLeases;
  const view = fieldLeasingPageView(page, live, selectedFarmId);
  const farmData = view.farmData;
  const leases = view.leases as LeaseRow[];
  const settings = (page?.settings && typeof page.settings === "object" ? page.settings : null) as Settings | null;
  const finance = (farmData?.finance && typeof farmData.finance === "object" ? farmData.finance : null) as Finance | null;
  const recent = asList<number>(finance?.recentDays);
  const leaseMessage = view.status === "needs-farm"
    ? tOr("companions.live.needsFarm", "Needs a selected farm before these numbers can be read.")
    : view.status === "failed"
      ? tOr("companions.live.readFailed", "This reading failed. It is not an empty result.")
      : view.status === "partial"
        ? tOr("companions.live.partialNoRows", "The lease reading is incomplete.")
        : view.status === "unavailable"
          ? tOr("companions.live.readUnavailable", "This mod's reading is not available in this save.")
          : view.status === "waiting"
            ? tOr("companionPage.fieldLeasing.waitingLeases", "Leases appear after the next export.")
            : tOr("companionPage.fieldLeasing.noLeases", "This farm has no leased farmland.");

  const tiles: ModStatTile[] = farmData
    ? [
        { key: "leases", label: tOr("companionPage.fieldLeasing.statLeases", "Leased farmlands"), value: formatNumber(farmData.leaseCount, 0) },
        { key: "area", label: tOr("companionPage.fieldLeasing.statArea", "Leased area"), value: hectares(farmData.totalAreaHa) },
        {
          key: "monthly",
          label: tOr("companionPage.fieldLeasing.statMonthly", "Lease per period"),
          value: money(farmData.monthlyCost),
          hint: tOr("companionPage.fieldLeasing.statMonthlyHint", "Charged when each new period starts"),
        },
        { key: "yearly", label: tOr("companionPage.fieldLeasing.statYearly", "Lease per year"), value: money(farmData.yearlyCost) },
        {
          key: "canEnd",
          label: tOr("companionPage.fieldLeasing.statCanEnd", "Leases you can end"),
          value: tOr("companionPage.fieldLeasing.ofCount", "{{count}} of {{total}}", {
            count: formatNumber(farmData.canEndCount, 0),
            total: formatNumber(farmData.leaseCount, 0),
          }),
        },
        {
          key: "today",
          label: tOr("companionPage.fieldLeasing.statToday", "Lease charged today"),
          value: num(finance?.today) != null ? money(Math.abs(num(finance?.today) ?? 0)) : "—",
        },
      ]
    : [];

  const chart: ModChartPoint[] = recent.map((value, i) => ({
    key: String(i),
    label: i === recent.length - 1 ? tOr("companionPage.fieldLeasing.chartLatest", "Latest") : String(i - recent.length + 1),
    value: Math.abs(num(value) ?? 0),
    current: i === recent.length - 1,
  }));

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.fieldLeasing.lead",
        "Field Leasing lets you rent farmland instead of buying it. You pay part of the land price every period and can end the lease after a minimum term.",
      )}
    >
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.fieldLeasing.leasesTitle", "Your leases")}>
        <ModTable
          columns={[
            { key: "farmland", label: tOr("companionPage.fieldLeasing.colFarmland", "Farmland"), align: "end" },
            { key: "area", label: tOr("companionPage.fieldLeasing.colArea", "Area"), align: "end" },
            { key: "signed", label: tOr("companionPage.fieldLeasing.colSigned", "Land price at signing"), align: "end" },
            { key: "current", label: tOr("companionPage.fieldLeasing.colCurrent", "Land price today"), align: "end" },
            { key: "monthly", label: tOr("companionPage.fieldLeasing.colMonthly", "Per period"), align: "end" },
            { key: "paid", label: tOr("companionPage.fieldLeasing.colPaid", "Periods paid"), align: "end" },
            { key: "end", label: tOr("companionPage.fieldLeasing.colEnd", "End lease"), align: "center" },
          ]}
          rows={leases.map((lease, i) => ({
            key: String(lease.farmlandId ?? `row-${i}`),
            cells: {
              farmland:
                lease.name && lease.name !== String(lease.farmlandId)
                  ? `${formatNumber(lease.farmlandId, 0)} · ${lease.name}`
                  : formatNumber(lease.farmlandId, 0),
              area: hectares(lease.areaHa),
              signed: money(lease.signedPrice),
              current: money(lease.currentLandPrice),
              monthly: money(lease.monthlyCost),
              paid: formatNumber(lease.periodsPaid, 0),
              end: endStatus(lease),
            },
          }))}
          empty={leaseMessage}
        />
      </Card>
      <div class="fd-mod-page__grid">
        <Card title={tOr("companionPage.fieldLeasing.settingsTitle", "Lease settings")}>
          <ModKeyValues
            rows={[
              {
                key: "rate",
                label: tOr("companionPage.fieldLeasing.kvRate", "Yearly lease"),
                value:
                  num(settings?.priceMultiplierPercent) != null
                    ? tOr("companionPage.fieldLeasing.rateValue", "{{pct}} of the land price", {
                        pct: formatPercent(settings?.priceMultiplierPercent, { dp: 1 }),
                      })
                    : "—",
              },
              { key: "minTerm", label: tOr("companionPage.fieldLeasing.kvMinTerm", "Minimum term"), value: periods(settings?.minDurationPeriods) },
              ...(farmData && num(page?.otherFarmLeases) != null ? [{
                key: "others",
                label: tOr("companionPage.fieldLeasing.kvOthers", "Leases held by other farms"),
                value: formatNumber(page?.otherFarmLeases, 0),
              }] : []),
            ]}
          />
        </Card>
        {farmData ? <Card title={tOr("companionPage.fieldLeasing.historyTitle", "Lease charges, recent days")}>
          {chart.some((p) => (p.value ?? 0) > 0) ? (
            <ModBarChart points={chart} format={(n) => money(n)} />
          ) : (
            <ModEmpty>
              {Array.isArray(finance?.recentDays)
                ? tOr("companionPage.fieldLeasing.noCharges", "No lease charges in the days the game keeps. Charges are booked when a new period starts.")
                : tOr("companions.live.readUnavailable", "This mod's reading is not available in this save.")}
            </ModEmpty>
          )}
        </Card> : null}
      </div>
      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.fieldLeasing.look1", "Pick unowned farmland on the map: \"Lease\" sits next to \"Buy\". Signing charges the first period straight away."),
          tOr("companionPage.fieldLeasing.look2", "\"Terminate lease\" only appears once the lease has run for the minimum term. Leased land cannot be sold."),
          tOr("companionPage.fieldLeasing.look3", "\"Price Factor\" and \"Minimum lease term\" are under Field Lease in the game settings. The mod charges the price factor per year, split over 12 periods, and books it in finances as Field Lease."),
        ]}
      />
    </ModPage>
  );
}
