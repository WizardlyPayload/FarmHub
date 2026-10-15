import { useMemo } from "preact/hooks";
import { Badge } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  finite,
  indexStockCheckItems,
  listOf,
  useFoldedCompanion,
  type StockCheckGuide,
  type StockCheckItem,
} from "@/lib/companionFold";
import { useUnitDisplay } from "@/lib/fill-unit-mode";
import { saveProfileFromUnitDisplay } from "@/lib/profile-display";
import { formatMoney } from "@/lib/storage";

export type StockCheckReading = {
  detected: boolean;
  items: Map<string, StockCheckItem>;
  bestTotalValue: number | null;
  reason: string | null;
};

/** Time Saving Stock Check's table, copied from the last time its in-game page was opened. */
export function useStockCheck(): StockCheckReading {
  const { detected, page, farmData } = useFoldedCompanion("timeSavingStockCheck");
  return useMemo(
    () => ({
      detected,
      items: indexStockCheckItems(listOf<StockCheckItem>(farmData?.items)),
      bestTotalValue: finite(farmData?.bestTotalValue),
      reason: page?.readState === "settings-only" && typeof page.reason === "string" ? page.reason : null,
    }),
    [detected, page, farmData],
  );
}

function shortReason(reason: string): string | null {
  switch (reason) {
    case "menu-not-opened":
      return tOr("storage.fold.stockCheckNotOpened", "Stock Check: open its page in the in-game menu once to add its sell advice here.");
    case "no-gui":
      return tOr("storage.fold.stockCheckNoGui", "Stock Check has no in-game menu on a dedicated server, so its sell advice is not available.");
    case "menu-not-registered":
      return tOr("storage.fold.stockCheckNotRegistered", "Stock Check: its page was not found in the in-game menu.");
    case "other-farm":
      return tOr("storage.fold.stockCheckOtherFarm", "Stock Check is showing a different farm in game.");
    case "farm-unknown":
      return tOr("storage.fold.stockCheckFarmUnknown", "Stock Check could not verify the farm for its in-game table in this session, so sell advice is unavailable.");
    default:
      return null;
  }
}

/** One line under the stock totals: where the Sell now? column comes from, or why it is missing. */
export function StockCheckNote({ reading }: { reading: StockCheckReading }) {
  const profile = saveProfileFromUnitDisplay(useUnitDisplay());
  if (!reading.detected) return null;
  if (reading.reason) {
    const text = shortReason(reading.reason);
    return text ? (
      <p class="fd-economy__muted" data-fold="timeSavingStockCheck">
        {text}
      </p>
    ) : null;
  }
  if (reading.items.size === 0) {
    return (
      <p class="fd-economy__muted" data-fold="timeSavingStockCheck">
        {tOr("storage.fold.stockCheckNotOpened", "Stock Check: open its page in the in-game menu once to add its sell advice here.")}
      </p>
    );
  }
  const best = reading.bestTotalValue;
  return (
    <p class="fd-economy__muted" data-fold="timeSavingStockCheck">
      {tOr("storage.fold.stockCheckSnapshot", "Sell now? comes from Stock Check, as of the last time it was opened in game.")}
      {best != null && best > 0 ? (
        <>
          {" "}
          {tOr("storage.fold.stockCheckBest", "Worth {{value}} if each product sells in its best month.", {
            value: formatMoney(best, profile),
          })}
        </>
      ) : null}
    </p>
  );
}

export function StockCheckGuideBadge({ item }: { item: StockCheckItem | undefined }) {
  const guide: StockCheckGuide | undefined = item?.guide;
  switch (guide) {
    case "great":
      return <Badge tone="accent">{tOr("companionPage.timeSavingStockCheck.guideGreat", "Best price")}</Badge>;
    case "veryGood":
      return <Badge tone="accent">{tOr("companionPage.timeSavingStockCheck.guideVeryGood", "Very good")}</Badge>;
    case "good":
      return <Badge>{tOr("companionPage.timeSavingStockCheck.guideGood", "Good")}</Badge>;
    case "normal":
      return <Badge>{tOr("companionPage.timeSavingStockCheck.guideNormal", "Wait")}</Badge>;
    case "noSellPoint":
      return <Badge tone="warn">{tOr("companionPage.timeSavingStockCheck.guideNoSellPoint", "Nowhere buys it")}</Badge>;
    case undefined:
      return <>—</>;
    default: {
      const never: never = guide;
      return never;
    }
  }
}
