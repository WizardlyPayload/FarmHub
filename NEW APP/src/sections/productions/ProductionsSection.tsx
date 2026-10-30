import { useEffect, useMemo, useState } from "preact/hooks";
import { t, tOr } from "@/i18n/i18n";
import { CompanionModsEmbed } from "@/sections/companions";
import { Badge, Card } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import { isLuaExportStale, LUA_EXPORT_STALE_MS, luaStaleRefreshDelayMs } from "@/lib/connection-badge";
import type { EconomyLike } from "@/lib/fillTypeResolve";
import {
  filterChainsBySearch,
  formatFillAmount,
  formatProductionFillLabel,
  getChainsForFarmView,
  isProductionCollectorDisabled,
  isPublicProductionChain,
  readIncludePublicPref,
  sortedFillEntries,
  writeIncludePublicPref,
  type ProductionChain,
  type ProductionSlot,
} from "@/lib/productions";
import { formatFillQuantity, type FillPhysicsMap, type FillUnitMode, type UnitDisplayInfo } from "@/lib/fill-units";
import { useFillPhysics, useFillUnitMode, useUnitDisplay } from "@/lib/fill-unit-mode";
import {
  finite,
  listOf,
  useFoldedCompanion,
  watcherLevelsByFillType,
  watcherPointForChain,
  watcherTone,
  type WatcherLevel,
  type WatcherPoint,
} from "@/lib/companionFold";
import "./productions.css";

function watcherLabel(level: WatcherLevel): string {
  switch (level) {
    case "missing":
      return tOr("companionPage.productionWatcher.alertMissing", "Input missing");
    case "low":
      return tOr("companionPage.productionWatcher.alertLow", "Input low");
    case "full":
      return tOr("companionPage.productionWatcher.alertFull", "Output full");
    case "nearlyFull":
      return tOr("companionPage.productionWatcher.alertNearlyFull", "Output nearly full");
    default: {
      const never: never = level;
      return never;
    }
  }
}

function pointLevels(point: WatcherPoint): WatcherLevel[] {
  const out: WatcherLevel[] = [];
  if (point.inputAlert) out.push(point.inputAlert);
  if (point.outputAlert) out.push(point.outputAlert);
  return out;
}

function WatcherBadge({ level }: { level: WatcherLevel }) {
  return (
    <Badge tone={watcherTone(level) === "danger" ? "danger" : "warn"}>
      {watcherLabel(level)}
    </Badge>
  );
}

