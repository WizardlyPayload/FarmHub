import { Badge } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import { formatCurrency } from "@/lib/economy";
import { useUnitDisplay, useFillUnitMode, useFillPhysics } from "@/lib/fill-unit-mode";
import { formatFillQuantity, type FillUnitMode, type FillPhysicsMap, type UnitDisplayInfo } from "@/lib/fill-units";
import { formatProfileArea, saveProfileFromUnitDisplay } from "@/lib/profile-display";
import { formatLiters } from "@/lib/storage";
import {
  catalogEntry,
  companionSupport,
  cropRegionView,
  loanFarmView,
  restrictionAdvice,
  formatRestrictedBanReason,
  woolView,
  selectedCompanionFarmId,
  type CompanionCatalogEntry,
  type CompanionModsPayload,
} from "@/lib/companionMods";
import {
  fieldEconomyCard,
  type FieldEconomyLine,
  type FieldEconomyLiveKey,
} from "@/lib/companionMods/fieldEconomyCards";
import type { SaveProfileDisplay } from "@/lib/profile-display";
import { isProductionPathKey, ProductionPathLive } from "./ProductionPathLive";
import { AssetLiveStats, isAssetLiveKey } from "./AssetCompanionNotes";

/** FS25 calendar periods are numbered 1-12; the export carries no month names. */
export function periodName(period: number | null | undefined): string {
  if (period == null || period < 1 || period > 12) return "—";
  return String(period);
}

function formatFieldValue(line: FieldEconomyLine, profile: SaveProfileDisplay | null,
  mode: FillUnitMode, physics: FillPhysicsMap, unitDisplay: UnitDisplayInfo): string {
  if (line.textKey) return tOr(line.textKey, line.text ?? "—", line.textParams);
  if (line.text) return line.text;
  if (line.amount == null) return "—";
  switch (line.unit) {
    case "money":
      return formatCurrency(line.amount, profile);
    case "liters":
      return line.fillKey ? formatFillQuantity(line.amount, line.fillKey, mode, physics, unitDisplay) : formatLiters(line.amount);
    case "hectares":
      return formatProfileArea(line.amount, profile);
    case "hours":
      return tOr("companions.field.hoursValue", "{{hours}} h", { hours: line.amount.toFixed(1) });
    case "ratio":
      return `${Math.round(line.amount * 100)}%`;
    case "count":
    case undefined:
      return line.amount.toLocaleString();
    default: {
      const never: never = line.unit;
      return String(never);
    }
  }
}

function formatFieldLabel(line: FieldEconomyLine): string {
  const params: Record<string, string> = {};
  for (const [name, key] of Object.entries(line.labelParams ?? {})) {
    params[name] = tOr(key, key.slice(key.lastIndexOf(".") + 1));
  }
  return tOr(line.labelKey, line.labelKey.slice(line.labelKey.lastIndexOf(".") + 1), params);
}

function FieldEconomyLive({
  liveKey,
  payload,
  farmId,
}: {
  liveKey: FieldEconomyLiveKey;
  payload: CompanionModsPayload;
  farmId: number;
}) {
  const unitDisplay = useUnitDisplay();
  const profile = saveProfileFromUnitDisplay(unitDisplay);
  const fillMode = useFillUnitMode();
  const physics = useFillPhysics();
  const card = fieldEconomyCard(liveKey, payload, farmId);
  if (!card) return null;
  const summary = tOr(card.messageKey, card.messageKey, { count: card.rowCount, score: card.rows[0]?.[0]?.amount ?? "—" });
  if (card.rows.length === 0) {
    return <p class="fd-economy__muted" data-status={card.status}>{summary}</p>;
  }
  return (
    <div class="fd-companions__field-economy" data-status={card.status}>
      <Badge>{summary}</Badge>
      {card.rows.map((row, rowIndex) => (
        <dl class="fd-companions__field-row" key={`row-${rowIndex}`}>
          {row.map((line, index) => (
            <div data-field={line.labelKey} key={`${line.labelKey}-${index}`}>
              <dt>{formatFieldLabel(line)}</dt>
              <dd>{formatFieldValue(line, profile, fillMode, physics, unitDisplay)}</dd>
            </div>
          ))}
        </dl>
      ))}
      {card.truncated ? (
        <p class="fd-economy__muted" data-status="more">
          {tOr("companions.live.showingRows", "Showing {{shown}} of {{count}} row(s).", {
            shown: card.rows.length,
            count: card.rowCount,
          })}
        </p>
      ) : null}
    </div>
  );
}

