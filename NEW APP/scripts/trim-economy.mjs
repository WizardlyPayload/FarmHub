import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "src/sections/economy/EconomySection.tsx");
let src = fs.readFileSync(file, "utf8");
const cut = src.indexOf("\nfunction StorageTab(");
if (cut < 0) {
  console.error("StorageTab not found");
  process.exit(1);
}
src = src.slice(0, cut);

// Slim unused imports that were only for Storage/RedTape
src = src.replace(
  /import \{\n  buildEnrichedStockForFarm[\s\S]*?\} from "@\/lib\/storage";\n/,
  ""
);
src = src.replace(
  /import \{ isRedTapeModActive, type RedTapePayload \} from "@\/lib\/redTape";\n/,
  ""
);
src = src.replace(
  /import \{\n  formatMoisturePercent[\s\S]*?\} from "@\/lib\/moisture";\n/,
  ""
);
src = src.replace(
  /import type \{ EconomyLike, PlaceableLike, StockPayload \} from "@\/lib\/fillTypeResolve";\n/,
  ""
);
src = src.replace(
  /  aggregateConsumables,\n  baleCategoryLabel,\n  BALE_CATEGORY_KEYS,\n/,
  ""
);
src = src.replace(
  /  consumableContainerLabel,\n/,
  ""
);
src = src.replace(
  /  humanizeFillTypeName,\n/,
  ""
);
src = src.replace(
  /  mergeBaleBucketForDisplay,\n/,
  ""
);
src = src.replace(
  /  resolveBaleInventoryForFarm,\n/,
  ""
);
src = src.replace(
  /  sumBaleBucket,\n  sumBalesOnFarmFields,\n/,
  ""
);

const footer = `

export function EconomySection() {
  const payload = useDashboardStore((s) => s.payload);
  const farmId = useDashboardStore((s) => s.activeFarmId) ?? 1;
  const sectionParams = useDashboardStore((s) => s.sectionParams);
  const setSectionParams = useDashboardStore((s) => s.setSectionParams);
  const setSection = useDashboardStore((s) => s.setSection);

  const initialTab = ((): EconomyTab => {
    const raw = sectionParams.tab;
    if (raw === "market" || raw === "purchases") return raw;
    if (raw === "storage") return "market";
    return "market";
  })();
  const [tab, setTab] = useState<EconomyTab>(initialTab);

  useEffect(() => {
    const raw = sectionParams.tab;
    if (raw === "market" || raw === "purchases") setTab(raw);
    if (raw === "storage") {
      setSection("storage");
    }
    if (raw === "redtape") {
      setSection("redtape");
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

  const tabs: Array<{ id: EconomyTab; label: string }> = [
    { id: "market", label: t("economy.tabMarket") },
    { id: "purchases", label: t("economy.tabPurchases") },
    { id: "storage", label: t("economy.tabStorage") },
  ];

  const selectTab = (id: EconomyTab) => {
    if (id === "storage") {
      setSection("storage");
      return;
    }
    setTab(id);
    setSectionParams({ ...sectionParams, tab: id });
  };

  return (
    <div class="fd-economy">
      <header class="fd-economy__header">
        <h2>{t("economy.title")}</h2>
        <p>{t("economy.subtitle")}</p>
      </header>

      <FinanceSummary payload={payload} farmId={farmId} />

      <div class="fd-economy__tabs" role="tablist">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            role="tab"
            aria-selected={tab === tb.id}
            class={\`fd-economy__tab \${tab === tb.id ? "is-active" : ""}\`}
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
`;

fs.writeFileSync(file, src + footer);
console.log("trimmed economy to", (src + footer).length);