function FillTable({
  map,
  economy,
  fillMode,
  fillPhysics,
  unitDisplay,
  alerts,
}: {
  map: Record<string, number> | undefined;
  economy?: EconomyLike | null;
  fillMode: FillUnitMode;
  fillPhysics: FillPhysicsMap;
  unitDisplay: UnitDisplayInfo;
  alerts?: Map<string, WatcherLevel>;
}) {
  const entries = sortedFillEntries(map);
  if (entries.length === 0) {
    return <p class="fd-muted-sm">{t("productions.noFillData")}</p>;
  }
  return (
    <table class="fd-table">
      <thead>
        <tr>
          <th>{t("productions.fillType")}</th>
          <th class="fd-text-end">{t("productions.level")}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([k, v]) => {
          const level = alerts?.get(k.toUpperCase());
          const tone = watcherTone(level);
          return (
            <tr key={k} class={tone ? `is-${tone}` : undefined} data-watch={level}>
              <td>
                {formatProductionFillLabel(k, economy, fillMode)}
                {level ? <WatcherBadge level={level} /> : null}
              </td>
              <td class="fd-text-end fd-mono">{formatFillAmount(v, k, fillMode, fillPhysics, unitDisplay)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RecipeTable({
  slot,
  economy,
  fillMode,
  fillPhysics,
  unitDisplay,
}: {
  slot: ProductionSlot;
  economy?: EconomyLike | null;
  fillMode: FillUnitMode;
  fillPhysics: FillPhysicsMap;
  unitDisplay: UnitDisplayInfo;
}) {
  const ins = Array.isArray(slot.inputs) ? slot.inputs : [];
  const outs = Array.isArray(slot.outputs) ? slot.outputs : [];
  if (ins.length === 0 && outs.length === 0) {
    return <p class="fd-muted-sm">{t("productions.noRecipeRows")}</p>;
  }
  return (
    <table class="fd-table fd-table--sm">
      <thead>
        <tr>
          <th style={{ width: "5rem" }} />
          <th>{t("productions.fillType")}</th>
          <th class="fd-text-end">{t("productions.recipe")}</th>
        </tr>
      </thead>
      <tbody>
        {ins.map((row, i) => (
          <tr key={`in-${i}`}>
            <td>
              <Badge>{t("productions.badgeIn")}</Badge>
            </td>
            <td>{formatProductionFillLabel(row.fillType || "?", economy, fillMode)}</td>
            <td class="fd-text-end fd-muted-sm">
              {row.recipeAmount != null
                ? formatFillQuantity(Number(row.recipeAmount), row.fillType, fillMode, fillPhysics, unitDisplay)
                : "—"}
              {t("productions.perCycle")}
            </td>
          </tr>
        ))}
        {outs.map((row, i) => (
          <tr key={`out-${i}`}>
            <td>
              <Badge tone="accent">{t("productions.badgeOut")}</Badge>
            </td>
            <td>{formatProductionFillLabel(row.fillType || "?", economy, fillMode)}</td>
            <td class="fd-text-end fd-muted-sm">
              {row.recipeAmount != null
                ? formatFillQuantity(Number(row.recipeAmount), row.fillType, fillMode, fillPhysics, unitDisplay)
                : "—"}
              {t("productions.perCycle")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChainCard({
  chain,
  economy,
  fillMode,
  fillPhysics,
  unitDisplay,
  watch,
  lastReported,
}: {
  chain: ProductionChain;
  economy?: EconomyLike | null;
  fillMode: FillUnitMode;
  fillPhysics: FillPhysicsMap;
  unitDisplay: UnitDisplayInfo;
  watch?: WatcherPoint;
  lastReported: boolean;
}) {
  const inputAlerts = useMemo(() => (watch ? watcherLevelsByFillType(watch, "input") : undefined), [watch]);
  const outputAlerts = useMemo(() => (watch ? watcherLevelsByFillType(watch, "output") : undefined), [watch]);
  const name = chain.name || t("productions.defaultChainName");
  const cidRaw = String(chain.id ?? "");
  const farmId = Number(chain.ownerFarmId);
  const isPublic = isPublicProductionChain(chain);
  const chainActive = chain.isActive === true;
  const savedOnly = chain.source === "savegame_xml";
  const prods = Array.isArray(chain.productions) ? chain.productions : [];

  return (
    <Card class="fd-prod-card">
      <div class="fd-prod-card__header">
        <div>
          <h3 class="fd-prod-card__title">{name}</h3>
          <small class="fd-muted-sm">
            {isPublic
              ? tOr("productions.idPublicLine", "ID {{id}} · Map / public", { id: cidRaw })
              : t("productions.idFarmLine", { id: cidRaw, farmId })}
          </small>
        </div>
        <div class="fd-prod-card__badges">
          {isPublic ? (
            <Badge>{tOr("productions.badgePublic", "Map / public")}</Badge>
          ) : null}
          {savedOnly ? <Badge>{tOr("productions.savedSnapshot", "From last saved game")}</Badge> : (
            <Badge tone={chainActive ? "accent" : "default"}>
              {lastReported
                ? chainActive
                  ? tOr("productions.lastReportedRunning", "Running at last export")
                  : tOr("productions.lastReportedStopped", "Stopped at last export")
                : chainActive ? t("productions.chainRunning") : t("productions.chainStopped")}
            </Badge>
          )}
          {watch
            ? pointLevels(watch).map((level) => (
                <span key={level} data-fold="productionWatcher">
                  <WatcherBadge level={level} />
                </span>
              ))
            : null}
        </div>
      </div>

      {savedOnly ? (
        <div class="fd-prod-storage">
          <div>
            <h4 class="fd-prod-subhead">{tOr("productions.savedStorage", "Storage at last save")}</h4>
            <FillTable map={chain.storageFillLevels} economy={economy} fillMode={fillMode} fillPhysics={fillPhysics} unitDisplay={unitDisplay} />
          </div>
        </div>
      ) : <div class="fd-prod-storage">
        <div>
          <h4 class="fd-prod-subhead">{t("productions.inputStorage")}</h4>
          <FillTable map={chain.inputFillLevels} economy={economy} fillMode={fillMode} fillPhysics={fillPhysics} unitDisplay={unitDisplay} alerts={inputAlerts} />
        </div>
        <div>
          <h4 class="fd-prod-subhead">{t("productions.outputStorage")}</h4>
          <FillTable map={chain.outputFillLevels} economy={economy} fillMode={fillMode} fillPhysics={fillPhysics} unitDisplay={unitDisplay} alerts={outputAlerts} />
        </div>
      </div>}

      <h4 class="fd-prod-subhead fd-prod-subhead--slots">{t("productions.productionSlots")}</h4>
      {prods.length === 0 ? (
        <p class="fd-muted-sm">{t("productions.noSlotData")}</p>
      ) : (
        prods.map((p, idx) => {
          const active = p.isActive === true;
          const pname = p.name || t("productions.slotFallback", { n: idx + 1 });
          return (
            <details key={idx} class="fd-prod-slot">
              <summary class="fd-prod-slot__head">
                <strong>{pname}</strong>
                <span class="fd-prod-slot__badges">
                  <Badge tone={active ? "accent" : "default"}>
                    {savedOnly
                      ? active
                        ? tOr("productions.enabledAtLastSave", "Enabled at last save")
                        : tOr("productions.disabledAtLastSave", "Disabled at last save")
                      : lastReported
                        ? active
                          ? tOr("productions.activeAtLastExport", "Active at last export")
                          : tOr("productions.inactiveAtLastExport", "Inactive at last export")
                        : active ? t("productions.badgeActive") : t("productions.badgeInactive")}
                  </Badge>
                  <Badge>{String(p.status || "—")}</Badge>
                  {p.cyclesPerHour != null && Number(p.cyclesPerHour) > 0 ? (
                    <span class="fd-muted-sm">{Number(p.cyclesPerHour).toFixed(2)} / h</span>
                  ) : null}
                </span>
              </summary>
              {!savedOnly ? <RecipeTable slot={p} economy={economy} fillMode={fillMode} fillPhysics={fillPhysics} unitDisplay={unitDisplay} /> : null}
            </details>
          );
        })
      )}
    </Card>
  );
}

export function ProductionsSection() {
  const payload = useDashboardStore((s) => s.payload);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);
  const fillMode = useFillUnitMode();
  const fillPhysics = useFillPhysics();
  const unitDisplay = useUnitDisplay();
  const [search, setSearch] = useState("");
  const [includePublic, setIncludePublic] = useState(readIncludePublicPref);
  const ts = payload?.dataTimestamps;
  const lastLua = ts?.lastLuaReceivedAt ?? undefined;
  const staleMs = Number(ts?.luaExportStaleMs) || LUA_EXPORT_STALE_MS;
  useEffect(() => {
    const delay = luaStaleRefreshDelayMs(lastLua, staleMs, Date.now());
    if (delay == null) return;
    const id = window.setTimeout(() => setNowMs(Date.now()), delay);
    return () => window.clearTimeout(id);
  }, [lastLua, staleMs]);
  const lastReported = payload?.dataSource === "xml_only" || ts?.isStale === true ||
    ts?.confidence === "held" || ts?.confidence === "cache" ||
    isLuaExportStale(lastLua, nowMs, staleMs);

  const farmId = activeFarmId ?? 1;
  const economy = (payload?.economy || null) as EconomyLike | null;
  const chains = useMemo(
    () =>
      getChainsForFarmView(
        payload?.production ?? null,
        farmId,
        payload?.farmInfo,
        includePublic,
      ),
    [payload?.production, payload?.farmInfo, farmId, includePublic],
  );
  const filtered = useMemo(
    () => filterChainsBySearch(chains, search),
    [chains, search],
  );
  const watcher = useFoldedCompanion("productionWatcher");
  const watchPoints = useMemo(
    () => listOf<WatcherPoint>(watcher.page?.points).filter((p) => finite(p.farmId) === farmId),
    [watcher.page, farmId],
  );
  const watchCounts = watcher.farmData;

  const toggleIncludePublic = () => {
    const next = !includePublic;
    setIncludePublic(next);
    writeIncludePublicPref(next);
  };

  const productionOff = isProductionCollectorDisabled(payload?.collectorModules);
  const chainSummary =
    chains.length === 1
      ? t("productions.chainCountOne", { count: chains.length, farmId })
      : t("productions.chainCountMany", { count: chains.length, farmId });

  return (
    <div class="fd-productions">
      <header class="fd-section-header">
        <h2>{t("productions.title")}</h2>
        {chains.length === 0 ? (
          <>
            <p class="fd-lead">
              {productionOff
                ? t("productions.subtitleCollectorDisabled")
                : t("productions.subtitleEmpty")}
            </p>
            <p class="fd-muted-sm">
              {productionOff
                ? t("productions.hintCollectorDisabled")
                : t("productions.hintEmpty")}
            </p>
          </>
        ) : (
          <p class="fd-muted-sm">{chainSummary}</p>
        )}
        {watcher.detected && watchCounts ? (
          <p
            class="fd-muted-sm fd-prod-watch-line"
            data-fold="productionWatcher"
            title={tOr(
              "productions.fold.watcherRules",
              "Production Watcher's rules: an input empty or under 5%, an output over 95% (nearly full) or 99.5% (full).",
            )}
          >
            {tOr(
              "productions.fold.watcherSummary",
              "Production Watcher: {{missing}} inputs missing · {{low}} low · {{full}} outputs full · {{nearlyFull}} nearly full",
              {
                missing: finite(watchCounts.missingInputs) ?? 0,
                low: finite(watchCounts.lowInputs) ?? 0,
                full: finite(watchCounts.outputFull) ?? 0,
                nearlyFull: finite(watchCounts.outputNearlyFull) ?? 0,
              },
            )}
          </p>
        ) : null}
      </header>

      <CompanionModsEmbed categories={["production"]} title={tOr("companions.embedProduction", "Production companion mods")} />
      <div class="fd-section-toolbar">
        <input
          type="search"
          value={search}
          placeholder={t("productions.searchPlaceholder")}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        />
        <label
          class="fd-prod-toggle"
          title={tOr(
            "productions.includePublicTitle",
            "Also list map-owned production chains (owner farm 0)",
          )}
        >
          <input
            type="checkbox"
            checked={includePublic}
            onChange={toggleIncludePublic}
          />
          <span>{tOr("productions.includePublic", "Show map/public")}</span>
        </label>
        {chains.length > 0 ? (
          <Badge>
            {filtered.length === chains.length
              ? chainSummary
              : t("productions.searchResultCount", {
                  shown: filtered.length,
                  total: chains.length,
                })}
          </Badge>
        ) : null}
      </div>
      {chains.length === 0 ? null : filtered.length === 0 ? (
        <div class="fd-productions__empty">
          <p>{t("productions.noSearchMatch")}</p>
        </div>
      ) : (
        <div class="fd-prod-grid">
          {filtered.map((c) => (
            <ChainCard
              key={String(c.id ?? c.name)}
              chain={c}
              economy={economy}
              fillMode={fillMode}
              fillPhysics={fillPhysics}
              unitDisplay={unitDisplay}
              watch={watcher.detected ? watcherPointForChain(c, watchPoints) : undefined}
              lastReported={lastReported}
            />
          ))}
        </div>
      )}
    </div>
  );
}