export function farmGate(
  block: { readState?: string; farmId?: number; reason?: string } | null | undefined,
  farmId: number | null,
) {
  if (!block) return null;
  if (block.readState === "failed") {
    return (
      <p class="fd-economy__muted">
        {tOr("companions.live.readFailed", "This reading failed. It is not an empty result.")}
      </p>
    );
  }
  if (block.readState === "pending") {
    return (
      <p class="fd-economy__muted">
        {tOr("companions.live.readPending", "This reading is not ready yet.")}
      </p>
    );
  }
  const selected = selectedCompanionFarmId(farmId);
  // Only ok/empty (and a legacy block with no readState) may reach the numbers; any other status is unread.
  const state = block.readState;
  const unavailable = state != null && state !== "ok" && state !== "empty";
  if (selected == null || (unavailable && (selected <= 0 || block.reason === "no-farm"))) {
    return (
      <p class="fd-economy__muted">
        {tOr("companions.live.needsFarm", "Needs a selected farm before these numbers can be read.")}
      </p>
    );
  }
  if (unavailable) {
    return (
      <p class="fd-economy__muted">
        {tOr("companions.live.readUnavailable", "This mod's reading is not available in this save.")}
      </p>
    );
  }
  if (block.farmId != null && selectedCompanionFarmId(block.farmId) !== selectedCompanionFarmId(farmId)) {
    return (
      <p class="fd-economy__muted">
        {tOr("companions.live.otherFarm", "These numbers are for another farm.")}
      </p>
    );
  }
  return null;
}

/** The mod's JSON writer emits an empty Lua list as `{}`, not `[]`. */
export function asList<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/** Read-state gate for map-wide settings readers, which have no farm owner. */
export function readGate(block: { readState?: string } | null | undefined) {
  if (!block) return null;
  if (block.readState === "failed" || block.readState === "pending") {
    return farmGate({ readState: block.readState }, 0);
  }
  if (block.readState !== "ok") {
    return (
      <p class="fd-economy__muted">
        {tOr("companions.live.readUnavailable", "This mod's reading is not available in this save.")}
      </p>
    );
  }
  return null;
}

