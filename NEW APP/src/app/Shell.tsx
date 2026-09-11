import { useEffect, useMemo, useState } from "preact/hooks";
import { SectionRouter } from "@/sections/SectionRouter";
import { SettingsModal } from "@/settings/SettingsModal";
import { PlatformChrome } from "@/platform/PlatformChrome";
import { HelperPanel } from "@/components/ux/HelperPanel";
import { fetchSetupStatus } from "@/lib/setup-status";
import type { SetupStatus } from "@/lib/ux-state";
import { AppTopBar } from "@/app/AppTopBar";
import { ModRequiredBanner } from "@/components/ModRequiredBanner";
import { SectionSidebar } from "@/app/SectionSidebar";
import { SectionErrorBoundary } from "@/app/SectionErrorBoundary";
import { VehicleInspector } from "@/components/VehicleInspector";
import { SECTION_BACKGROUNDS } from "@/app/section-meta";
import { syncSectionFromHash, useDashboardStore, writeDefaultSectionPref } from "@/store/dashboard-store";
import { normalizeSectionId } from "@/types/dashboard";
import { getFarmDashApi } from "@/services/electron-bridge";
import { applyThemeForSection, loadThemes } from "@/settings/theming";
import {
  getDisplayFleet,
  normalizeVehicleList,
  vehicleMatchesDeepLinkId,
  vehicleRowKey,
} from "@/lib/vehicles";
import "@/styles/app-shell.css";

export function Shell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const section = useDashboardStore((s) => s.section);
  const sectionParams = useDashboardStore((s) => s.sectionParams);
  const setSectionParams = useDashboardStore((s) => s.setSectionParams);
  const setSection = useDashboardStore((s) => s.setSection);
  const payload = useDashboardStore((s) => s.payload);
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);
  const locale = useDashboardStore((s) => s.locale);
  const setEnabledSections = useDashboardStore((s) => s.setEnabledSections);

  useEffect(() => {
    const onHash = () => syncSectionFromHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    void fetchSetupStatus().then(setSetupStatus);
    const id = window.setInterval(() => {
      void fetchSetupStatus().then(setSetupStatus);
    }, 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    applyThemeForSection(loadThemes(), section === "overview" ? "global" : section);
  }, [section]);

  useEffect(() => {
    const api = getFarmDashApi();
    if (!api?.getUiPreferences) return;
    void api.getUiPreferences().then((prefs) => {
      if (prefs?.sections) setEnabledSections(prefs.sections);
      if (prefs?.defaultSection) {
        const raw = String(prefs.defaultSection);
        if (raw === "last" || raw === "overview") writeDefaultSectionPref(raw);
        else writeDefaultSectionPref(normalizeSectionId(raw));
      }
    });
  }, [setEnabledSections]);

  const inspectorVehicle = useMemo(() => {
    if (!sectionParams.id) return null;
    if (section !== "vehicles" && section !== "ads" && section !== "map") return null;
    const fleet = getDisplayFleet(payload?.vehicles, activeFarmId ?? 1);
    const all = normalizeVehicleList(payload?.vehicles);
    return (
      fleet.find((v) => vehicleMatchesDeepLinkId(v, sectionParams.id)) ||
      all.find((v) => vehicleMatchesDeepLinkId(v, sectionParams.id)) ||
      null
    );
  }, [payload?.vehicles, activeFarmId, sectionParams.id, section]);

  const showInspector = !!inspectorVehicle && (section === "vehicles" || section === "ads");

  const sectionBg = SECTION_BACKGROUNDS[section];

  return (
    <div class="fd-shell" data-locale={locale}>
      <PlatformChrome />
      <AppTopBar onOpenSettings={() => setSettingsOpen(true)} />
      <HelperPanel
        status={setupStatus}
        onUpdated={setSetupStatus}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <ModRequiredBanner />
      <div class="fd-shell__body">
        <SectionSidebar />
        <main class="fd-main" data-section={section}>
          {sectionBg ? (
            <div
              class="fd-main__bg"
              style={{ backgroundImage: `url('${sectionBg}')` }}
              aria-hidden="true"
            />
          ) : null}
          <div class="fd-main__scrim" aria-hidden="true" />
          <div class="fd-main__content">
            <SectionErrorBoundary key={`${locale}-${section}`}>
              <SectionRouter />
            </SectionErrorBoundary>
          </div>
        </main>
        {showInspector ? (
          <div class={section === "ads" ? "fd-inspector-host fd-inspector--ads" : "fd-inspector-host"}>
            <VehicleInspector
              vehicle={inspectorVehicle}
              onClose={() => setSectionParams({ ...sectionParams, id: undefined })}
              onShowOnMap={() =>
                setSection("map", { id: vehicleRowKey(inspectorVehicle!) })
              }
            />
          </div>
        ) : null}
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
