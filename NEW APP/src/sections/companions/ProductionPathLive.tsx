import { Badge } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  factoryView,
  privateRows,
  readingStatus,
  type CompanionModsPayload,
  type DistributionBlock,
  type FactoryProjection,
  type ReadingStatus,
} from "@/lib/companionMods";
import { formatCurrency, type MarketPrices } from "@/lib/economy";
import { formatFillQuantity } from "@/lib/fill-units";
import { useFillPhysics, useFillUnitMode, useUnitDisplay } from "@/lib/fill-unit-mode";
import { saveProfileFromUnitDisplay } from "@/lib/profile-display";
import type { FieldRecord } from "@/lib/rules-engine";
import type { ProductionPayload } from "@/lib/productions";
import { farmFieldStats, farmPastureWarnings, farmProductionIssues } from "@/sections/overview/overviewFarmStats";
import { useDashboardStore } from "@/store/dashboard-store";
import type { DashboardPayload } from "@/types/dashboard";

export const PRODUCTION_PATH_KEYS = [
  "factoryProfitCalculator",
  "moistureSystem",
  "distributionRedux",
  "silageCompaction",
  "farmOperations",
] as const;
export type ProductionPathKey = (typeof PRODUCTION_PATH_KEYS)[number];

export function isProductionPathKey(key: string): key is ProductionPathKey {
  return (PRODUCTION_PATH_KEYS as readonly string[]).includes(key);
}

function Muted({ status, text }: { status: ReadingStatus | "partial"; text: string }) {
  return (
    <p class="fd-economy__muted" data-status={status}>
      {text}
    </p>
  );
}

function statusNote(status: Exclude<ReadingStatus, "ok" | "empty">) {
  switch (status) {
    case "disabled":
      return <Muted status={status} text={tOr("companions.live.readDisabled", "This reading is disabled.")} />;
    case "pending":
      return <Muted status={status} text={tOr("companions.live.readPending", "This reading is not ready yet.")} />;
    case "failed":
      return <Muted status={status} text={tOr("companions.live.readFailed", "This reading failed. It is not an empty result.")} />;
    case "other-farm":
      return <Muted status={status} text={tOr("companions.live.otherFarm", "These numbers are for another farm.")} />;
    case "unavailable":
      return <Muted status={status} text={tOr("companions.live.readUnavailable", "This reading is not available for the selected farm.")} />;
    default: {
      const never: never = status;
      return never;
    }
  }
}

function truncatedNote() {
  return (
    <Muted
      status="partial"
      text={tOr("companions.live.rowsPartial", "Only part of this list was read. Missing rows are not zero.")}
    />
  );
}

function useFormatters() {
  const unitDisplay = useUnitDisplay();
  const mode = useFillUnitMode();
  const physics = useFillPhysics();
  const profile = saveProfileFromUnitDisplay(unitDisplay);
  return {
    money: (v: number | null) => (v == null ? tOr("companions.live.valueUnavailable", "unavailable") : formatCurrency(v, profile)),
    quantity: (liters: number | null | undefined, fillType: unknown) =>
      liters == null || !Number.isFinite(liters) ? "—" : formatFillQuantity(liters, fillType, mode, physics, unitDisplay),
  };
}