/** Short reading for one mod. */
export function LiveStats({
  entry,
  payload,
  farmId,
}: {
  entry: CompanionCatalogEntry;
  payload: CompanionModsPayload;
  farmId: number | null;
}) {
  const moneyProfile = saveProfileFromUnitDisplay(useUnitDisplay());
  const key = entry.liveKey;
  if (!key) {
    return (
      <p class="fd-economy__muted">
        {tOr(
          "companions.livePresenceOnly",
          "Detected in this save. Live numbers stay in the in-game UI for this mod.",
        )}
      </p>
    );
  }

  if (isAssetLiveKey(key) && payload[key]) {
    return <AssetLiveStats kind={key} payload={payload} farmId={farmId ?? Number.NaN} />;
  }

  if (isProductionPathKey(key)) {
    return <ProductionPathLive liveKey={key} payload={payload} farmId={farmId ?? Number.NaN} />;
  }

  if (key === "loans" && payload.loans?.enabled) {
    const view = loanFarmView(payload, farmId);
    if (view.status !== "ok") {
      return (
        <p class="fd-economy__muted">
          {tOr(
            "companions.live.loanUnavailable",
            "Enhanced loan totals are unavailable for this farm.",
          )}
        </p>
      );
    }
    const rest = view.restAmount;
    const count = view.count;
    const annuity = view.monthlyAnnuity;
    const loans = view.loans;
    return (
      <div class="fd-companions__live">
        <div class="fd-economy__env">
          <Badge tone="warn">
            {tOr("companions.live.loanCount", "{{count}} active loan(s)", { count })}
          </Badge>
          <Badge>
            {tOr("companions.live.loanRest", "Outstanding {{amount}}", {
              amount: formatCurrency(rest, moneyProfile),
            })}
          </Badge>
          {annuity != null ? (
            <Badge>
              {tOr("companions.live.loanAnnuity", "Monthly {{amount}}", {
                amount: formatCurrency(annuity, moneyProfile),
              })}
            </Badge>
          ) : null}
          {payload.loans.loanInterest != null ? (
            <Badge tone="default">
              {tOr("companions.live.loanInterest", "Rate {{rate}}%", {
                rate: payload.loans.loanInterest,
              })}
              {payload.loans.dynamicInterest
                ? ` · ${tOr("companions.live.loanDynamic", "dynamic")}`
                : ""}
            </Badge>
          ) : null}
        </div>
        {loans.length > 0 ? (
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
                {loans.map((loan, i) => (
                  <tr key={i}>
                    <td class="text-end">{formatCurrency(Number(loan.amount) || 0, moneyProfile)}</td>
                    <td class="text-end">{formatCurrency(Number(loan.restAmount) || 0, moneyProfile)}</td>
                    <td class="text-end">
                      {loan.interest != null ? `${loan.interest}%` : "—"}
                    </td>
                    <td class="text-end">{loan.restMonths ?? "—"}</td>
                    <td class="text-end">
                      {loan.monthlyAnnuity != null
                        ? formatCurrency(loan.monthlyAnnuity, moneyProfile)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p class="fd-economy__muted">
            {tOr("companions.live.noLoans", "No active enhanced loans for this farm.")}
          </p>
        )}
      </div>
    );
  }

  if (key === "diesel" && payload.diesel?.enabled) {
    const diesel = payload.diesel;
    const place = [diesel.country, diesel.region].filter(Boolean).join(", ");
    const hasPrice = diesel.pricePerLiter != null;
    const origin = hasPrice && (diesel.source === "native" || diesel.source === "rdpPreset") ? diesel.source : null;
    const contributorIds = Array.isArray(diesel.contributors) ? diesel.contributors : null;
    const contributorNames = [...new Set(contributorIds ?? [])]
      .map((id) => (typeof id === "string" ? catalogEntry(id)?.title : undefined))
      .filter((title): title is string => Boolean(title));
    return (
      <div class="fd-economy__env">
        {hasPrice ? (
          <Badge tone="accent">
            {tOr("companions.live.dieselPrice", "{{price}} / L", {
              price: Number(diesel.pricePerLiter).toFixed(2),
            })}
          </Badge>
        ) : contributorIds ? (
          <Badge>{tOr("companions.live.dieselUnavailable", "Diesel price was not read.")}</Badge>
        ) : (
          <Badge>{tOr("companions.live.dieselUnknown", "Diesel price active")}</Badge>
        )}
        {origin === "native" ? (
          <Badge tone="default">{tOr("companions.live.dieselOriginGame", "Game diesel price")}</Badge>
        ) : origin === "rdpPreset" ? (
          <Badge tone="default">
            {tOr("companions.live.dieselOriginPreset", "Country preset, not the live game price")}
          </Badge>
        ) : hasPrice ? (
          <Badge tone="default">
            {tOr("companions.live.dieselOriginUnknown", "Price origin not recorded")}
          </Badge>
        ) : null}
        {place ? <Badge tone="default">{place}</Badge> : null}
        {contributorNames.length ? (
          <Badge tone="default">
            {tOr("companions.live.dieselContributors", "Active diesel mods")}: {contributorNames.join(", ")}
          </Badge>
        ) : null}
      </div>
    );
  }

  if (key === "restrictedPeriods" && payload.restrictedPeriods?.enabled) {
    const advice = restrictionAdvice(payload.restrictedPeriods);
    if (advice === "unavailable") {
      return (
        <p class="fd-economy__muted">
          {tOr("companions.live.banUnknown", "Spreading restriction was not read.")}
        </p>
      );
    }
    const liquid = formatRestrictedBanReason(payload.restrictedPeriods.liquidBan);
    const solid = formatRestrictedBanReason(payload.restrictedPeriods.solidBan);
    return (
      <div class="fd-economy__env">
        <Badge tone="default">
          {tOr("companions.live.period", "Period {{name}}", {
            name: periodName(payload.restrictedPeriods.currentPeriod),
          })}
        </Badge>
        {advice === "banned" ? (
          <Badge tone="danger">{tOr("companions.live.banActive", "Spreading banned")}</Badge>
        ) : (
          <Badge tone="accent">{tOr("companions.live.banClear", "Spreading allowed")}</Badge>
        )}
        {liquid ? (
          <Badge tone="warn">
            {tOr("companions.live.liquidBan", "Liquid: {{reason}}", { reason: liquid })}
          </Badge>
        ) : null}
        {[payload.restrictedPeriods.liquidWindow, payload.restrictedPeriods.solidWindow].map((window, i) => window?.nextCalendarPeriod != null ? (
          <Badge key={i}>
            {i === 0
              ? tOr("companions.live.liquidNext", "Liquid calendar window: period {{period}}", { period: window.nextCalendarPeriod })
              : tOr("companions.live.solidNext", "Solid calendar window: period {{period}}", { period: window.nextCalendarPeriod })}
            {window.temperatureConditional ? " " + tOr("companions.live.temperatureConditional", "(temperature dependent)") : ""}
          </Badge>
        ) : null)}
        {solid ? (
          <Badge tone="warn">
            {tOr("companions.live.solidBan", "Solid: {{reason}}", { reason: solid })}
          </Badge>
        ) : null}
      </div>
    );
  }

  if (key === "cropCalendar" && payload.cropCalendar?.enabled) {
    const regionView = cropRegionView(payload.cropCalendar);
    if (regionView.status !== "ok") {
      return (
        <p class="fd-economy__muted">
          {tOr("companions.live.regionUnknown", "Crop region was not read.")}
        </p>
      );
    }
    const region = regionView.region;
    const calendarRead =
      payload.cropCalendar.calendarsReadState === "ok" || payload.cropCalendar.calendarsReadState === "partial";
    return (
      <div class="fd-economy__env">
        <Badge tone="accent">
          {tOr("companions.live.region", "Region: {{region}}", { region })}
        </Badge>
        {calendarRead ? (
          <Badge>
            {tOr("companions.live.cropCount", "{{count}} crop calendar(s)", {
              count: asList(payload.cropCalendar.crops).length,
            })}
          </Badge>
        ) : (
          <Badge>{tOr("companions.live.calendarPending", "Crop windows are not available yet.")}</Badge>
        )}
        {calendarRead && payload.cropCalendar.coverage !== "complete" ? (
          <Badge tone="warn">{tOr("companions.live.calendarPartial", "Calendar coverage is partial.")}</Badge>
        ) : null}
        {payload.cropCalendar.weatherEnabled ? (
          <Badge>{tOr("companions.live.weatherOn", "Regional weather on")}</Badge>
        ) : null}
        {payload.cropCalendar.yieldEnabled ? (
          <Badge>{tOr("companions.live.yieldOn", "Regional yield on")}</Badge>
        ) : null}
        {payload.cropCalendar.strictSuitabilityEnabled ? (
          <Badge tone="warn">{tOr("companions.live.strictSuit", "Strict suitability")}</Badge>
        ) : null}
      </div>
    );
  }

  if (key === "automaticLoanRepay" && payload.automaticLoanRepay?.enabled) {
    return (
      <div class="fd-economy__env">
        {payload.automaticLoanRepay.minimumBalance != null ? (
          <Badge>
            {tOr("companions.live.minBalance", "Keep {{amount}}", {
              amount: formatCurrency(payload.automaticLoanRepay.minimumBalance, moneyProfile),
            })}
          </Badge>
        ) : null}
        {payload.automaticLoanRepay.repaymentHour != null ? (
          <Badge tone="default">
            {tOr("companions.live.repayHour", "Repays at {{hour}}:00", {
              hour: payload.automaticLoanRepay.repaymentHour,
            })}
          </Badge>
        ) : null}
      </div>
    );
  }

  if (key === "betterContracts" && payload.betterContracts?.enabled) {
    return (
      <div class="fd-economy__env">
        {payload.betterContracts.missionCount != null ? (
          <Badge>
            {tOr("companions.live.missions", "{{count}} missions tracked", {
              count: payload.betterContracts.missionCount,
            })}
          </Badge>
        ) : (
          <Badge>{tOr("companions.live.bcActive", "Better Contracts active")}</Badge>
        )}
        {payload.betterContracts.lazyNPC ? (
          <Badge tone="default">{tOr("companions.live.lazyNpc", "Lazy NPCs")}</Badge>
        ) : null}
        {payload.betterContracts.hardMode ? (
          <Badge tone="warn">{tOr("companions.live.hardMode", "Hard mode")}</Badge>
        ) : null}
      </div>
    );
  }

  if (key === "livestockMonitor" && payload.livestockMonitor?.enabled) {
    const monitor = payload.livestockMonitor;
    const blocked = readGate(monitor);
    if (blocked) return blocked;
    const alertsForFarm =
      monitor.readState === "ok" &&
      selectedCompanionFarmId(farmId) != null &&
      monitor.farmId != null &&
      Number(monitor.farmId) === Number(farmId);
    const alertCount = (monitor.queuedAlerts || 0) + (monitor.hasActiveAlert ? 1 : 0);
    return (
      <div class="fd-economy__env">
        {monitor.displayMode ? (
          <Badge tone="accent">
            {tOr("companions.live.lmMode", "Mode: {{mode}}", {
              mode: monitor.displayMode,
            })}
          </Badge>
        ) : (
          <Badge>{tOr("companions.live.lmActive", "Livestock Monitor active")}</Badge>
        )}
        {alertsForFarm && alertCount > 0 ? (
          <Badge tone="danger">
            {tOr("companions.live.lmAlerts", "{{count}} alert(s)", { count: alertCount })}
          </Badge>
        ) : null}
      </div>
    );
  }

  if (key === "saveUnitProfiles" && payload.saveUnitProfiles?.enabled) {
    const blocked = readGate(payload.saveUnitProfiles);
    if (blocked) return blocked;
    return (
      <div class="fd-economy__env">
        {payload.saveUnitProfiles.moneyUnitName ? (
          <Badge tone="accent">
            {tOr("companions.live.moneyUnit", "Money unit: {{unit}}", {
              unit: payload.saveUnitProfiles.moneyUnitName,
            })}
          </Badge>
        ) : (
          <Badge>{tOr("companions.live.supActive", "Unit profiles active")}</Badge>
        )}
        {payload.saveUnitProfiles.profileName ? (
          <Badge tone="default">{payload.saveUnitProfiles.profileName}</Badge>
        ) : null}
      </div>
    );
  }

  if (key === "seasonalWool" && payload.seasonalWool?.enabled) {
    const wool = payload.seasonalWool;
    const blocked = farmGate(wool, farmId);
    const view = woolView(wool, farmId);
    switch (view.status) {
      case "disabled":
      case "failed":
      case "pending":
      case "unavailable":
      case "other-farm":
        return (
          blocked ?? (
            <p class="fd-economy__muted">
              {tOr("companions.live.woolUnavailable", "No wool reading is available.")}
            </p>
          )
        );
      case "ok":
        break;
      default: {
        const unhandled: never = view;
        return unhandled;
      }
    }
    if (view.season === "unknown" && view.fee == null && view.pens == null) {
      return (
        <p class="fd-economy__muted">
          {tOr("companions.live.woolNoValues", "Wool readings are unavailable: no shearing season or pen count reported yet.")}
        </p>
      );
    }
    return (
      <div class="fd-economy__env">
        <Badge>
          {view.season === "shearing"
            ? tOr("companions.live.woolShearing", "Shearing month")
            : view.season === "accumulating"
              ? tOr("companions.live.woolGrowing", "Wool accumulating")
              : tOr("companions.live.woolSeasonUnknown", "Shearing season not reported")}
        </Badge>
        {view.fee != null ? (
          <Badge tone="accent">
            {tOr("companions.live.woolFee", "Fee {{amount}} / sheep", {
              amount: formatCurrency(view.fee, moneyProfile),
            })}
            {wool.feeScope === "map" ? tOr("companions.live.woolConfiguredFee", " (configured)") : null}
          </Badge>
        ) : null}
        {view.pens != null ? (
          <Badge>
            {view.pensTruncated
              ? tOr("companions.live.woolPensTruncated", "At least {{count}} pen(s)", {
                  count: view.pens,
                })
              : tOr("companions.live.woolPens", "{{count}} pen(s)", { count: view.pens })}
          </Badge>
        ) : null}
      </div>
    );
  }

  if (key === "taskList" && payload.taskList?.enabled) {
    const blocked = farmGate(payload.taskList, farmId);
    if (blocked) return blocked;
    const tasks = asList(payload.taskList.tasks);
    if (tasks.length === 0) {
      return <p class="fd-economy__muted">{tOr("companions.live.tasksEmpty", "No active tasks for this farm.")}</p>;
    }
    return (
      <div class="fd-economy__env">
        {tasks.slice(0, 3).map((task) => (
          <Badge key={task.id}>{task.detail || task.id}</Badge>
        ))}
      </div>
    );
  }

  if (key === "productionSchedule" && payload.productionSchedule?.enabled) {
    const blocked = farmGate(payload.productionSchedule, farmId);
    if (blocked) return blocked;
    const recipes = asList(payload.productionSchedule.recipes);
    if (recipes.length === 0) {
      return <p class="fd-economy__muted">{tOr("companions.live.scheduleEmpty", "No scheduled recipes for this farm.")}</p>;
    }
    return (
      <div class="fd-economy__env">
        {recipes.slice(0, 3).map((row) => (
          <Badge key={`${row.pointKey}-${row.recipeId}`}>
            {row.recipeId} {row.status === "aktiv" ? tOr("companions.live.scheduleOn", "scheduled") : tOr("companions.live.scheduleOff", "not scheduled")}
          </Badge>
        ))}
      </div>
    );
  }

  if (key === "economicHistory" && payload.economicHistory?.enabled) {
    const blocked = farmGate(payload.economicHistory, farmId);
    if (blocked) return blocked;
    const current = payload.economicHistory.current;
    const months = asList(payload.economicHistory.months);
    if (!current && months.length === 0) {
      return <p class="fd-economy__muted">{tOr("companions.live.historyEmpty", "No recorded months for this farm yet.")}</p>;
    }
    return (
      <div class="fd-economy__env">
        {current?.balance != null ? (
          <Badge tone="accent">{formatCurrency(current.balance, moneyProfile)}</Badge>
        ) : null}
        <Badge>
          {tOr("companions.live.historyMonths", "{{count}} recorded month(s)", { count: months.length })}
        </Badge>
      </div>
    );
  }

  if (key === "animalFoodCalculator" && payload.animalFoodCalculator?.enabled) {
    const food = payload.animalFoodCalculator;
    const blocked = readGate(food);
    if (blocked) return blocked;
    return (
      <div class="fd-economy__env">
        <Badge>{food.mode || tOr("companions.live.foodMode", "Food scale")}</Badge>
        {food.foodScale != null ? (
          <Badge tone="accent">
            {tOr("companions.live.foodScale", "Food x{{factor}}", { factor: food.foodScale })}
          </Badge>
        ) : null}
        {food.daysPerPeriod != null ? (
          <Badge tone="default">
            {tOr("companions.live.foodDays", "{{days}} day(s) per period", { days: food.daysPerPeriod })}
          </Badge>
        ) : null}
      </div>
    );
  }

  if (key === "animalPlanner" && payload.animalPlanner?.enabled) {
    const blocked = farmGate(payload.animalPlanner, farmId);
    if (blocked) return blocked;
    const barns = asList(payload.animalPlanner.barns);
    if (barns.length === 0) {
      return <p class="fd-economy__muted">{tOr("companions.live.plannerEmpty", "No barns read for this farm.")}</p>;
    }
    return (
      <div class="fd-economy__env">
        {barns.slice(0, 3).map((barn) => (
          <Badge key={barn.name}>
            {tOr("companions.live.plannerBarn", "{{name}} {{count}}/{{max}}", {
              name: barn.name || "",
              count: barn.numAnimals ?? 0,
              max: barn.maxAnimals ?? 0,
            })}
          </Badge>
        ))}
      </div>
    );
  }

  if (
    key === "yieldTracker" ||
    key === "fieldLeases" ||
    key === "farmReputation" ||
    key === "rentYourField" ||
    key === "farmlandMarketplace" ||
    key === "fieldProfitabilityLedger"
  ) {
    return <FieldEconomyLive liveKey={key} payload={payload} farmId={farmId ?? Number.NaN} />;
  }

  if (key === "vipOrders" && payload.vipOrders?.enabled) {
    const orders = payload.vipOrders;
    if (orders.reason === "single-player-only") {
      return (
        <p class="fd-economy__muted">
          {tOr("companions.live.vipSinglePlayer", "VIP orders are single-player only.")}
        </p>
      );
    }
    const blocked = farmGate(orders, farmId);
    if (blocked) return blocked;
    if (orders.farmId == null || Number(orders.farmId) !== Number(farmId)) {
      return (
        <p class="fd-economy__muted">
          {tOr("companions.live.needsFarm", "Needs a selected farm before these numbers can be read.")}
        </p>
      );
    }
    if (orders.readState !== "ok" || orders.orderCount == null || orders.orderCount === 0) {
      return <p class="fd-economy__muted">{tOr("companions.live.vipEmpty", "No open VIP orders.")}</p>;
    }
    const current = orders.currentOrder;
    return (
      <div class="fd-economy__env">
        <Badge>
          {tOr("companions.live.vipCount", "{{count}} open VIP order(s)", {
            count: orders.orderCount,
          })}
        </Badge>
        {current && current.items != null ? (
          <Badge tone="accent">
            {tOr("companions.live.vipCurrent", "Current order: {{left}} of {{items}} item(s) left, {{amount}} payout", {
              left: current.remainingItems ?? 0,
              items: current.items,
              amount: formatCurrency(current.payout ?? 0, moneyProfile),
            })}
          </Badge>
        ) : null}
      </div>
    );
  }

  if (companionSupport(entry) === "detection-only") {
    return (
      <p class="fd-economy__muted">
        {tOr(
          "companions.live.detectionOnly",
          "Detected only. FarmHub is not reading this mod's numbers.",
        )}
      </p>
    );
  }

  // Presence-only live keys
  const block = (payload as unknown as Record<string, unknown>)[key];
  if (block && typeof block === "object" && (block as { enabled?: boolean }).enabled) {
    return (
      <p class="fd-economy__muted">
        {tOr(
          "companions.live.modEnabled",
          "Active in this save. Open the related FarmHub page for farm numbers this mod affects.",
        )}
      </p>
    );
  }

  return (
    <p class="fd-economy__muted">
      {tOr("companions.livePresenceOnly", "Detected in this save.")}
    </p>
  );
}
