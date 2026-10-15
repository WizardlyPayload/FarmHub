import { useMemo } from "preact/hooks";
import { Badge, Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import { formatCurrency } from "@/lib/economy";
import { useUnitDisplay } from "@/lib/fill-unit-mode";
import { saveProfileFromUnitDisplay } from "@/lib/profile-display";
import {
  catalogEntry,
  companionSupport,
  detectedCompanionMods,
  formatRestrictedBanReason,
  isCompanionModsActive,
  loanFarmView,
  readSeasonalMilk,
  restrictionAdvice,
  selectedCompanionFarmId,
  woolView,
  type CompanionCategory,
  type CompanionModsPayload,
  type RestrictedWindow,
} from "@/lib/companionMods";
import {
  CALENDAR_PERIODS,
  companionItem,
  companionPanelId,
  cropCalendarGrid,
  type CalendarMark,
  type CompanionItem,
  type CompanionListedReason,
} from "@/lib/companionMods/presentation";
import { isFoldedCompanion } from "@/lib/foldedCompanions";
import { companionPageForCatalogId } from "@/sections/mods/registry";
import { ModPageLink } from "@/sections/mods/shared";
import { useDashboardStore } from "@/store/dashboard-store";
import type { DashboardPayload } from "@/types/dashboard";
import { assetStatusText } from "./AssetCompanionNotes";
import { LiveStats, farmGate, periodName } from "./LiveStats";
import { StatTiles, type StatTile } from "./StatTiles";

type BodyProps = { payload: CompanionModsPayload; farmId: number | null };

function Muted({ children }: { children: string }) {
  return <p class="fd-economy__muted">{children}</p>;
}

function periodLabel(period: number | null | undefined): string {
  const name = periodName(period);
  return name === "—" ? name : tOr("companions.periodLabel", "Period {{period}}", { period: name });
}

export function listedReasonLabel(reason: CompanionListedReason): string {
  switch (reason) {
    case "detection-only":
      return tOr("companions.support.detection-only", "Detected only");
    case "unmapped":
      return tOr("companions.support.unmapped", "Not read");
    case "no-reading":
      return tOr("companions.support.no-reading", "No reading yet");
    default: {
      const never: never = reason;
      return never;
    }
  }
}

export function listedReasonText(reason: CompanionListedReason): string {
  switch (reason) {
    case "detection-only":
      return tOr("companions.live.detectionOnly", "Detected only. FarmHub is not reading this mod's numbers.");
    case "unmapped":
      return tOr("companions.livePresenceOnly", "Detected in this save. Live numbers stay in the in-game UI for this mod.");
    case "no-reading":
      return tOr("companions.index.noReading", "Detected in this save, but the mod has not sent a reading yet.");
    default: {
      const never: never = reason;
      return never;
    }
  }
}

/** A listed mod with a dedicated page is read there; "not read" wording would contradict its page link. */
export function readOnOwnPage(item: CompanionItem): boolean {
  return (
    item.placement.tier === "listed" &&
    item.placement.reason !== "no-reading" &&
    companionPageForCatalogId(item.entry.id) != null
  );
}

export function ownPageLabel(): string {
  return tOr("companions.support.ownPage", "Own page");
}

export function ownPageText(): string {
  return tOr("companions.index.ownPageText", "FarmHub reads this mod on its own page under Mods in the sidebar.");
}

function LoansBody({ payload, farmId }: BodyProps) {
  const profile = saveProfileFromUnitDisplay(useUnitDisplay());
  const loans = payload.loans!;
  const view = loanFarmView(payload, farmId);
  if (view.status !== "ok") {
    return <Muted>{tOr("companions.live.loanUnavailable", "Enhanced loan totals are unavailable for this farm.")}</Muted>;
  }
  const tiles: StatTile[] = [
    {
      key: "count",
      label: tOr("companions.panel.loanCount", "Active loans"),
      value: view.count,
      tone: view.count > 0 ? "warn" : undefined,
    },
    { key: "rest", label: tOr("companions.panel.loanRest", "Outstanding"), value: formatCurrency(view.restAmount, profile) },
    {
      key: "monthly",
      label: tOr("companions.panel.loanMonthly", "Monthly payments"),
      value: view.monthlyAnnuity != null ? formatCurrency(view.monthlyAnnuity, profile) : "—",
    },
    {
      key: "rate",
      label: tOr("companions.panel.loanRate", "Interest rate"),
      value: loans.loanInterest != null ? `${loans.loanInterest}%` : "—",
      hint: loans.dynamicInterest ? tOr("companions.panel.loanDynamic", "Floats month to month") : null,
    },
  ];
  return (
    <>
      <StatTiles tiles={tiles} />
      {view.loans.length > 0 ? (
        <div class="fd-economy__table-wrap">
          <table class="fd-economy__table">
            <thead>
              <tr>
                <th class="text-end">{tOr("companions.col.amount", "Amount")}</th>
                <th class="text-end">{tOr("companions.col.rest", "Remaining")}</th>
                <th class="text-end">{tOr("companions.col.interest", "Interest")}</th>
                <th class="text-end">{tOr("companions.col.months", "Months left")}</th>
                <th class="text-end">{tOr("companions.col.annuity", "Monthly")}</th>
              </tr>
            </thead>
            <tbody>
              {view.loans.map((loan, i) => (
                <tr key={i}>
                  <td class="text-end">{formatCurrency(Number(loan.amount) || 0, profile)}</td>
                  <td class="text-end">{formatCurrency(Number(loan.restAmount) || 0, profile)}</td>
                  <td class="text-end">{loan.interest != null ? `${loan.interest}%` : "—"}</td>
                  <td class="text-end">{loan.restMonths ?? "—"}</td>
                  <td class="text-end">
                    {loan.monthlyAnnuity != null ? formatCurrency(loan.monthlyAnnuity, profile) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Muted>{tOr("companions.live.noLoans", "No active enhanced loans for this farm.")}</Muted>
      )}
    </>
  );
}

function DieselBody({ payload }: BodyProps) {
  const diesel = payload.diesel!;
  const hasPrice = diesel.pricePerLiter != null;
  const origin = hasPrice && (diesel.source === "native" || diesel.source === "rdpPreset") ? diesel.source : null;
  const contributorIds = Array.isArray(diesel.contributors) ? diesel.contributors : null;
  const contributorNames = [...new Set(contributorIds ?? [])]
    .map((id) => (typeof id === "string" ? catalogEntry(id)?.title : undefined))
    .filter((title): title is string => Boolean(title));
  const place = [diesel.country, diesel.region].filter(Boolean).join(", ");
  const tiles: StatTile[] = [
    {
      key: "price",
      label: tOr("companions.panel.dieselPrice", "Diesel price"),
      value: hasPrice
        ? tOr("companions.live.dieselPrice", "{{price}} / L", { price: Number(diesel.pricePerLiter).toFixed(2) })
        : tOr("companions.panel.notRead", "Not read"),
      text: !hasPrice,
    },
    {
      key: "origin",
      label: tOr("companions.panel.dieselOrigin", "Price source"),
      value:
        origin === "native"
          ? tOr("companions.live.dieselOriginGame", "Game diesel price")
          : origin === "rdpPreset"
            ? tOr("companions.live.dieselOriginPreset", "Country preset, not the live game price")
            : hasPrice
              ? tOr("companions.live.dieselOriginUnknown", "Price origin not recorded")
              : "—",
      text: true,
    },
  ];
  if (place) tiles.push({ key: "place", label: tOr("companions.panel.dieselRegion", "Country / region"), value: place, text: true });
  return (
    <>
      <StatTiles tiles={tiles} />
      {contributorNames.length ? (
        <Muted>{`${tOr("companions.live.dieselContributors", "Active diesel mods")}: ${contributorNames.join(", ")}`}</Muted>
      ) : null}
    </>
  );
}

function windowHint(window: RestrictedWindow | undefined): string | null {
  if (window?.nextCalendarPeriod == null) return null;
  const base = tOr("companions.panel.windowPeriod", "Calendar window: period {{period}}", {
    period: window.nextCalendarPeriod,
  });
  return window.temperatureConditional
    ? `${base} ${tOr("companions.live.temperatureConditional", "(temperature dependent)")}`
    : base;
}

function RestrictedBody({ payload }: BodyProps) {
  const rp = payload.restrictedPeriods!;
  const advice = restrictionAdvice(rp);
  if (advice === "unavailable") {
    return <Muted>{tOr("companions.live.banUnknown", "Spreading restriction was not read.")}</Muted>;
  }
  const allowed = tOr("companions.panel.allowed", "Allowed");
  const banTile = (key: string, label: string, reason: string | null, window: RestrictedWindow | undefined): StatTile => ({
    key,
    label,
    value: reason
      ? tOr("companions.panel.bannedFor", "Banned: {{reason}}", { reason })
      : advice === "allowed"
        ? allowed
        : "—",
    tone: reason ? "danger" : advice === "allowed" ? "ok" : undefined,
    hint: windowHint(window),
    text: true,
  });
  const tiles: StatTile[] = [
    { key: "period", label: tOr("companions.panel.currentPeriod", "Current period"), value: periodName(rp.currentPeriod) },
    {
      key: "spreading",
      label: tOr("companions.panel.spreading", "Spreading"),
      value: advice === "banned" ? tOr("companions.panel.banned", "Banned") : allowed,
      tone: advice === "banned" ? "danger" : "ok",
      text: true,
    },
    banTile("liquid", tOr("companions.panel.liquid", "Liquid (slurry, digestate)"), formatRestrictedBanReason(rp.liquidBan), rp.liquidWindow),
    banTile("solid", tOr("companions.panel.solid", "Solid (manure)"), formatRestrictedBanReason(rp.solidBan), rp.solidWindow),
  ];
  return <StatTiles tiles={tiles} />;
}

function markLabel(mark: CalendarMark): string {
  switch (mark) {
    case "plant":
      return tOr("companions.calendar.plant", "Planting");
    case "harvest":
      return tOr("companions.calendar.harvest", "Harvest");
    case "both":
      return tOr("companions.calendar.both", "Planting and harvest");
    case null:
      return "";
    default: {
      const never: never = mark;
      return never;
    }
  }
}

function CropCalendarBody({ payload, defaultOpen }: BodyProps & { defaultOpen: boolean }) {
  const cc = payload.cropCalendar!;
  const rp = payload.restrictedPeriods;
  const grid = useMemo(
    () => cropCalendarGrid(cc, rp?.enabled && rp.readState === "ok" ? rp.currentPeriod : null),
    [cc, rp],
  );
  if (grid.status === "unavailable") {
    return <Muted>{tOr("companions.live.regionUnknown", "Crop region was not read.")}</Muted>;
  }
  const flags = (
    <div class="fd-economy__env">
      <Badge tone="accent">{tOr("companions.live.region", "Region: {{region}}", { region: grid.region })}</Badge>
      {cc.weatherEnabled ? <Badge>{tOr("companions.live.weatherOn", "Regional weather on")}</Badge> : null}
      {cc.yieldEnabled ? <Badge>{tOr("companions.live.yieldOn", "Regional yield on")}</Badge> : null}
      {cc.strictSuitabilityEnabled ? (
        <Badge tone="warn">{tOr("companions.live.strictSuit", "Strict suitability")}</Badge>
      ) : null}
    </div>
  );
  if (grid.status === "pending") {
    return (
      <>
        {flags}
        <Muted>{tOr("companions.live.calendarPending", "Crop windows are not available yet.")}</Muted>
      </>
    );
  }
  const allMap = grid.rows.length > 0 && grid.rows.every((row) => row.mapCalendar);
  const current = grid.currentPeriod;
  return (
    <>
      {flags}
      <details class="fd-companions__calendar" open={defaultOpen}>
        <summary>
          <span>{tOr("companions.calendar.title", "Planting and harvest calendar")}</span>
          <Badge>{tOr("companions.live.cropCount", "{{count}} crop calendar(s)", { count: grid.rows.length })}</Badge>
        </summary>
        {grid.rows.length === 0 ? (
          <Muted>{tOr("companions.calendar.empty", "The mod reported no crop windows.")}</Muted>
        ) : (
          <>
            <div class="fd-companions__calendar-scroll">
              <table class="fd-economy__table fd-companions__calendar-table">
                <thead>
                  <tr>
                    <th scope="col">{tOr("companions.calendar.crop", "Crop")}</th>
                    {CALENDAR_PERIODS.map((p) => (
                      <th
                        key={p}
                        scope="col"
                        class={`text-center${p === current ? " is-current" : ""}`}
                        title={periodLabel(p)}
                      >
                        {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row) => (
                    <tr key={row.crop} data-crop={row.crop}>
                      <th scope="row">
                        {row.label}
                        {row.mapCalendar && !allMap ? (
                          <span class="fd-companions__cal-tag">{tOr("companions.calendar.mapTag", "map")}</span>
                        ) : null}
                      </th>
                      {row.complete ? (
                        row.cells.map((mark, i) => {
                          const label = markLabel(mark);
                          const period = CALENDAR_PERIODS[i];
                          return (
                            <td
                              key={period}
                              class={`fd-companions__cal-cell${mark ? ` is-${mark}` : ""}${period === current ? " is-current" : ""}`}
                              title={mark ? `${periodLabel(period)}: ${label}` : periodLabel(period)}
                              data-mark={mark ?? undefined}
                            >
                              {mark ? <span class="fd-companions__cal-mark" role="img" aria-label={label} /> : null}
                            </td>
                          );
                        })
                      ) : (
                        <td colSpan={CALENDAR_PERIODS.length} class="fd-economy__muted">
                          {tOr("companions.live.cropWindowsUnknown", "Calendar incomplete")}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div class="fd-companions__cal-legend">
              <span><i class="fd-companions__cal-swatch is-plant" />{markLabel("plant")}</span>
              <span><i class="fd-companions__cal-swatch is-harvest" />{markLabel("harvest")}</span>
              <span><i class="fd-companions__cal-swatch is-both" />{markLabel("both")}</span>
              {current != null ? (
                <span><i class="fd-companions__cal-swatch is-current" />{tOr("companions.calendar.current", "Current period")}</span>
              ) : null}
              <span class="fd-economy__muted">{tOr("companions.calendar.periods", "Columns are calendar periods 1-12.")}</span>
              {allMap ? (
                <span class="fd-economy__muted">{tOr("companions.calendar.allMap", "All windows come from the map calendar.")}</span>
              ) : null}
            </div>
            {grid.partial ? <Muted>{tOr("companions.live.calendarPartial", "Calendar coverage is partial.")}</Muted> : null}
          </>
        )}
      </details>
    </>
  );
}

function ContractsBody({ payload }: BodyProps) {
  const bc = payload.betterContracts!;
  const onOff = (value: boolean) => (value ? tOr("companions.panel.on", "On") : tOr("companions.panel.off", "Off"));
  const tiles: StatTile[] = [
    {
      key: "missions",
      label: tOr("companions.panel.missions", "Missions tracked"),
      value: bc.missionCount != null ? bc.missionCount : "—",
    },
  ];
  if (typeof bc.lazyNPC === "boolean") {
    tiles.push({ key: "lazy", label: tOr("companions.live.lazyNpc", "Lazy NPCs"), value: onOff(bc.lazyNPC), text: true });
  }
  if (typeof bc.hardMode === "boolean") {
    tiles.push({
      key: "hard",
      label: tOr("companions.live.hardMode", "Hard mode"),
      value: onOff(bc.hardMode),
      tone: bc.hardMode ? "warn" : undefined,
      text: true,
    });
  }
  return <StatTiles tiles={tiles} />;
}

function MilkBody({ payload }: BodyProps) {
  const milk = readSeasonalMilk(payload.seasonalMilk);
  if (milk.status !== "ok") return <Muted>{assetStatusText(milk.status) || ""}</Muted>;
  return (
    <>
      <StatTiles
        tiles={[
          {
            key: "factor",
            label: tOr("companions.panel.milkFactor", "Milk factor this period"),
            value: `${Math.round((milk.factor ?? 0) * 100)}%`,
          },
          {
            key: "peak",
            label: tOr("companions.panel.milkPeak", "Next peak"),
            value: milk.nextPeakPeriod != null ? periodLabel(milk.nextPeakPeriod) : "—",
            text: true,
          },
        ]}
      />
      <Muted>{tOr("companions.panel.milkNote", "Shown on its own. FarmHub does not multiply it into barn output.")}</Muted>
    </>
  );
}

function WoolBody({ payload, farmId }: BodyProps) {
  const profile = saveProfileFromUnitDisplay(useUnitDisplay());
  const wool = payload.seasonalWool!;
  const blocked = farmGate(wool, farmId);
  const view = woolView(wool, farmId);
  switch (view.status) {
    case "disabled":
    case "failed":
    case "pending":
    case "unavailable":
    case "other-farm":
      return blocked ?? <Muted>{tOr("companions.live.woolUnavailable", "No wool reading is available.")}</Muted>;
    case "ok":
      break;
    default: {
      const unhandled: never = view;
      return unhandled;
    }
  }
  if (view.season === "unknown" && view.fee == null && view.pens == null) {
    return (
      <Muted>
        {tOr("companions.live.woolNoValues", "Wool readings are unavailable: no shearing season or pen count reported yet.")}
      </Muted>
    );
  }
  const tiles: StatTile[] = [
    {
      key: "season",
      label: tOr("companions.panel.woolSeason", "Season"),
      value:
        view.season === "shearing"
          ? tOr("companions.live.woolShearing", "Shearing month")
          : view.season === "accumulating"
            ? tOr("companions.live.woolGrowing", "Wool accumulating")
            : tOr("companions.live.woolSeasonUnknown", "Shearing season not reported"),
      tone: view.season === "shearing" ? "warn" : undefined,
      text: true,
    },
    {
      key: "fee",
      label: tOr("companions.panel.woolFee", "Shearing fee"),
      value:
        view.fee != null
          ? tOr("companions.panel.perSheep", "{{amount}} / sheep", { amount: formatCurrency(view.fee, profile) })
          : "—",
      hint: view.fee != null && wool.feeScope === "map" ? tOr("companions.panel.woolFeeConfigured", "Configured map setting") : null,
      text: true,
    },
    {
      key: "pens",
      label: tOr("companions.panel.woolPens", "Tracked pens"),
      value:
        view.pens == null
          ? "—"
          : view.pensTruncated
            ? tOr("companions.panel.atLeast", "At least {{count}}", { count: view.pens })
            : view.pens,
    },
  ];
  return <StatTiles tiles={tiles} />;
}

/** Designed body for the mods with a proper panel; everything else keeps its reading lines. */
function PanelBody({ item, payload, farmId, defaultOpen }: BodyProps & { item: CompanionItem; defaultOpen: boolean }) {
  switch (item.entry.liveKey) {
    case "loans":
      return <LoansBody payload={payload} farmId={farmId} />;
    case "diesel":
      return <DieselBody payload={payload} farmId={farmId} />;
    case "restrictedPeriods":
      return <RestrictedBody payload={payload} farmId={farmId} />;
    case "cropCalendar":
      return <CropCalendarBody payload={payload} farmId={farmId} defaultOpen={defaultOpen} />;
    case "betterContracts":
      return <ContractsBody payload={payload} farmId={farmId} />;
    case "seasonalMilk":
      return <MilkBody payload={payload} farmId={farmId} />;
    case "seasonalWool":
      return <WoolBody payload={payload} farmId={farmId} />;
    default:
      return <LiveStats entry={item.entry} payload={payload} farmId={farmId} />;
  }
}

export function CompanionPanel({
  item,
  payload,
  farmId,
  defaultOpen = false,
}: {
  item: CompanionItem;
  payload: CompanionModsPayload;
  farmId: number | null;
  defaultOpen?: boolean;
}) {
  const wide = item.entry.liveKey === "cropCalendar";
  const support = companionSupport(item.entry);
  const pageKey = companionPageForCatalogId(item.entry.id)?.key;
  return (
    <div
      id={companionPanelId(item.row.id)}
      class={`fd-companions__panel-wrap${wide ? " is-wide" : ""}`}
      data-mod={item.entry.id}
    >
      <Card class="fd-companions__panel" title={item.title}>
        <div class="fd-companions__card-actions">
          {item.row.version ? <Badge tone="default">v{item.row.version}</Badge> : null}
          <Badge tone={support === "live" ? "accent" : "default"}>
            {tOr(`companions.support.${support}`, support)}
          </Badge>
        </div>
        <PanelBody item={item} payload={payload} farmId={farmId} defaultOpen={defaultOpen} />
        {pageKey ? (
          <div class="fd-companions__card-footer">
            <ModPageLink pageKey={pageKey} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}

/** Tidy strip of installed mods FarmHub does not read: one line each, no empty cards. */
export function ListedChips({ items }: { items: CompanionItem[] }) {
  if (items.length === 0) return null;
  return (
    <div class="fd-companions__also">
      <span class="fd-companions__also-label">{tOr("companions.alsoInstalled", "Also installed")}</span>
      {items.map((item) => {
        const reason = item.placement.tier === "listed" ? item.placement.reason : "unmapped";
        const desc = item.entry.descKey ? tOr(item.entry.descKey, item.entry.desc) : item.entry.desc;
        const pageKey = companionPageForCatalogId(item.entry.id)?.key;
        const onPage = readOnOwnPage(item);
        return (
          <span
            key={item.row.id || item.title}
            id={companionPanelId(item.row.id)}
            class="fd-companions__chip"
            title={`${desc}\n${onPage ? ownPageText() : listedReasonText(reason)}`}
            data-mod={item.entry.id}
          >
            <strong>{item.title}</strong>
            <span>{onPage ? ownPageLabel() : listedReasonLabel(reason)}</span>
            {pageKey ? <ModPageLink pageKey={pageKey} /> : null}
          </span>
        );
      })}
    </div>
  );
}

export function inScope(item: CompanionItem, categories: readonly CompanionCategory[], ids?: readonly string[]): boolean {
  if (isFoldedCompanion(item.row.id)) return false;
  if (item.row.id && ids?.includes(item.row.id)) return true;
  return categories.includes(item.category);
}

/**
 * Companion panels on a FarmHub page: designed panels for live readings, chips for the rest.
 * `exclude` drops live panels another card on the same page already shows. Mods folded into a
 * FarmHub page (`FOLDED_COMPANIONS`) never get a panel or chip.
 */
export function CompanionPanelsEmbed({
  categories,
  ids,
  title,
  exclude,
}: {
  categories: CompanionCategory[];
  ids?: readonly string[];
  title?: string;
  exclude?: readonly string[];
}) {
  const payload = useDashboardStore((s) => s.payload) as DashboardPayload | null;
  const farmId = selectedCompanionFarmId(useDashboardStore((s) => s.activeFarmId));
  const cm = payload?.companionMods as CompanionModsPayload | null | undefined;
  const genericDesc = tOr("companions.desc.generic", "Third-party companion mod detected in this save.");

  const items = useMemo(() => {
    if (!isCompanionModsActive(cm)) return [];
    return detectedCompanionMods(cm)
      .map((row) => companionItem(row, cm, genericDesc))
      .filter((item) => inScope(item, categories, ids))
      .filter((item) => item.placement.tier !== "live" || !(item.row.id && exclude?.includes(item.row.id)));
  }, [cm, categories, ids, exclude, genericDesc]);

  if (items.length === 0 || !cm) return null;
  const live = items.filter((item) => item.placement.tier === "live");
  const listed = items.filter((item) => item.placement.tier === "listed");
  const heading = title || tOr("companions.embedTitle", "Companion mods");

  return (
    <section class="fd-companions__embed" aria-label={heading}>
      <div class="fd-companions__embed-head">
        <h3>{heading}</h3>
      </div>
      {live.length ? (
        <div class="fd-companions__panels">
          {live.map((item) => (
            <CompanionPanel key={item.row.id || item.title} item={item} payload={cm} farmId={farmId} defaultOpen />
          ))}
        </div>
      ) : null}
      <ListedChips items={listed} />
    </section>
  );
}
