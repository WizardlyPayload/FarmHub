import { useEffect, useRef, useState } from "preact/hooks";
import { t, tOr, getLocale } from "@/i18n/i18n";
import { Badge, Button } from "@/components/ui";
import { fillProviderOwnsUnits, fillUnitOwnerId, unitDisplayFromPayload } from "@/lib/fill-units";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  readDefaultSectionPref,
  writeDefaultSectionPref,
  type DefaultSectionPref,
} from "@/store/dashboard-store";
import { NAV_SECTIONS, normalizeSectionId, type SectionId } from "@/types/dashboard";
import {
  getFarmDashApi,
  type FarmDashConfig,
  type FarmDashConfigServer,
  type FieldExclusionRow,
  type LanAccessSettings,
  type ModConfig,
  type SectionKey,
  type SettingsTabKey,
  type SimHubViewPrefs,
  type UiPreferences,
} from "@/services/electron-bridge";
import {
  displaySaveBody,
  displaySnapshot,
  loadModDraft,
  runSettingsSave,
} from "@/settings/save-domains";
import { isFarmDashLocalConfigHost } from "@/platform/viewer-mode";
import { showToast } from "@/platform/ChangesModal";
import { startModStoreImageExport } from "@/lib/mod-export-progress";
import { discoveryContextFromScan, discoveryFeedback, importDiscoveredSaves } from "@/lib/discovered-save";
import {
  THEME_TABS,
  applyThemeForSection,
  applyThemeVars,
  clearThemesStorage,
  defaultThemes,
  loadThemes,
  saveThemes,
  type ThemeColors,
  type ThemeTab,
  type ThemesMap,
} from "@/settings/theming";
import {
  buildDetectedRfCompatRows,
  buildRfCompatibilityRows,
  countDetectedRfMods,
  type RfCompatRow,
  type RfCompatStatus,
} from "@/lib/realisticFarming/compatibility";
import { HealthPane } from "@/settings/HealthPane";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { applyServersFromSettingsDraft, reloadServersFromApi } from "@/services/ws-client";

const SECTION_KEYS: SectionKey[] = [
  "vehicles",
  "fields",
  "economy",
  "pastures",
  "productions",
  "storage",
];

const MOD_MODULES = [
  "animals",
  "vehicles",
  "weather",
  "fields",
  "finance",
  "economy",
  "production",
] as const;

const LOCALES = [
  "en",
  "de",
  "fr",
  "es",
  "it",
  "pl",
  "nl",
  "pt",
  "cs",
  "da",
  "fi",
  "sv",
  "nb",
  "hu",
  "ro",
  "sk",
  "sl",
  "hr",
  "bg",
  "el",
  "et",
  "lv",
  "lt",
  "uk",
  "ga",
  "mt",
  "is",
];

interface Props {
  open: boolean;
  initialTab?: SettingsTabKey;
  onClose: () => void;
}

