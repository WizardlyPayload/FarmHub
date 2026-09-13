import { lazy, Suspense } from "preact/compat";
import { t, tOr } from "@/i18n/i18n";
import { useDashboardStore } from "@/store/dashboard-store";
import { OverviewSection } from "@/sections/overview/OverviewSection";

const VehiclesSection = lazy(() =>
  import("@/sections/vehicles/VehiclesSection").then((m) => ({ default: m.VehiclesSection })),
);
const FleetMapSection = lazy(() =>
  import("@/sections/fleet-map/FleetMapSection").then((m) => ({ default: m.FleetMapSection })),
);
const EconomySection = lazy(() =>
  import("@/sections/economy/EconomySection").then((m) => ({ default: m.EconomySection })),
);
const ProductionsSection = lazy(() =>
  import("@/sections/productions/ProductionsSection").then((m) => ({ default: m.ProductionsSection })),
);
const PasturesSection = lazy(() =>
  import("@/sections/pastures/PasturesSection").then((m) => ({ default: m.PasturesSection })),
);
const FieldsSection = lazy(() =>
  import("@/sections/fields").then((m) => ({ default: m.FieldsSection })),
);
const StorageSection = lazy(() =>
  import("@/sections/storage/StorageSection").then((m) => ({ default: m.StorageSection })),
);
const RedTapeSection = lazy(() =>
  import("@/sections/redtape/RedTapeSection").then((m) => ({ default: m.RedTapeSection })),
);
const AdsSection = lazy(() =>
  import("@/sections/ads/AdsSection").then((m) => ({ default: m.AdsSection })),
);
const MoistureSection = lazy(() =>
  import("@/sections/moisture/MoistureSection").then((m) => ({ default: m.MoistureSection })),
);
const InvoicesSection = lazy(() =>
  import("@/sections/invoices").then((m) => ({ default: m.InvoicesSection })),
);
const HirePurchasingSection = lazy(() =>
  import("@/sections/hirepurchasing").then((m) => ({ default: m.HirePurchasingSection })),
);
const NpcFavorSection = lazy(() =>
  import("@/sections/npcfavor").then((m) => ({ default: m.NpcFavorSection })),
);
const WorldEventsSection = lazy(() =>
  import("@/sections/worldevents").then((m) => ({ default: m.WorldEventsSection })),
);
const ProStaffSection = lazy(() =>
  import("@/sections/prostaff").then((m) => ({ default: m.ProStaffSection })),
);
const FertilizerDepotSection = lazy(() =>
  import("@/sections/fertilizerdepot").then((m) => ({ default: m.FertilizerDepotSection })),
);

function SectionFallback() {
  return (
    <div class="fd-section-placeholder" role="status">
      <p>{tOr("splash.loading", "Loading…")}</p>
    </div>
  );
}

export function SectionRouter() {
  const section = useDashboardStore((s) => s.section);

  let body = null;
  if (section === "overview") body = <OverviewSection />;
  else if (section === "livestock" || section === "pastures") body = <PasturesSection />;
  else if (section === "vehicles") body = <VehiclesSection />;
  else if (section === "map") body = <FleetMapSection />;
  else if (section === "productions") body = <ProductionsSection />;
  else if (section === "fields") body = <FieldsSection />;
  else if (section === "economy") body = <EconomySection />;
  else if (section === "storage") body = <StorageSection />;
  else if (section === "redtape") body = <RedTapeSection />;
  else if (section === "ads") body = <AdsSection />;
  else if (section === "invoices") body = <InvoicesSection />;
  else if (section === "hirepurchasing") body = <HirePurchasingSection />;
  else if (section === "npcfavor") body = <NpcFavorSection />;
  else if (section === "worldevents") body = <WorldEventsSection />;
  else if (section === "prostaff") body = <ProStaffSection />;
  else if (section === "fertilizerdepot") body = <FertilizerDepotSection />;
  else if (section === "moisture") body = <MoistureSection />;
  else {
    body = (
      <div class="fd-section-placeholder">
        <h2>{t(`nav.section.${section}`)}</h2>
        <p>{tOr("common.comingSoon", "Section agents will implement full parity here.")}</p>
      </div>
    );
  }

  return <Suspense fallback={<SectionFallback />}>{body}</Suspense>;
}
