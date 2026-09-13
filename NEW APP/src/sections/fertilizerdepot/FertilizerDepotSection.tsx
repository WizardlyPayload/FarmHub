import { t, tOr } from "@/i18n/i18n";
import { useDashboardStore } from "@/store/dashboard-store";
import { isFertilizerDepotActive } from "@/lib/realisticFarming/depot";
import { FertilizerDepotPanel } from "@/sections/storage/FertilizerDepotPanel";
import "@/sections/economy/economy.css";

export function FertilizerDepotSection() {
  const payload = useDashboardStore((s) => s.payload);
  const block = payload?.realisticFarming?.fertilizerDepot;

  if (!isFertilizerDepotActive(block)) {
    return (
      <div class="fd-economy__empty">
        <h2>{t("nav.mod.fertilizerdepot")}</h2>
        <p>{tOr("rf.depot.hintDisabled", "Fertilizer Depot is not detected on this save.")}</p>
      </div>
    );
  }

  return (
    <div class="fd-economy">
      <header class="fd-economy__header">
        <h2>{t("nav.mod.fertilizerdepot")}</h2>
        <p class="fd-economy__muted">{t("rf.depot.lead")}</p>
      </header>
      <FertilizerDepotPanel fertilizerDepot={block} variant="page" />
    </div>
  );
}
