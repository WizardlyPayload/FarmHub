import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(root, "src/sections/economy/EconomySection.tsx"), "utf8");
const start = src.indexOf("function StorageTab(");
const locStart = src.indexOf("function LocationDetails(");
const locEnd = src.indexOf("function RedTapeTab(");
if (start < 0 || locStart < 0 || locEnd < 0) {
  console.error("markers not found", { start, locStart, locEnd });
  process.exit(1);
}
const storageFn = src.slice(start, locStart);
const locFn = src.slice(locStart, locEnd);

const header = `import { Fragment } from "preact";
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
  humanizeFillTypeName,
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
  formatLiters,
  formatMoney,
  formatPricePer1000,
  isStockRowExpanded,
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
import type { EconomyLike, PlaceableLike, StockPayload } from "@/lib/fillTypeResolve";
import "@/sections/economy/economy.css";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

`;

const footer = `
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
      <StorageTab payload={payload} farmId={farmId} consumables={consumables} />
    </div>
  );
}

export { StorageTab };
`;

const out = path.join(root, "src/sections/storage/StorageSection.tsx");
fs.writeFileSync(out, header + storageFn + locFn + footer);
console.log("wrote", out);
