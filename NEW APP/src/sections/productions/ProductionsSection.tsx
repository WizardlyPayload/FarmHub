import { useMemo, useState } from "preact/hooks";
import { t, tOr } from "@/i18n/i18n";
import { Badge, Card } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
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
import "./productions.css";

function FillTable({
  map,
  economy,
}: {
  map: Record<string, number> | undefined;
  economy?: EconomyLike | null;
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
        {entries.map(([k, v]) => (
          <tr key={k}>
            <td>{formatProductionFillLabel(k, economy)}</td>
            <td class="fd-text-end fd-mono">{formatFillAmount(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecipeTable({
  slot,
  economy,
}: {
  slot: ProductionSlot;
  economy?: EconomyLike | null;
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
            <td>{formatProductionFillLabel(row.fillType || "?", economy)}</td>
            <td class="fd-text-end fd-muted-sm">
              {row.recipeAmount != null ? String(row.recipeAmount) : "—"}
              {t("productions.perCycle")}
            </td>
          </tr>
        ))}
        {outs.map((row, i) => (
          <tr key={`out-${i}`}>
            <td>
              <Badge tone="accent">{t("productions.badgeOut")}</Badge>
            </td>
            <td>{formatProductionFillLabel(row.fillType || "?", economy)}</td>
            <td class="fd-text-end fd-muted-sm">
              {row.recipeAmount != null ? String(row.recipeAmount) : "—"}
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
}: {
  chain: ProductionChain;
  economy?: EconomyLike | null;
}) {
  const name = chain.name || t("productions.defaultChainName");
  const cidRaw = String(chain.id ?? "");
  const farmId = Number(chain.ownerFarmId);
  const isPublic = isPublicProductionChain(chain);
  const chainActive = chain.isActive === true;
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
          <Badge tone={chainActive ? "accent" : "default"}>
            {chainActive ? t("productions.chainRunning") : t("productions.chainStopped")}
          </Badge>
        </div>
      </div>

      <div class="fd-prod-storage">
        <div>
          <h4 class="fd-prod-subhead">{t("productions.inputStorage")}</h4>
          <FillTable map={chain.inputFillLevels} economy={economy} />
        </div>
        <div>
          <h4 class="fd-prod-subhead">{t("productions.outputStorage")}</h4>
          <FillTable map={chain.outputFillLevels} economy={economy} />
        </div>
      </div>

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
                    {active ? t("productions.badgeActive") : t("productions.badgeInactive")}
                  </Badge>
                  <Badge>{String(p.status || "—")}</Badge>
                  {p.cyclesPerHour != null && Number(p.cyclesPerHour) > 0 ? (
                    <span class="fd-muted-sm">{Number(p.cyclesPerHour).toFixed(2)} / h</span>
                  ) : null}
                </span>
              </summary>
              <RecipeTable slot={p} economy={economy} />
            </details>
          );
        })
      )}
    </Card>
  );
}

export function ProductionsSection() {
  const payload = useDashboardStore((s) => s.payload);
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);
  const [search, setSearch] = useState("");
  const [includePublic, setIncludePublic] = useState(readIncludePublicPref);

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
      </header>
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
            <ChainCard key={String(c.id ?? c.name)} chain={c} economy={economy} />
          ))}
        </div>
      )}
    </div>
  );
}