function FactoryRows({ projections }: { projections: FactoryProjection[] }) {
  const f = useFormatters();
  return (
    <div class="fd-economy__table-wrap" data-reading="factory">
      <table class="fd-economy__table">
        <thead>
          <tr>
            <th>{tOr("companions.col.recipe", "Recipe")}</th>
            <th class="text-end">{tOr("companions.col.cyclesMonth", "Cycles / month")}</th>
            <th class="text-end">{tOr("companions.col.upkeepMonth", "Upkeep / month")}</th>
            <th class="text-end">{tOr("companions.col.outputValue", "Output at current price")}</th>
            <th class="text-end">{tOr("companions.col.purchasedInputs", "Inputs if bought")}</th>
            <th class="text-end">{tOr("companions.col.ownInputs", "Own inputs at sell price")}</th>
            <th class="text-end">{tOr("companions.col.marginBought", "Expected margin, inputs bought")}</th>
            <th class="text-end">{tOr("companions.col.marginOwn", "Expected margin, own inputs")}</th>
          </tr>
        </thead>
        <tbody>
          {projections.map((p, i) => (
            <tr key={`${p.line.pointId ?? "p"}:${p.line.recipeId ?? i}`}>
              <td>{[p.line.pointName, p.line.recipeName ?? p.line.recipeId].filter(Boolean).join(" · ") || "—"}</td>
              <td class="text-end">{p.cyclesPerMonth ?? "—"}</td>
              <td class="text-end">{f.money(p.upkeepPerMonth)}</td>
              <td class="text-end">{f.money(p.outputValue)}</td>
              <td class="text-end">{f.money(p.purchasedInputExpense)}</td>
              <td class="text-end">{f.money(p.inputOpportunityCost)}</td>
              <td class="text-end">{f.money(p.expectedMarginBuyingInputs)}</td>
              <td class="text-end">{f.money(p.expectedMarginOwnInputs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {projections.map((p, i) => (
        <p class="fd-companions__desc" key={`io:${i}`} data-io={p.line.recipeId ?? String(i)}>
          {!p.inputComplete || !p.outputComplete
            ? tOr("companions.live.factoryIncomplete", "Recipe data is incomplete. Dependent totals are unavailable. ") : ""}
          {[...(p.line.inputs || []), ...(p.line.outputs || [])]
            .map((row) =>
              tOr("companions.live.factoryFlow", "{{fillType}} {{monthly}} per month, storage {{level}} of {{capacity}}", {
                fillType: row.fillType ?? "—",
                monthly: f.quantity(row.monthlyLiters, row.fillType),
                level: f.quantity(row.fillLevelLiters, row.fillType),
                capacity: f.quantity(row.capacityLiters, row.fillType),
              }),
            )
            .join(" · ")}
          {p.theoreticalPeakOutputValue != null
            ? ` · ${tOr("companions.live.factoryPeak", "Theoretical peak output value {{amount}} (not a current price)", {
                amount: f.money(p.theoreticalPeakOutputValue),
              })}`
            : ""}
        </p>
      ))}
      <Muted status="ok" text={tOr("companions.live.factoryRealized", "Realized profit is unavailable: no sales history is read.")} />
    </div>
  );
}

function FactoryLive({ cm, dashboard, farmId }: { cm: CompanionModsPayload; dashboard: DashboardPayload | null; farmId: number }) {
  const market = (dashboard?.economy as { marketPrices?: MarketPrices } | undefined)?.marketPrices ?? null;
  const view = factoryView(cm.factoryProfitCalculator, market, farmId);
  if (view.status === "empty") {
    return view.coverage === "complete"
      ? <Muted status="empty" text={tOr("companions.live.factoryEmpty", "No production recipes for this farm.")} />
      : truncatedNote();
  }
  if (view.status !== "ok") return statusNote(view.status);
  return (
    <div class="fd-companions__live" data-status={view.projections.some((p) => !p.inputComplete || !p.outputComplete) ? "partial" : "ok"}>
      <FactoryRows projections={view.projections} />
      {view.coverage === "complete" ? null : truncatedNote()}
    </div>
  );
}

function MoistureLive({ cm, farmId }: { cm: CompanionModsPayload; farmId: number }) {
  const block = cm.moistureSystem;
  const status = readingStatus(block, farmId, "shared");
  if (status === "empty") return <Muted status="empty" text={tOr("companions.live.moistureEmpty", "No moisture value yet.")} />;
  if (status !== "ok") return statusNote(status);
  const percent = block!.mapMoisturePercent;
  const goods = privateRows<{ fillType?: string; qualityPercent?: number | null; grade?: number | null }>(
    block!.storedGoods as never,
    farmId,
    "warnings",
  );
  return (
    <div class="fd-companions__live" data-status="ok">
      <div class="fd-economy__env">
        <Badge>
          {typeof percent === "number" && Number.isFinite(percent)
            ? tOr("companions.live.moisturePercent", "Map moisture {{value}}%", { value: percent })
            : tOr("companions.live.moistureUnknown", "Map moisture unavailable")}
        </Badge>
        {goods.status === "ok"
          ? goods.rows.map((w, i) => (
              <Badge key={i} tone="warn">
                {tOr("companions.live.moistureWarning", "{{fillType}} quality {{quality}}%", {
                  fillType: w.fillType ?? "—",
                  quality: w.qualityPercent ?? "—",
                })}
              </Badge>
            ))
          : null}
      </div>
      {goods.status === "empty" && goods.coverage === "complete" ? (
        <Muted status="empty" text={tOr("companions.live.moistureNoWarnings", "No stored goods below grade B on this farm.")} />
      ) : goods.status === "ok" || goods.status === "empty" ? null : (
        statusNote(goods.status)
      )}
      {goods.status === "ok" || goods.status === "empty" ? (goods.coverage === "complete" ? null : truncatedNote()) : null}
    </div>
  );
}

const DISTRIBUTION_MODE_EN: Record<string, string> = {
  inherit: "Inherit",
  hold: "Hold",
  distribute: "Distribute",
  distributeSell: "Distribute and sell",
  sell: "Sell",
  distributeStore: "Distribute and store",
  store: "Store",
  transferMarket: "Market supply",
  distributeMarket: "Distribute and market supply",
  holdInternal: "Hold internal",
};

function distributionModeLabel(key: string | null | undefined) {
  if (!key) return tOr("companions.live.valueUnavailable", "unavailable");
  return tOr(`companions.distributionMode.${key}`, DISTRIBUTION_MODE_EN[key] ?? key);
}

function DistributionLive({ cm, farmId }: { cm: CompanionModsPayload; farmId: number }) {
  const f = useFormatters();
  const block = cm.distributionRedux as DistributionBlock | undefined;
  const status = readingStatus(block, farmId, "shared");
  if (status === "empty") return <Muted status="empty" text={tOr("companions.live.distributionEmpty", "No distribution settings read.")} />;
  if (status !== "ok") return statusNote(status);
  const modeLabel = distributionModeLabel(block!.modeKey);
  const assets = block!.farmAssets;
  const assetStatus = readingStatus(assets, farmId);
  const allowed = assetStatus === "ok";
  const overrides = privateRows<{ uniqueId?: string; fillType?: string | null; modeKey?: string | null }>(
    (allowed ? assets?.overridesReading : assets) as never, farmId, "rows");
  const moved = privateRows<{ uniqueId?: string; fillType?: string | null; distributedLiters?: number | null; soldLiters?: number | null; storedLiters?: number | null; receivedLiters?: number | null }>(
    (allowed ? (assets?.history?.window === "last-completed-cycle" ? assets.history : undefined) : assets) as never,
    farmId,
    "rows",
  );
  const active = block!.masterEnabled === true && block!.activity === "active" && (block!.participation === 1 || block!.participation === 2);
  return (
    <div class="fd-companions__live" data-status="ok">
      {!active ? <Muted status={block!.masterEnabled === false ? "disabled" : "unavailable"}
        text={block!.masterEnabled === false
          ? tOr("companions.live.distributionDisabled", "Distribution is disabled. Retained configuration and the last completed snapshot follow.")
          : block!.participation === 3
            ? tOr("companions.live.distributionNone", "No assets participate. Retained configuration and the last completed snapshot follow.")
            : tOr("companions.live.distributionUnknown", "Active operation is unknown. Only retained configuration is shown.")} /> : null}
      <div class="fd-economy__env">
        <Badge>{tOr("companions.live.distributionModeName", "Default mode {{mode}}", { mode: modeLabel })}</Badge>
        {block!.bufferHours != null ? (
          <Badge tone="default">{tOr("companions.live.distributionBuffer", "Buffer {{hours}} h", { hours: block!.bufferHours })}</Badge>
        ) : null}
        <Badge tone="default">
          {!active
            ? tOr("companions.live.distributionRetainedSell", "Retained selling setting: {{value}}", { value: block!.sellEnabled === true
                ? tOr("companions.live.settingOn", "on") : block!.sellEnabled === false
                  ? tOr("companions.live.settingOff", "off") : tOr("companions.live.valueUnavailable", "unavailable") })
            : block!.sellEnabled === true
            ? tOr("companions.live.distributionSellOn", "Selling on")
            : block!.sellEnabled === false ? tOr("companions.live.distributionSellOff", "Selling off")
              : tOr("companions.live.distributionSellUnknown", "Selling setting unavailable")}
        </Badge>
      </div>
      {overrides.status === "ok" && overrides.rows.length > 0 ? (
        <p class="fd-companions__desc" data-rows="overrides">
          {overrides.rows
            .map((r) =>
              tOr("companions.live.distributionOverrideAsset", "{{asset}} - {{fillType}}: {{mode}}", {
                asset: r.uniqueId ?? "?",
                fillType: r.fillType ?? "—",
                mode: r.modeKey ? distributionModeLabel(r.modeKey) : "—",
              }),
            )
            .join(" · ")}
        </p>
      ) : null}
      {moved.status === "ok" && moved.rows.length > 0 ? (
        <p class="fd-companions__desc" data-rows="lastCycle">
          {moved.rows
            .map((r) =>
              tOr("companions.live.distributionMovedAsset", "{{asset}} - {{fillType}} distributed {{dist}}, sold {{sold}} in the last completed hourly cycle; stored {{stored}}, received {{received}}", {
                asset: r.uniqueId ?? "?",
                fillType: r.fillType ?? "—",
                dist: f.quantity(r.distributedLiters, r.fillType),
                sold: f.quantity(r.soldLiters, r.fillType),
                stored: f.quantity(r.storedLiters, r.fillType),
                received: f.quantity(r.receivedLiters, r.fillType),
              }),
            )
            .join(" · ")}
        </p>
      ) : null}
      {overrides.status !== "ok" && overrides.status !== "empty" ? statusNote(overrides.status) : null}
      {(overrides.status === "ok" || overrides.status === "empty") && overrides.coverage !== "complete" ? truncatedNote() : null}
      {moved.status === "pending" ? <Muted status="pending" text={tOr("companions.live.distributionPending", "Last completed cycle: waiting for the first hourly pass.")} />
        : moved.status === "unavailable" ? <Muted status="unavailable" text={tOr("companions.live.distributionHistoryUnavailable", "Last completed cycle history is unavailable here. Client monthly totals are a different time window.")} />
        : moved.status === "empty" && moved.coverage === "complete" ? <Muted status="empty" text={tOr("companions.live.distributionHistoryEmpty", "The last completed cycle recorded no movements for this farm.")} />
        : moved.status !== "ok" && moved.status !== "empty" ? statusNote(moved.status) : null}
      {(moved.status === "ok" || moved.status === "empty") && moved.coverage !== "complete" ? truncatedNote() : null}
    </div>
  );
}

function SilageLive({ cm, farmId }: { cm: CompanionModsPayload; farmId: number }) {
  const block = cm.silageCompaction;
  const status = readingStatus(block, farmId);
  if (status === "empty") {
    return (
      <Muted
        status="empty"
        text={tOr("companions.live.silageHidden", "The compaction HUD is not showing. Bunker fill and compaction are on the storage page.")}
      />
    );
  }
  if (status !== "ok") return statusNote(status);
  return (
    <div class="fd-companions__live" data-status="ok">
      <div class="fd-economy__env">
        {block!.context ? <Badge>{block!.context}</Badge> : null}
        <Badge tone="default">
          {block!.estimate
            ? block!.estimate
            : tOr("companions.live.silageNoEstimate", "No time estimate while compaction is complete or stalled")}
        </Badge>
      </div>
    </div>
  );
}

function OperationsLive({ cm, dashboard, farmId }: { cm: CompanionModsPayload; dashboard: DashboardPayload | null; farmId: number }) {
  const block = cm.farmOperations;
  const status = readingStatus(block, farmId);
  const fields = farmFieldStats(dashboard?.fields as FieldRecord[] | undefined, farmId);
  const production = farmProductionIssues(dashboard?.production as ProductionPayload | null | undefined, dashboard?.farmInfo, farmId);
  const animals = farmPastureWarnings(dashboard, farmId);
  const rows = status === "ok" && Array.isArray(block!.fields) ? block!.fields : [];
  return (
    <div class="fd-companions__live" data-status={status}>
      <div class="fd-economy__env" data-reading="overview-counts">
        <Badge>{tOr("companions.live.opsHarvestReady", "Harvest ready {{count}}", { count: fields.harvestReady })}</Badge>
        <Badge>{tOr("companions.live.opsNeedsWork", "Fields needing work {{count}}", { count: fields.needsWork })}</Badge>
        <Badge tone="warn">{tOr("companions.live.opsProductionIssues", "Production issues {{count}}", { count: production })}</Badge>
        <Badge tone="warn">{tOr("companions.live.opsAnimalWarnings", "Animal warnings {{count}}", { count: animals })}</Badge>
      </div>
      <p class="fd-economy__muted">
        {tOr("companions.live.opsFromOverview", "Counts come from the FarmHub overview for this farm.")}
      </p>
      {status === "ok" ? (
        <Badge tone="default">{tOr("companions.live.opsFields", "{{count}} field HUD row(s)", { count: rows.length })}</Badge>
      ) : status === "empty" ? null : (
        statusNote(status)
      )}
    </div>
  );
}

export function ProductionPathLive({
  liveKey,
  payload,
  farmId,
}: {
  liveKey: ProductionPathKey;
  payload: CompanionModsPayload;
  farmId: number;
}) {
  const dashboard = useDashboardStore((s) => s.payload) as DashboardPayload | null;
  switch (liveKey) {
    case "factoryProfitCalculator":
      return <FactoryLive cm={payload} dashboard={dashboard} farmId={farmId} />;
    case "moistureSystem":
      return <MoistureLive cm={payload} farmId={farmId} />;
    case "distributionRedux":
      return <DistributionLive cm={payload} farmId={farmId} />;
    case "silageCompaction":
      return <SilageLive cm={payload} farmId={farmId} />;
    case "farmOperations":
      return <OperationsLive cm={payload} dashboard={dashboard} farmId={farmId} />;
    default: {
      const never: never = liveKey;
      return never;
    }
  }
}