export function SettingsModal({ open, initialTab = "dashboard", onClose }: Props) {
  const trapRef = useFocusTrap(open, onClose);
  const [tab, setTab] = useState<SettingsTabKey>(initialTab);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [saveLifecycle, setSaveLifecycle] = useState<"idle" | "pending" | "validated" | "saved" | "synced" | "failed">("idle");
  const [dirty, setDirty] = useState(false);
  const [baseline, setBaseline] = useState("");
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const serversTouchedRef = useRef(false);
  const lanBaselineRef = useRef("");
  const modBaselineRef = useRef("");
  const modRevisionRef = useRef("");
  const connectionBaselineRef = useRef("");
  const displayBaselineRef = useRef("");
  const viewerBaselineRef = useRef("auto");

  const [sections, setSections] = useState<Record<SectionKey, boolean>>(() =>
    Object.fromEntries(SECTION_KEYS.map((k) => [k, true])) as Record<SectionKey, boolean>,
  );
  const [simHub, setSimHub] = useState<SimHubViewPrefs>({
    enabled: false,
    view: "fields",
    fieldClusterIds: [],
    pastureIds: [],
    productionKeys: [],
  });
  const [exclusionRows, setExclusionRows] = useState<FieldExclusionRow[]>([]);
  const [excluded, setExcluded] = useState<Record<string, number[]>>({});
  const [clusterPrefs, setClusterPrefs] = useState<
    Record<string, { autoMerge?: boolean; manualGroups: number[][] }>
  >({});

  const [config, setConfig] = useState<FarmDashConfig | null>(null);
  const [serversDraft, setServersDraft] = useState<FarmDashConfigServer[]>([]);
  const [ftpDelay, setFtpDelay] = useState(0);
  const [ftpInterval, setFtpInterval] = useState(5);
  const [ftpSchedule, setFtpSchedule] = useState<"sync" | "staggered">("sync");
  const [lan, setLan] = useState<LanAccessSettings>({});
  const [lanPassDraft, setLanPassDraft] = useState("");

  const [newServer, setNewServer] = useState<Partial<FarmDashConfigServer>>({
    name: "",
    mode: "local",
    ftpPort: 21,
  });

  const [mod, setMod] = useState<ModConfig>({
    updateInterval: 10000,
    collectionCycleMs: 60000,
    modules: Object.fromEntries(MOD_MODULES.map((m) => [m, true])),
  });

  const [themes, setThemes] = useState<ThemesMap>(() => loadThemes());
  const [themeTab, setThemeTab] = useState<ThemeTab>("global");
  const [themeDraft, setThemeDraft] = useState<ThemeColors>(() => loadThemes().global);
  const [useNewUi, setUseNewUi] = useState(false);
  const [newUiLocked, setNewUiLocked] = useState(false);
  const [defaultSection, setDefaultSection] = useState<DefaultSectionPref>(() =>
    readDefaultSectionPref()
  );

  const [appVersion, setAppVersion] = useState("—");
  const [updateStatus, setUpdateStatus] = useState("");

  const payload = useDashboardStore((s) => s.payload);
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);
  const section = useDashboardStore((s) => s.section);
  const setLocale = useDashboardStore((s) => s.setLocale);
  const locale = useDashboardStore((s) => s.locale);
  const setEnabledSections = useDashboardStore((s) => s.setEnabledSections);
  const setViewerFillUnitMode = useDashboardStore((s) => s.setViewerFillUnitMode);
  const [fillUnitDraft, setFillUnitDraft] = useState<"litres" | "british" | "imperial" | null>(
    useDashboardStore.getState().viewerFillUnitMode,
  );

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) {
      setSettingsHydrated(false);
      setBaseline("");
      setDirty(false);
      setSaveLifecycle("idle");
      serversTouchedRef.current = false;
      return;
    }
    setSettingsHydrated(false);
    serversTouchedRef.current = false;
    setFillUnitDraft(useDashboardStore.getState().viewerFillUnitMode);
    void loadAll().finally(() => setSettingsHydrated(true));
  }, [open]);

  useEffect(() => {
    if (!open || !settingsHydrated) return;
    const snap = JSON.stringify({
      sections,
      serversDraft,
      ftpDelay,
      ftpInterval,
      ftpSchedule,
      lan: { ...lan, lanPassword: lanPassDraft },
      mod,
      useNewUi,
      defaultSection,
      fillUnit: fillUnitDraft ?? "auto",
    });
    if (!baseline) {
      setBaseline(snap);
      setDirty(false);
      return;
    }
    setDirty(snap !== baseline);
  }, [
    open,
    settingsHydrated,
    baseline,
    sections,
    serversDraft,
    ftpDelay,
    ftpInterval,
    ftpSchedule,
    lan,
    lanPassDraft,
    mod,
    useNewUi,
    defaultSection,
    fillUnitDraft,
  ]);

  useEffect(() => {
    setThemeDraft(themes[themeTab] || themes.global);
  }, [themeTab, themes]);

  async function loadAll() {
    const api = getFarmDashApi();
    const loadedThemes = loadThemes();
    setThemes(loadedThemes);
    applyThemeForSection(loadedThemes, section === "overview" ? "global" : section);

    if (!api) {
      setStatus(tOr("settings.browserOnlyHint", "Desktop app required to save server and mod settings."));
      return;
    }

    try {
      const prefs = (await api.getUiPreferences()) as UiPreferences;
      const nextSections = {
        ...Object.fromEntries(SECTION_KEYS.map((k) => [k, true])),
        ...(prefs.sections || {}),
      } as Record<SectionKey, boolean>;
      const nextExcluded = prefs.excludedFarmlandIdsByServer || {};
      const nextClusters = prefs.fieldClusterPrefsByServer || {};
      const nextUseNewUi = prefs.newUiLocked === true ? true : prefs.useNewUi === true;
      const nextLocked = prefs.newUiLocked === true;
      const nextDefault = prefs.defaultSection
        ? prefs.defaultSection === "last" || prefs.defaultSection === "overview"
          ? prefs.defaultSection
          : normalizeSectionId(prefs.defaultSection)
        : readDefaultSectionPref();
      const nextSimHub = {
        enabled: false,
        view: "fields",
        fieldClusterIds: [],
        pastureIds: [],
        productionKeys: [],
        ...(prefs.simHubView || {}),
      } as SimHubViewPrefs;
      setSections(nextSections);
      setExcluded(nextExcluded);
      setClusterPrefs(nextClusters);
      setUseNewUi(nextUseNewUi);
      setNewUiLocked(nextLocked);
      setDefaultSection(nextDefault);
      writeDefaultSectionPref(nextDefault);
      setEnabledSections(prefs.sections || {});
      setSimHub(nextSimHub);
      const fillNow = useDashboardStore.getState().viewerFillUnitMode;
      viewerBaselineRef.current = fillNow ?? "auto";
      displayBaselineRef.current = displaySnapshot({
        sections: nextSections,
        excluded: nextExcluded,
        clusterPrefs: nextClusters,
        simHub: nextSimHub,
        useNewUi: nextUseNewUi,
        newUiLocked: nextLocked,
        defaultSection: nextDefault,
      });

      const cfg = await api.getCurrentConfig();
      setConfig(cfg);
      const loadedServers = Array.isArray(cfg?.servers) ? [...cfg.servers] : [];
      setServersDraft((prev) => {
        if (!serversTouchedRef.current) return loadedServers;
        const byId = new Map<string, FarmDashConfigServer>();
        for (const s of loadedServers) {
          if (s?.id != null) byId.set(String(s.id), s);
        }
        for (const s of prev) {
          if (s?.id != null) byId.set(String(s.id), s);
        }
        return [...byId.values()];
      });
      setFtpDelay(Number(cfg?.ftpPolling?.initialDelaySeconds ?? 0));
      setFtpInterval(Number(cfg?.ftpPolling?.intervalMinutes ?? 5));
      setFtpSchedule((cfg?.ftpPolling?.scheduleMode as "sync" | "staggered") || "sync");
      connectionBaselineRef.current = JSON.stringify({
        servers: loadedServers,
        ftpDelay: Number(cfg?.ftpPolling?.initialDelaySeconds ?? 0),
        ftpInterval: Number(cfg?.ftpPolling?.intervalMinutes ?? 5),
        ftpSchedule: (cfg?.ftpPolling?.scheduleMode as "sync" | "staggered") || "sync",
      });

      const lanSettings = await api.getLanAccessSettings();
      setLan(lanSettings || {});
      setLanPassDraft("");
      lanBaselineRef.current = JSON.stringify({
        lanAccessEnabled: !!lanSettings?.lanAccessEnabled,
        lanUsername: String(lanSettings?.lanUsername || "admin").trim(),
        lanAllowedIPs: String(lanSettings?.lanAllowedIPs || "").trim(),
        lanAuthOptional: !!lanSettings?.lanAuthOptional,
      });

      const modCfg = await api.getModConfig();
      const loadedMod = loadModDraft(modCfg, MOD_MODULES);
      const nextMod = {
        updateInterval: loadedMod.updateInterval,
        collectionCycleMs: loadedMod.collectionCycleMs,
        modules: loadedMod.modules,
        configPath: loadedMod.configPath,
      };
      setMod(nextMod);
      modRevisionRef.current = loadedMod.revision;
      modBaselineRef.current = JSON.stringify({
        updateInterval: nextMod.updateInterval,
        collectionCycleMs: nextMod.collectionCycleMs,
        modules: nextMod.modules,
      });

      try {
        const rows = await api.getFieldExclusionOptions({ activeFarmId });
        setExclusionRows(Array.isArray(rows?.rows) ? rows.rows : []);
      } catch {
        setExclusionRows([]);
      }

      try {
        setAppVersion(String((await api.getDesktopAppVersion()) || "—"));
      } catch {
        setAppVersion("—");
      }

      api.onAppUpdateStatus?.((payload) => {
        const p = payload as { status?: string; message?: string };
        setUpdateStatus(String(p?.message || p?.status || ""));
      });
      setSaveLifecycle("idle");
    } catch (e) {
      console.warn("[settings] load", e);
      setStatus(t("settings.saveFailed"));
    }
  }

  async function saveMain() {
    const api = getFarmDashApi();
    if (!api) {
      showToast(t("settings.saveFailed"), "error");
      return;
    }
    if (!settingsHydrated) {
      showToast(t("settings.saveWaitLoad"), "warning");
      return;
    }
    setBusy(true);
    setStatus("");
    setSaveLifecycle("pending");
    try {
      const displayInput = {
        sections,
        excluded,
        clusterPrefs,
        simHub,
        useNewUi,
        newUiLocked,
        defaultSection,
      };
      const displayNow = displaySnapshot(displayInput);
      const viewerNow = fillUnitDraft ?? "auto";
      const connectionNow = JSON.stringify({
        servers: serversDraft,
        ftpDelay,
        ftpInterval,
        ftpSchedule,
      });
      const modNow = JSON.stringify({
        updateInterval: mod.updateInterval ?? 10000,
        collectionCycleMs: mod.collectionCycleMs ?? 60000,
        modules: mod.modules,
      });
      const lanNow = JSON.stringify({
        lanAccessEnabled: !!lan.lanAccessEnabled,
        lanUsername: String(lan.lanUsername || "admin").trim(),
        lanAllowedIPs: String(lan.lanAllowedIPs || "").trim(),
        lanAuthOptional: !!lan.lanAuthOptional,
      });
      const cfg = config || (await api.getCurrentConfig());
      if (
        connectionNow !== connectionBaselineRef.current &&
        serversDraft.length === 0 &&
        Array.isArray(cfg?.servers) &&
        cfg.servers.length > 0
      ) {
        throw new Error("empty-servers");
      }
      const outcome = await runSettingsSave(
        {
          displayNow,
          displayBaseline: displayBaselineRef.current,
          connectionNow,
          connectionBaseline: connectionBaselineRef.current,
          modNow,
          modBaseline: modBaselineRef.current,
          modRevision: modRevisionRef.current,
          lanNow,
          lanBaseline: lanBaselineRef.current,
          lanSecretPending: lanPassDraft !== "",
          viewerNow,
          viewerBaseline: viewerBaselineRef.current,
        },
        {
          saveDisplay: async () => {
            const res = (await api.saveUiPreferences(displaySaveBody(displayInput) as UiPreferences)) as
              | { ok?: boolean; restartRequired?: boolean; error?: string }
              | undefined;
            if (res && res.ok === false) return res;
            writeDefaultSectionPref(defaultSection);
            setEnabledSections(sections);
            return res ?? { ok: true };
          },
          saveViewer: async () => {
            const stored = setViewerFillUnitMode(fillUnitDraft);
            if (!stored) return { ok: false, error: "fill-unit-storage" };
            return { ok: true };
          },
          saveConnection: async () => {
            const saveRes = await api.saveSettings({
              ...cfg,
              isConfigured: true,
              servers: serversDraft,
              ftpPolling: {
                ...(cfg?.ftpPolling || {}),
                initialDelaySeconds: ftpDelay,
                intervalMinutes: ftpInterval,
                scheduleMode: ftpSchedule,
              },
            });
            if (saveRes && saveRes.ok === false) return saveRes;
            if (saveRes && saveRes.keptExisting) {
              showToast(t("settings.saveKeptExistingSaves"), "warning");
            } else {
              applyServersFromSettingsDraft(serversDraft);
            }
            void reloadServersFromApi().catch(() => {
              /* Top bar already has the draft list; API catch-up is best-effort. */
            });
            return saveRes ?? { ok: true };
          },
          saveMod: async (expectedRevision) =>
            api.saveModConfig({
              updateInterval: mod.updateInterval ?? 10000,
              collectionCycleMs: mod.collectionCycleMs ?? 60000,
              modules: mod.modules,
              expectedRevision,
            }),
          saveLan: async () => {
            const prevLan = await api.getLanAccessSettings();
            return api.saveLanAccessSettings({
              lanAccessEnabled: !!lan.lanAccessEnabled,
              lanUsername: (lan.lanUsername || "admin").trim(),
              lanPassword: lanPassDraft !== "" ? lanPassDraft : prevLan.lanPassword,
              lanAllowedIPs: (lan.lanAllowedIPs || "").trim(),
              lanAuthOptional: !!lan.lanAuthOptional,
            });
          },
        },
      );
      displayBaselineRef.current = outcome.displayBaseline;
      viewerBaselineRef.current = outcome.viewerBaseline;
      connectionBaselineRef.current = outcome.connectionBaseline;
      modBaselineRef.current = outcome.modBaseline;
      modRevisionRef.current = outcome.modRevision;
      lanBaselineRef.current = outcome.lanBaseline;
      if (outcome.clearLanSecret) setLanPassDraft("");
      if (outcome.failed) {
        if (outcome.failed === "mod") {
          const modErr = outcome.error === "malformed-config" || outcome.error === "duplicate-structure"
            ? t("settings.modConfigPreserved")
            : outcome.error === "conflict"
              ? tOr("settings.modConfigConflict", "The game config changed on disk. Reload settings before saving it again.")
              : outcome.error === "unreadable"
                ? tOr("settings.modConfigUnreadable", "The game config could not be read, so it was left unchanged.")
                : (outcome.error || t("settings.saveFailed"));
          showToast(modErr, "warning");
        } else if (outcome.failed === "lan") {
          const code = outcome.error || "";
          const map: Record<string, string> = {
            default_credentials_rejected: t("settings.lanErrDefaultCreds"),
            password_too_short: t("settings.lanErrPasswordTooShort"),
            weak_password: t("settings.lanErrWeakPassword"),
            username_required: t("settings.lanErrUsernameRequired"),
          };
          showToast(map[code] || code || t("settings.saveFailed"), "warning");
        } else if (outcome.failed === "viewer") {
          showToast(t("settings.fillUnitsStorageFailed"), "error");
          if (outcome.committed.length > 0) showToast(t("settings.savePartial"), "warning");
        } else {
          showToast(outcome.error || t("settings.saveFailed"), "error");
        }
        setSaveLifecycle("failed");
        return;
      }
      setSaveLifecycle("synced");
      if (outcome.dirty.length === 0) {
        setDirty(false);
        setBaseline("");
      }
      if (outcome.displayResult?.restartRequired) {
        showToast(t("theme.useNewUiRestart"), "info");
      } else {
        showToast(t("settings.saved"), "success");
      }
      onClose();
    } catch (e) {
      console.warn("[settings] save", e);
      const msg = e instanceof Error ? e.message : String(e);
      showToast(
        msg === "empty-servers" ? t("settings.saveKeptExistingSaves") : t("settings.saveFailed"),
        "error",
      );
      setSaveLifecycle("failed");
    } finally {
      setBusy(false);
    }
  }

  function saveTheme() {
    const next = { ...themes, [themeTab]: { ...themeDraft } };
    setThemes(next);
    saveThemes(next);
    applyThemeVars(themeDraft);
    showToast(tOr("theme.savedToast", "Theme saved."), "success");
  }

  function copyThemeToAll() {
    if (!confirm(tOr("theme.copyAllConfirm", "Overwrite ALL tabs with these colors?"))) return;
    const next = defaultThemes();
    for (const key of THEME_TABS) next[key] = { ...themeDraft };
    setThemes(next);
    saveThemes(next);
    applyThemeVars(themeDraft);
  }

  function resetThemes() {
    if (!confirm(tOr("theme.resetConfirm", "Reset all colors back to default?"))) return;
    clearThemesStorage();
    const next = defaultThemes();
    setThemes(next);
    setThemeDraft(next.global);
    applyThemeVars(next.global);
  }

  if (!open) return null;

  if (!isFarmDashLocalConfigHost()) {
    return (
      <div class="fd-modal-backdrop" onClick={onClose}>
        <div class="fd-modal fd-modal--narrow fd-settings-modal" onClick={(e) => e.stopPropagation()}>
          <div class="fd-modal__header">
            <h2>{t("settings.unifiedModalTitle")}</h2>
            <Button variant="ghost" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
          <div class="fd-modal__body">
            <p>
              {tOr(
                "settings.remoteBlocked",
                "Server and save setup is only available on the PC running Farm Dashboard.",
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const showSave = tab !== "about" && tab !== "health";

  return (
    <div class="fd-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        class="fd-modal fd-settings-modal"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="fd-modal__header">
          <h2 id="fd-settings-title">{t("settings.unifiedModalTitle")}</h2>
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
        <div class="fd-settings">
          <nav class="fd-settings__nav" aria-label={t("settings.unifiedModalTitle")}>
            {(
              [
                ["dashboard", "settings.sidebarDashboard"],
                ["servers", "settings.sidebarServers"],
                ["mod", "settings.sidebarMod"],
                ["theme", "settings.sidebarAppearance"],
                ["health", "settings.tabHealth"],
                ["about", "settings.sidebarAbout"],
              ] as Array<[SettingsTabKey, string]>
            ).map(([key, labelKey]) => (
              <button
                key={key}
                type="button"
                class={tab === key ? "is-active" : ""}
                onClick={() => setTab(key)}
              >
                {t(labelKey)}
              </button>
            ))}
          </nav>
          <div class="fd-settings__pane">
            {tab === "dashboard" ? (
              <DashboardPane
                sections={sections}
                setSections={setSections}
                defaultSection={defaultSection}
                setDefaultSection={setDefaultSection}
                simHub={simHub}
                setSimHub={setSimHub}
                exclusionRows={exclusionRows}
                excluded={excluded}
                setExcluded={setExcluded}
                clusterPrefs={clusterPrefs}
                setClusterPrefs={setClusterPrefs}
                fillUnitDraft={fillUnitDraft}
                setFillUnitDraft={setFillUnitDraft}
                unitDisplay={unitDisplayFromPayload(payload)}
              />
            ) : null}
            {tab === "servers" ? (
              <ServersPane
                ready={settingsHydrated}
                serversDraft={serversDraft}
                setServersDraft={(next) => {
                  serversTouchedRef.current = true;
                  setServersDraft(next);
                }}
                ftpDelay={ftpDelay}
                setFtpDelay={setFtpDelay}
                ftpInterval={ftpInterval}
                setFtpInterval={setFtpInterval}
                ftpSchedule={ftpSchedule}
                setFtpSchedule={setFtpSchedule}
                lan={lan}
                setLan={setLan}
                lanPassDraft={lanPassDraft}
                setLanPassDraft={setLanPassDraft}
                newServer={newServer}
                setNewServer={setNewServer}
              />
            ) : null}
            {tab === "mod" ? <ModPane mod={mod} setMod={setMod} /> : null}
            {tab === "theme" ? (
              <ThemePane
                themeTab={themeTab}
                setThemeTab={setThemeTab}
                themeDraft={themeDraft}
                setThemeDraft={setThemeDraft}
                locale={locale}
                useNewUi={useNewUi}
                newUiLocked={newUiLocked}
                setUseNewUi={setUseNewUi}
                onLocale={(code) => {
                  setLocale(code);
                  getFarmDashApi()?.setStoredLocale?.(code);
                  showToast(tOr("theme.languageSaved", "Language saved. Reload to apply fully."), "info");
                }}
                onCopyAll={copyThemeToAll}
                onReset={resetThemes}
              />
            ) : null}
            {tab === "health" ? (
              <HealthPane
                appVersion={appVersion}
                onRestoreLan={() => {
                  void (async () => {
                    const api = getFarmDashApi();
                    if (!api?.restoreLanDefaults) return;
                    const res = await api.restoreLanDefaults();
                    if (res?.ok) {
                      const lanSettings = await api.getLanAccessSettings();
                      setLan(lanSettings || {});
                      showToast(t("ux.lan.restoreDefault"), "success");
                    } else {
                      showToast(t("settings.saveFailed"), "error");
                    }
                  })();
                }}
              />
            ) : null}
            {tab === "about" ? (
              <AboutPane
                appVersion={appVersion}
                payload={payload}
                updateStatus={updateStatus}
                onCheckUpdates={async () => {
                  const api = getFarmDashApi();
                  if (!api) return;
                  setUpdateStatus(t("settings.updateStatusChecking"));
                  try {
                    const res = await api.checkDesktopAppUpdates();
                    if (res?.reason === "dev") setUpdateStatus(t("settings.updateStatusDev"));
                    else if (res?.ok === false) setUpdateStatus(t("settings.updateStatusError"));
                  } catch {
                    setUpdateStatus(t("settings.updateStatusError"));
                  }
                }}
              />
            ) : null}
            {status ? <p class="fd-settings__hint">{status}</p> : null}
          </div>
        </div>
        <div class="fd-modal__footer">
          {dirty ? (
            <span class="fd-save-lifecycle">
              <span class="fd-unsaved-dot" aria-hidden="true" /> {t("ux.save.unsaved")}
            </span>
          ) : null}
          {saveLifecycle !== "idle" ? (
            <span class="fd-save-lifecycle">{t(`ux.save.${saveLifecycle}`)}</span>
          ) : null}
          {tab === "theme" ? (
            <Button onClick={saveTheme}>{t("theme.save")}</Button>
          ) : null}
          {showSave ? (
            <Button
              onClick={() => void saveMain()}
              disabled={busy || !settingsHydrated}
              aria-busy={busy}
            >
              {busy
                ? t("settings.saving")
                : !settingsHydrated
                  ? t("settings.saveWaitLoad")
                  : t("settings.save")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DashboardPane(props: {
  sections: Record<SectionKey, boolean>;
  setSections: (s: Record<SectionKey, boolean>) => void;
  defaultSection: DefaultSectionPref;
  setDefaultSection: (s: DefaultSectionPref) => void;
  simHub: SimHubViewPrefs;
  setSimHub: (s: SimHubViewPrefs) => void;
  exclusionRows: FieldExclusionRow[];
  excluded: Record<string, number[]>;
  setExcluded: (e: Record<string, number[]>) => void;
  clusterPrefs: Record<string, { autoMerge?: boolean; manualGroups: number[][] }>;
  setClusterPrefs: (
    c: Record<string, { autoMerge?: boolean; manualGroups: number[][] }>,
  ) => void;
  fillUnitDraft: "litres" | "british" | "imperial" | null;
  setFillUnitDraft: (mode: "litres" | "british" | "imperial" | null) => void;
  unitDisplay: Parameters<typeof fillProviderOwnsUnits>[0];
}) {
  const {
    sections,
    setSections,
    defaultSection,
    setDefaultSection,
    simHub,
    setSimHub,
    exclusionRows,
    excluded,
    setExcluded,
    clusterPrefs,
    setClusterPrefs,
    fillUnitDraft,
    setFillUnitDraft,
    unitDisplay,
  } = props;
  const unitOwner = fillUnitOwnerId(unitDisplay);
  const providerOwns = fillProviderOwnsUnits(unitDisplay);

  const serverIds = Array.from(
    new Set(exclusionRows.map((r) => String(r.serverId || "default")).filter(Boolean)),
  );

  const defaultOptions: Array<{ value: string; label: string }> = [
    { value: "last", label: t("settings.defaultSectionLast") },
    { value: "overview", label: t("nav.overview") },
    ...NAV_SECTIONS.filter((id) => id !== "overview").map((id) => ({
      value: id,
      label: t(`nav.section.${id === "map" ? "map" : id}`),
    })),
  ];

  return (
    <>
      <h3>{t("settings.sectionsTitle")}</h3>
      <p class="fd-settings__hint">{t("settings.sectionsHint")}</p>
      {SECTION_KEYS.map((key) => (
        <label class="fd-check" key={key}>
          <input
            type="checkbox"
            checked={sections[key] !== false}
            onChange={(e) =>
              setSections({ ...sections, [key]: (e.target as HTMLInputElement).checked })
            }
          />
          {t(`card.${key}`)}
        </label>
      ))}

      <h3 style={{ marginTop: "1.25rem" }}>{t("settings.defaultSectionTitle")}</h3>
      <p class="fd-settings__hint">{t("settings.defaultSectionHint")}</p>
      <label class="fd-settings__field">
        <span>{t("settings.defaultSectionLabel")}</span>
        <select
          value={String(defaultSection)}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            if (v === "last" || v === "overview") setDefaultSection(v);
            else setDefaultSection(normalizeSectionId(v) as SectionId);
          }}
        >
          {defaultOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <h3 style={{ marginTop: "1.25rem" }}>{t("settings.fillUnitsTitle")}</h3>
      <p class="fd-settings__hint">{t("settings.fillUnitsHintManualFirst")}</p>
      <label class="fd-settings__field">
        <span>{t("settings.fillUnitsLabel")}</span>
        <select
          aria-label={t("settings.fillUnitsLabel")}
          value={fillUnitDraft ?? "auto"}
          onChange={(e) => {
            const value = (e.target as HTMLSelectElement).value;
            if (value === "litres" || value === "british" || value === "imperial") setFillUnitDraft(value);
            else setFillUnitDraft(null);
          }}
        >
          <option value="auto">{t("settings.fillUnitsAuto")}</option>
          <option value="litres">{t("settings.fillUnitsLitres")}</option>
          <option value="british">{t("settings.fillUnitsBritish")}</option>
          <option value="imperial">{t("settings.fillUnitsImperial")}</option>
        </select>
      </label>
      {providerOwns ? (
        <p class="fd-settings__hint" data-fill-unit-owner={fillUnitDraft == null ? "mod" : "viewer"}>
          {fillUnitDraft == null
            ? t("settings.fillUnitsFollowingMod", { provider: unitOwner || "" })
            : t("settings.fillUnitsManualOverMod", { provider: unitOwner || "" })}
        </p>
      ) : null}

      <h3 style={{ marginTop: "1.25rem" }}>{t("settings.fieldExclusionTitle")}</h3>
      <p class="fd-settings__hint">{t("settings.fieldExclusionHint")}</p>
      {exclusionRows.length === 0 ? (
        <p class="fd-settings__hint">{t("settings.fieldExclusionEmpty")}</p>
      ) : (
        exclusionRows.map((row) => {
          const sid = String(row.serverId || "default");
          const fid = Number(row.farmlandId);
          const list = excluded[sid] || [];
          const checked = list.includes(fid);
          return (
            <label class="fd-check" key={`${sid}-${fid}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const on = (e.target as HTMLInputElement).checked;
                  const next = { ...excluded };
                  const cur = new Set(next[sid] || []);
                  if (on) cur.add(fid);
                  else cur.delete(fid);
                  next[sid] = Array.from(cur);
                  setExcluded(next);
                }}
              />
              {row.label || row.name || `Farmland ${fid}`} — {t("settings.fieldExclusionHide")}
            </label>
          );
        })
      )}

      <h3 style={{ marginTop: "1.25rem" }}>{t("settings.fieldClusterTitle")}</h3>
      <p class="fd-settings__hint">{t("settings.fieldClusterHint")}</p>
      {serverIds.length === 0 ? (
        <p class="fd-settings__hint">{t("settings.fieldClusterEmpty")}</p>
      ) : (
        serverIds.map((sid) => {
          const pref = clusterPrefs[sid] || { autoMerge: false, manualGroups: [] };
          return (
            <div key={sid} style={{ marginBottom: "0.75rem" }}>
              <div class="fd-form-row">
                <label>{t("settings.fieldClusterManualLabel")} ({sid})</label>
                <textarea
                  rows={3}
                  value={(pref.manualGroups || [])
                    .map((g) => g.join(","))
                    .join("\n")}
                  onInput={(e) => {
                    const text = (e.target as HTMLTextAreaElement).value;
                    const manualGroups = text
                      .split("\n")
                      .map((line) =>
                        line
                          .split(/[,;\s]+/)
                          .map((n) => parseInt(n, 10))
                          .filter((n) => Number.isFinite(n) && n > 0),
                      )
                      .filter((g) => g.length > 0);
                    setClusterPrefs({
                      ...clusterPrefs,
                      [sid]: { ...pref, autoMerge: false, manualGroups },
                    });
                  }}
                />
              </div>
            </div>
          );
        })
      )}

      <h3 style={{ marginTop: "1.25rem" }}>{t("settings.simHubTitle")}</h3>
      <p class="fd-settings__hint">{t("settings.simHubHint")}</p>
      <label class="fd-check">
        <input
          type="checkbox"
          checked={!!simHub.enabled}
          onChange={(e) => setSimHub({ ...simHub, enabled: (e.target as HTMLInputElement).checked })}
        />
        {t("settings.simHubEnable")}
      </label>
      <div class="fd-form-row">
        <label>{t("settings.simHubViewLabel")}</label>
        <select
          value={simHub.view || "fields"}
          onChange={(e) =>
            setSimHub({
              ...simHub,
              view: (e.target as HTMLSelectElement).value as SimHubViewPrefs["view"],
            })
          }
        >
          <option value="fields">{t("settings.simHubViewFields")}</option>
          <option value="pastures">{t("settings.simHubViewPastures")}</option>
          <option value="production">{t("settings.simHubViewProduction")}</option>
        </select>
      </div>
      <div class="fd-form-row">
        <label>{t("settings.simHubClustersLabel")}</label>
        <textarea
          rows={2}
          value={(simHub.fieldClusterIds || []).join("\n")}
          onInput={(e) =>
            setSimHub({
              ...simHub,
              fieldClusterIds: (e.target as HTMLTextAreaElement).value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
        <span class="fd-settings__hint">{t("settings.simHubClustersHelp")}</span>
      </div>
      <div class="fd-form-row">
        <label>{t("settings.simHubPastureIds")}</label>
        <input
          type="text"
          value={(simHub.pastureIds || []).join(", ")}
          onInput={(e) =>
            setSimHub({
              ...simHub,
              pastureIds: (e.target as HTMLInputElement).value
                .split(/[,;\s]+/)
                .map((n) => parseInt(n, 10))
                .filter((n) => Number.isFinite(n)),
            })
          }
        />
      </div>
      <div class="fd-form-row">
        <label>{t("settings.simHubProductionKeys")}</label>
        <textarea
          rows={2}
          value={(simHub.productionKeys || []).join("\n")}
          onInput={(e) =>
            setSimHub({
              ...simHub,
              productionKeys: (e.target as HTMLTextAreaElement).value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <p class="fd-settings__hint">
        {t("settings.simHubUrl")}{" "}
        <code>
          {typeof location !== "undefined" ? `${location.origin}/simhub.html` : "/simhub.html"}
        </code>
      </p>
    </>
  );
}

function ServersPane(props: {
  ready: boolean;
  serversDraft: FarmDashConfigServer[];
  setServersDraft: (s: FarmDashConfigServer[]) => void;
  ftpDelay: number;
  setFtpDelay: (n: number) => void;
  ftpInterval: number;
  setFtpInterval: (n: number) => void;
  ftpSchedule: "sync" | "staggered";
  setFtpSchedule: (m: "sync" | "staggered") => void;
  lan: LanAccessSettings;
  setLan: (l: LanAccessSettings) => void;
  lanPassDraft: string;
  setLanPassDraft: (s: string) => void;
  newServer: Partial<FarmDashConfigServer>;
  setNewServer: (s: Partial<FarmDashConfigServer>) => void;
}) {
  const {
    ready,
    serversDraft,
    setServersDraft,
    ftpDelay,
    setFtpDelay,
    ftpInterval,
    setFtpInterval,
    ftpSchedule,
    setFtpSchedule,
    lan,
    setLan,
    lanPassDraft,
    setLanPassDraft,
    newServer,
    setNewServer,
  } = props;

  async function detectSaves() {
    if (!ready) return;
    const api = getFarmDashApi();
    if (!api) {
      showToast(t("setup.toastAutoDetectPcOnly"), "info");
      return;
    }
    try {
      const result = await api.scanLocalSaves();
      const saves = Array.isArray(result)
        ? result
        : Array.isArray((result as { saves?: unknown[] })?.saves)
          ? (result as { saves: Array<Record<string, unknown>> }).saves
          : [];
      if (!saves.length) {
        showToast(t("setup.toastNoDataJson", { extra: "" }), "warning");
        return;
      }
      const imported = importDiscoveredSaves(
        serversDraft,
        saves as Array<Record<string, unknown>>,
        discoveryContextFromScan(result),
      );
      const feedback = discoveryFeedback(imported, saves.length > 0);
      if (feedback === "recovery") {
        if (imported.added.length) setServersDraft([...serversDraft, ...imported.added]);
        showToast(tOr("setup.toastRegistrationRecovery", "Replica registration could not be read. Those replica sources were not added, and the registration file was left unchanged."), "warning");
        return;
      }
      if (feedback === "conflict") {
        if (imported.added.length) setServersDraft([...serversDraft, ...imported.added]);
        showToast(tOr("setup.toastSourceConflict", "A discovered source conflicts with one already configured. It was not added, and the existing source was left unchanged."), "warning");
        return;
      }
      if (feedback === "unresolved") {
        showToast(tOr("setup.toastSourceUnresolved", "The default save location could not be resolved, so matching sources were not added."), "warning");
        return;
      }
      const added = imported.added;
      if (!added.length) {
        showToast(t("setup.toastAllDetected"), "info");
        return;
      }
      setServersDraft([...serversDraft, ...added]);
      showToast(
        added.length === 1
          ? t("setup.toastImportedSavesOne", { count: added.length })
          : t("setup.toastImportedSavesMany", { count: added.length }),
        "success",
      );
    } catch (e) {
      showToast(t("setup.toastScanError", { msg: String(e) }), "error");
    }
  }

  function addServer() {
    if (!ready) return;
    const name = String(newServer.name || "").trim();
    if (!name) {
      showToast(t("setup.toastPleaseEnterName"), "warning");
      return;
    }
    if (newServer.mode === "ftp") {
      if (!newServer.ftpHost || !newServer.ftpUser || !newServer.ftpPass) {
        showToast(t("setup.toastFtpRequired"), "warning");
        return;
      }
    }
    const srv: FarmDashConfigServer = {
      id: `srv_${Date.now()}`,
      name,
      mode: newServer.mode || "local",
      localPath: newServer.localPath,
      localSubFolder: newServer.localSubFolder,
      ftpHost: newServer.ftpHost,
      ftpPort: newServer.ftpPort || 21,
      ftpUser: newServer.ftpUser,
      ftpPass: newServer.ftpPass,
      ftpBasePath: newServer.ftpBasePath,
      httpFeedHost: newServer.httpFeedHost,
      httpFeedPort: newServer.httpFeedPort,
      httpFeedCode: newServer.httpFeedCode,
    };
    setServersDraft([...serversDraft, srv]);
    setNewServer({ name: "", mode: newServer.mode || "local", ftpPort: 21 });
    showToast(t("setup.toastServerAdded", { name }), "success");
  }

  return (
    <>
      <h3>{t("settings.lanTitle")}</h3>
      <p>
        <Badge
          tone={
            !lan.lanAccessEnabled ? "accent" : lan.lanAuthOptional ? "danger" : "warn"
          }
          title={!lan.lanAccessEnabled ? t("ux.lan.secureDefault") : undefined}
        >
          {!lan.lanAccessEnabled
            ? t("ux.lan.localOnly")
            : lan.lanAuthOptional
              ? t("ux.lan.exposedHigh")
              : t("ux.lan.exposedAuth")}
        </Badge>
      </p>
      <p class="fd-settings__hint" dangerouslySetInnerHTML={{ __html: t("settings.lanIntro") }} />
      {lan.lanAuthOptional ? (
        <div class="fd-banner-warn">{t("settings.lanAuthOptionalBanner")}</div>
      ) : null}
      <label class="fd-check">
        <input
          type="checkbox"
          checked={!!lan.lanAccessEnabled}
          onChange={(e) => {
            const on = (e.target as HTMLInputElement).checked;
            if (on && !lan.lanAccessEnabled && !confirm(t("ux.lan.confirmEnable"))) {
              (e.target as HTMLInputElement).checked = false;
              return;
            }
            setLan({ ...lan, lanAccessEnabled: on });
          }}
        />
        {t("settings.lanEnableLabel")}
      </label>
      <div class="fd-form-row">
        <label>{t("settings.lanUserLabel")}</label>
        <input
          type="text"
          value={lan.lanUsername || ""}
          onInput={(e) => setLan({ ...lan, lanUsername: (e.target as HTMLInputElement).value })}
        />
      </div>
      <div class="fd-form-row">
        <label>{t("settings.lanPassLabel")}</label>
        <input
          type="password"
          placeholder={t("settings.lanPassPlaceholder")}
          value={lanPassDraft}
          onInput={(e) => setLanPassDraft((e.target as HTMLInputElement).value)}
        />
      </div>
      <div class="fd-form-row">
        <label>{t("settings.lanAllowedIpsLabel")}</label>
        <input
          type="text"
          placeholder={t("settings.lanAllowedIpsPlaceholder")}
          value={lan.lanAllowedIPs || ""}
          onInput={(e) => setLan({ ...lan, lanAllowedIPs: (e.target as HTMLInputElement).value })}
        />
        <span class="fd-settings__hint">{t("settings.lanAllowedIpsHelp")}</span>
      </div>
      <label class="fd-check">
        <input
          type="checkbox"
          checked={!!lan.lanAuthOptional}
          onChange={(e) => {
            const on = (e.target as HTMLInputElement).checked;
            if (on && !confirm(t("settings.lanAuthOptionalWarn"))) {
              (e.target as HTMLInputElement).checked = false;
              return;
            }
            setLan({ ...lan, lanAuthOptional: on });
          }}
        />
        {t("settings.lanAuthOptional")}
      </label>
      <p class="fd-settings__hint">{t("settings.lanAuthOptionalHint")}</p>
      <p>
        <Button
          variant="ghost"
          onClick={() => setLan({ ...lan, lanAccessEnabled: false, lanAuthOptional: false })}
        >
          {t("ux.lan.restoreDefault")}
        </Button>
      </p>

      <h3 style={{ marginTop: "1.25rem" }}>{t("setup.dedicatedJoinTitle")}</h3>
      <p class="fd-settings__hint">{t("setup.dedicatedJoinIntro")}</p>
      <ol class="fd-settings__hint" style={{ paddingLeft: "1.25rem", margin: "0.5rem 0 1rem" }}>
        <li>{t("setup.dedicatedJoinStep1")}</li>
        <li>{t("setup.dedicatedJoinStep2")}</li>
        <li>{t("setup.dedicatedJoinStep3")}</li>
        <li>{t("setup.dedicatedJoinStep4")}</li>
        <li>{t("setup.dedicatedJoinStep5")}</li>
      </ol>
      <p class="fd-settings__hint">{t("setup.dedicatedJoinLimits")}</p>

      <h3 style={{ marginTop: "1.25rem" }}>{t("setup.ftpAdvancedTitle")}</h3>
      <p class="fd-settings__hint">{t("setup.ftpPollHint")}</p>
      <div class="fd-form-row">
        <label>{t("setup.delayLabel")}</label>
        <input
          type="number"
          min={0}
          max={600}
          value={ftpDelay}
          onInput={(e) => setFtpDelay(Number((e.target as HTMLInputElement).value))}
        />
      </div>
      <div class="fd-form-row">
        <label>{t("setup.pollLabel")}</label>
        <input
          type="number"
          min={1}
          max={25}
          value={ftpInterval}
          onInput={(e) => setFtpInterval(Number((e.target as HTMLInputElement).value))}
        />
      </div>
      <div class="fd-radio-row">
        <label class="fd-check">
          <input
            type="radio"
            name="ftp-sched"
            checked={ftpSchedule === "sync"}
            onChange={() => setFtpSchedule("sync")}
          />
          {t("setup.scheduleSync")}
        </label>
        <label class="fd-check">
          <input
            type="radio"
            name="ftp-sched"
            checked={ftpSchedule === "staggered"}
            onChange={() => setFtpSchedule("staggered")}
          />
          {t("setup.scheduleStaggered")}
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", margin: "0.75rem 0" }}>
        <Button
          variant="ghost"
          onClick={() => {
            getFarmDashApi()?.openSetup?.();
          }}
        >
          {t("settings.openFullSetup")}
        </Button>
        <Button variant="ghost" onClick={() => void detectSaves()} disabled={!ready}>
          {t("setup.detectIdle")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (!getFarmDashApi()?.exportModStoreImages) {
              showToast(t("setup.toastModScanPcOnly"), "info");
              return;
            }
            void startModStoreImageExport().catch((err) =>
              showToast(t("setup.toastModImagesError", { msg: String(err) }), "error"),
            );
          }}
        >
          {t("setup.modImages")}
        </Button>
      </div>

      <h3>{t("setup.serverManager")}</h3>
      <ul class="fd-server-list">
        {serversDraft.map((s) => (
          <li key={s.id}>
            <span>
              <strong>{s.name}</strong>{" "}
              <span class="fd-settings__hint">
                {s.mode === "ftp"
                  ? t("setup.serverInfoFtp", { host: s.ftpHost || "", extra: "" })
                  : t("setup.serverInfoLocal", {
                      detail: s.localSubFolder || s.localPath || "—",
                    })}
              </span>
              {s.mode !== "ftp" && (s.replicaRemoteSlot || s.replicaRegistration) ? (
                <span class="fd-settings__hint" title={t("replicaLink.badgeHint")}>
                  {" · "}
                  {t("replicaLink.badge")}
                </span>
              ) : null}
            </span>
            <Button
              variant="ghost"
              disabled={!ready}
              onClick={() => setServersDraft(serversDraft.filter((x) => x.id !== s.id))}
            >
              {tOr("common.remove", "Remove")}
            </Button>
          </li>
        ))}
      </ul>

      <div class="fd-form-row">
        <label>{tOr("setup.displayName", "Display name")}</label>
        <input
          type="text"
          value={newServer.name || ""}
          onInput={(e) => setNewServer({ ...newServer, name: (e.target as HTMLInputElement).value })}
        />
      </div>
      <div class="fd-radio-row">
        <label class="fd-check">
          <input
            type="radio"
            name="srv-mode"
            checked={(newServer.mode || "local") === "local"}
            onChange={() => setNewServer({ ...newServer, mode: "local" })}
          />
          {t("setup.modeLocal")}
        </label>
        <label class="fd-check">
          <input
            type="radio"
            name="srv-mode"
            checked={newServer.mode === "ftp"}
            onChange={() => setNewServer({ ...newServer, mode: "ftp" })}
          />
          {t("setup.modeFtp")}
        </label>
      </div>
      {(newServer.mode || "local") === "local" ? (
        <>
          <div class="fd-form-row">
            <label>{t("setup.localPath")}</label>
            <input
              type="text"
              value={newServer.localPath || ""}
              onInput={(e) =>
                setNewServer({ ...newServer, localPath: (e.target as HTMLInputElement).value })
              }
            />
          </div>
          <div class="fd-form-row">
            <label>{tOr("setup.localSubFolder", "Save subfolder")}</label>
            <input
              type="text"
              value={newServer.localSubFolder || ""}
              onInput={(e) =>
                setNewServer({ ...newServer, localSubFolder: (e.target as HTMLInputElement).value })
              }
            />
          </div>
        </>
      ) : (
        <>
          <div class="fd-form-row">
            <label>{t("setup.ftpHost")}</label>
            <input
              type="text"
              value={newServer.ftpHost || ""}
              onInput={(e) =>
                setNewServer({ ...newServer, ftpHost: (e.target as HTMLInputElement).value })
              }
            />
          </div>
          <div class="fd-form-row">
            <label>{t("setup.ftpPort")}</label>
            <input
              type="number"
              value={Number(newServer.ftpPort || 21)}
              onInput={(e) =>
                setNewServer({ ...newServer, ftpPort: Number((e.target as HTMLInputElement).value) })
              }
            />
          </div>
          <div class="fd-form-row">
            <label>{t("setup.ftpUser")}</label>
            <input
              type="text"
              value={newServer.ftpUser || ""}
              onInput={(e) =>
                setNewServer({ ...newServer, ftpUser: (e.target as HTMLInputElement).value })
              }
            />
          </div>
          <div class="fd-form-row">
            <label>{t("setup.ftpPass")}</label>
            <input
              type="password"
              value={newServer.ftpPass || ""}
              onInput={(e) =>
                setNewServer({ ...newServer, ftpPass: (e.target as HTMLInputElement).value })
              }
            />
          </div>
        </>
      )}
      <Button onClick={addServer} disabled={!ready}>
        {tOr("setup.addServer", "Add server")}
      </Button>
      <p class="fd-settings__hint" style={{ marginTop: "1rem" }}>
        {t("settings.serverManagerIntro")}
      </p>
    </>
  );
}

function ModPane(props: { mod: ModConfig; setMod: (m: ModConfig) => void }) {
  const { mod, setMod } = props;
  return (
    <>
      <h3>{t("settings.modTitle")}</h3>
      <p class="fd-settings__hint">{t("settings.modHint")}</p>
      {mod.configPath ? (
        <p class="fd-settings__hint">
          <code>{mod.configPath}</code>
        </p>
      ) : null}
      <div class="fd-form-row">
        <label>{t("settings.updateInterval")}</label>
        <input
          type="number"
          value={mod.updateInterval ?? 10000}
          onInput={(e) =>
            setMod({ ...mod, updateInterval: Number((e.target as HTMLInputElement).value) })
          }
        />
      </div>
      <div class="fd-form-row">
        <label>{t("settings.collectionCycle")}</label>
        <input
          type="number"
          value={mod.collectionCycleMs ?? 60000}
          onInput={(e) =>
            setMod({ ...mod, collectionCycleMs: Number((e.target as HTMLInputElement).value) })
          }
        />
      </div>
      <h3>{t("settings.modModules")}</h3>
      {MOD_MODULES.map((key) => {
        const labelKey =
          key === "animals"
            ? "settings.modAnimals"
            : key === "vehicles"
              ? "settings.modVehicles"
              : key === "weather"
                ? "settings.modWeather"
                : key === "fields"
                  ? "settings.modFields"
                  : key === "finance"
                    ? "settings.modFinance"
                    : key === "economy"
                      ? "settings.modEconomy"
                      : "settings.modProduction";
        return (
          <label class="fd-check" key={key}>
            <input
              type="checkbox"
              checked={mod.modules?.[key] !== false}
              onChange={(e) =>
                setMod({
                  ...mod,
                  modules: { ...mod.modules, [key]: (e.target as HTMLInputElement).checked },
                })
              }
            />
            {t(labelKey)}
          </label>
        );
      })}
    </>
  );
}

function ThemePane(props: {
  themeTab: ThemeTab;
  setThemeTab: (t: ThemeTab) => void;
  themeDraft: ThemeColors;
  setThemeDraft: (c: ThemeColors) => void;
  locale: string;
  useNewUi: boolean;
  newUiLocked: boolean;
  setUseNewUi: (v: boolean) => void;
  onLocale: (code: string) => void;
  onCopyAll: () => void;
  onReset: () => void;
}) {
  const {
    themeTab,
    setThemeTab,
    themeDraft,
    setThemeDraft,
    locale,
    useNewUi,
    newUiLocked,
    setUseNewUi,
    onLocale,
    onCopyAll,
    onReset,
  } = props;
  const tabLabels: Record<ThemeTab, string> = {
    global: t("theme.tabGlobal"),
    vehicles: t("theme.tabVehicles"),
    fields: t("theme.tabFields"),
    economy: t("theme.tabEconomy"),
    pastures: t("theme.tabPastures"),
  };

  return (
    <>
      <h3>{t("theme.language")}</h3>
      <div class="fd-form-row">
        <select value={locale || getLocale()} onChange={(e) => onLocale((e.target as HTMLSelectElement).value)}>
          {LOCALES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>
      <h3 style={{ marginTop: "1.25rem" }}>{t("theme.dashboardUi")}</h3>
      {newUiLocked ? (
        <p class="fd-settings__hint">{t("theme.newUiLockedHint")}</p>
      ) : (
        <>
          <label class="fd-check">
            <input
              type="checkbox"
              checked={useNewUi}
              onChange={(e) => setUseNewUi((e.target as HTMLInputElement).checked)}
            />
            {t("theme.useNewUi")}
          </label>
          <p class="fd-settings__hint">{t("theme.useNewUiHint")}</p>
        </>
      )}
      <h3>{t("theme.selectTab")}</h3>
      <div class="fd-form-row">
        <select
          value={themeTab}
          onChange={(e) => setThemeTab((e.target as HTMLSelectElement).value as ThemeTab)}
        >
          {THEME_TABS.map((tab) => (
            <option key={tab} value={tab}>
              {tabLabels[tab]}
            </option>
          ))}
        </select>
      </div>
      <div class="fd-color-grid">
        {(
          [
            ["bg", "theme.bg"],
            ["panel", "theme.panel"],
            ["primary", "theme.primary"],
            ["accent", "theme.accent"],
          ] as Array<[keyof ThemeColors, string]>
        ).map(([key, label]) => (
          <div class="fd-form-row" key={key}>
            <label>{t(label)}</label>
            <input
              type="color"
              value={themeDraft[key]}
              onInput={(e) =>
                setThemeDraft({ ...themeDraft, [key]: (e.target as HTMLInputElement).value })
              }
            />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
        <Button variant="ghost" onClick={onCopyAll}>
          {t("theme.copyAll")}
        </Button>
        <Button variant="ghost" onClick={onReset}>
          {t("theme.reset")}
        </Button>
      </div>
    </>
  );
}

function rfCompatStatusLabel(status: RfCompatStatus): string {
  if (status === "ok") return t("settings.aboutRfStatusOk");
  if (status === "untested") return t("settings.aboutRfStatusUntested");
  if (status === "unknown") return t("settings.aboutRfStatusUnknown");
  return t("settings.aboutRfStatusMissing");
}

function rfCompatTone(status: RfCompatStatus): "accent" | "warn" | "default" | "danger" {
  if (status === "ok") return "accent";
  if (status === "untested") return "warn";
  if (status === "unknown") return "default";
  return "default";
}

function AboutRfCompatTable({ rows }: { rows: RfCompatRow[] }) {
  if (rows.length === 0) {
    return <p class="fd-settings__hint">{t("settings.aboutRfDetectedNone")}</p>;
  }
  return (
    <div class="fd-settings__rf-table-wrap">
      <table class="fd-settings__rf-table">
        <thead>
          <tr>
            <th>{t("settings.aboutRfColMod")}</th>
            <th>{t("settings.aboutRfColDetected")}</th>
            <th>{t("settings.aboutRfColTested")}</th>
            <th>{t("settings.aboutRfColStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} class={row.detected ? undefined : "is-muted"}>
              <td>
                <strong>{row.title}</strong>
                <div class="fd-settings__hint">{row.id}</div>
              </td>
              <td>{row.detectedVersion || (row.detected ? "—" : "—")}</td>
              <td>{row.testedVersion}</td>
              <td>
                <Badge tone={rfCompatTone(row.status)}>{rfCompatStatusLabel(row.status)}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AboutPane(props: {
  appVersion: string;
  payload: ReturnType<typeof useDashboardStore.getState>["payload"];
  updateStatus: string;
  onCheckUpdates: () => void;
}) {
  const { appVersion, payload, updateStatus, onCheckUpdates } = props;
  const [rfShowAll, setRfShowAll] = useState(false);
  const check = (payload as { modVersionCheck?: { actual?: string; expectedMin?: string } } | null)
    ?.modVersionCheck;
  const expected = check?.expectedMin || "3.1.0.0";
  let modVersion = t("settings.aboutModNotConnected");
  if (check?.actual) modVersion = check.actual;
  else if (payload?.luaAvailable) modVersion = t("settings.aboutModUnknown");

  const rf = payload?.realisticFarming;
  const detectedCount = countDetectedRfMods(rf);
  const rfRows = rfShowAll ? buildRfCompatibilityRows(rf) : buildDetectedRfCompatRows(rf);

  return (
    <>
      <p>{t("settings.aboutTagline")}</p>
      <h3>{t("settings.aboutVersionsTitle")}</h3>
      <p>
        {t("settings.aboutAppVersionLabel")}: <strong>{appVersion}</strong>
      </p>
      <p>
        {t("settings.aboutModVersionLabel")}: <strong>{modVersion}</strong>
      </p>
      <p>
        {t("settings.aboutModExpectedLabel")}: <strong>{expected}</strong>
      </p>

      <h3>{t("settings.aboutRfEditionTitle")}</h3>
      <p>{t("settings.aboutRfEditionLead")}</p>
      <p class="fd-settings__hint">{t("settings.aboutRfEditionLines")}</p>
      <p class="fd-settings__hint">
        {t("settings.aboutRfCount", { count: detectedCount })}
      </p>
      <h4>{t("settings.aboutRfCompatTitle")}</h4>
      <p class="fd-settings__hint">{t("settings.aboutRfCompatHint")}</p>
      <div class="fd-settings__rf-toolbar">
        <Button
          variant="ghost"
          onClick={() => setRfShowAll((v) => !v)}
        >
          {rfShowAll ? t("settings.aboutRfShowDetected") : t("settings.aboutRfShowAll")}
        </Button>
      </div>
      <AboutRfCompatTable rows={rfRows} />

      <h3>{t("settings.desktopAppTitle")}</h3>
      <p class="fd-settings__hint">{t("settings.desktopAppHint")}</p>
      <Button onClick={onCheckUpdates}>{t("settings.checkForUpdates")}</Button>
      {updateStatus ? <p class="fd-settings__hint">{updateStatus}</p> : null}
      <h3 style={{ marginTop: "1rem" }}>{t("settings.aboutAuthorsTitle")}</h3>
      <p>{t("settings.aboutAuthorJosh")}</p>
      <p>{t("settings.aboutAuthorWizardly")}</p>
      <h3>{t("settings.aboutLicenseTitle")}</h3>
      <p class="fd-settings__hint">{t("settings.aboutGiantsNote")}</p>
      <h3>{t("settings.aboutLinksTitle")}</h3>
      <p>
        <a href="https://github.com/WizardlyPayload/FarmHub" target="_blank" rel="noopener">
          {t("settings.aboutLinkGithub")}
        </a>
        {" · "}
        <a
          href="https://github.com/WizardlyPayload/FarmHub/releases"
          target="_blank"
          rel="noopener"
        >
          {t("settings.aboutLinkReleases")}
        </a>
        {" · "}
        <a href="https://www.farmdashboard.co.uk" target="_blank" rel="noopener">
          {t("settings.aboutLinkWebsite")}
        </a>
      </p>
      <p class="fd-settings__hint">
        {t("settings.supportKofiHint")}{" "}
        <a href="https://ko-fi.com/wizarlypayload" target="_blank" rel="noopener">
          Ko-fi
        </a>
      </p>
    </>
  );
}
