import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { initI18n, t, tOr } from "@/i18n/i18n";
import { Button } from "@/components/ui";
import {
  getFarmDashApi,
  type FarmDashConfig,
  type FarmDashConfigServer,
} from "@/services/electron-bridge";
import { fetchSetupStatus, runSetupHandshake } from "@/lib/setup-status";
import { startModStoreImageExport } from "@/lib/mod-export-progress";
import { discoveryContextFromScan, discoveryFeedback, importDiscoveredSaves } from "@/lib/discovered-save";
import { SetupStatusNotice } from "@/setup/status-notice";
import { resolveSetupStatusForDraft } from "@/setup/draft-status";
import { ModExportProgressModal } from "@/platform/ModExportProgressModal";
import { LinkServerPrompt } from "@/platform/LinkServerPrompt";
import { type SetupStatus } from "@/lib/ux-state";
import { mapSaveError as classifySaveError } from "@/lib/ux-classify";
import "@/styles/global.css";
import "@/platform/platform.css";
import "@/setup/setup.css";

const I18N_TIMEOUT_MS = 5000;
const CONFIG_TIMEOUT_MS = 8000;
const SIDE_READ_TIMEOUT_MS = 4000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("E_SETUP_BOOT_TIMEOUT")), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function tFill(key: string, fallback: string, params: Record<string, string | number>): string {
  const out = t(key, params);
  if (out && out !== key) return out;
  return Object.entries(params).reduce((text, [name, value]) => text.split(`{{${name}}}`).join(String(value)), fallback);
}

function mapSaveError(raw: string): string {
  return classifySaveError(String(raw || ""), (key, params, fallback) =>
    tOr(key, fallback || key, params || undefined),
  );
}

function setupStepTitle(id: string): string {
  const suffix = `${id.charAt(0).toUpperCase()}${id.slice(1)}`;
  return t(`ux.setup.step${suffix}`);
}

function setupStepStateLabel(state: string): string {
  if (state === "pending") return tOr("ux.state.pending", "In progress…");
  if (state === "error") return tOr("ux.setup.stepNeedsAttention", "Needs attention");
  if (state === "success") return tOr("ux.state.success", "Up to date.");
  return tOr("ux.state.pending", "In progress…");
}

async function loadConfig(): Promise<FarmDashConfig> {
  const api = getFarmDashApi();
  // A fresh desktop profile has no config yet. Rejected reads must still fail closed.
  if (api) return (await api.getCurrentConfig()) ?? {};
  const headers: HeadersInit = {};
  if (window.__FARMDASH_SETUP_TOKEN) {
    headers["X-Setup-Token"] = window.__FARMDASH_SETUP_TOKEN;
  }
  const res = await fetch("/api/setup-config", { cache: "no-store", headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; errorCode?: string };
    throw new Error(body.errorCode || body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<FarmDashConfig>;
}

async function saveConfig(config: FarmDashConfig): Promise<void> {
  const api = getFarmDashApi();
  if (api) {
    const res = await api.saveSettings(config);
    if (res && res.ok === false) throw new Error(res.error || "save failed");
    return;
  }
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (window.__FARMDASH_SETUP_TOKEN) {
    headers["X-Setup-Token"] = window.__FARMDASH_SETUP_TOKEN;
  }
  const res = await fetch("/api/setup-config", {
    method: "POST",
    headers,
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; errorCode?: string };
    throw new Error(body.errorCode || body.error || `HTTP ${res.status}`);
  }
}

function SetupApp() {
  const [ready, setReady] = useState(false);
  const [servers, setServers] = useState<FarmDashConfigServer[]>([]);
  const [ftpDelay, setFtpDelay] = useState(0);
  const [ftpInterval, setFtpInterval] = useState(5);
  const [ftpSchedule, setFtpSchedule] = useState<"sync" | "staggered">("sync");
  const [locale, setLocale] = useState("en");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<FarmDashConfigServer>>({
    name: "",
    mode: "local",
    ftpPort: 21,
  });
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [localOnlyBlock, setLocalOnlyBlock] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [awaitingIds, setAwaitingIds] = useState<string[]>([]);
  const loadAttempt = useRef(0);

  async function hydrateConfig(initial: boolean): Promise<void> {
    const attempt = ++loadAttempt.current;
    const isCurrent = () => attempt === loadAttempt.current;
    setConfigLoaded(false);
    // Only the latest attempt settles the screen. An older read's success, rejection or timeout is dropped,
    // so it can neither replace newer servers nor hide them behind a load error.
    let cfg: FarmDashConfig;
    try {
      cfg = (await withTimeout(loadConfig(), CONFIG_TIMEOUT_MS)) ?? {};
    } catch (e) {
      if (!isCurrent()) return;
      const msg = String((e as Error)?.message || e);
      if (initial && /E_SETUP_LOCAL_ONLY|setup is only available/i.test(msg)) {
        setLocalOnlyBlock(true);
      } else {
        setLoadError(msg);
      }
      setConfigLoaded(false);
      return;
    }
    if (!isCurrent()) return;
    setServers(Array.isArray(cfg.servers) ? cfg.servers : []);
    setFtpDelay(Number(cfg.ftpPolling?.initialDelaySeconds ?? 0));
    setFtpInterval(Number(cfg.ftpPolling?.intervalMinutes ?? 5));
    setFtpSchedule((cfg.ftpPolling?.scheduleMode as "sync" | "staggered") || "sync");
    setLoadError(null);
    setConfigLoaded(true);
  }

  function retryConfig() {
    void hydrateConfig(false);
  }

  useEffect(() => {
    void (async () => {
      try {
        await withTimeout(initI18n(), I18N_TIMEOUT_MS);
      } catch {
        /* English fallbacks stay readable while the catalog is unavailable. */
      }
      await hydrateConfig(true);
      const api = getFarmDashApi();
      const localeRead = (async () => {
        if (api?.getStoredLocale) {
          try {
            const code = await withTimeout(Promise.resolve(api.getStoredLocale()), SIDE_READ_TIMEOUT_MS);
            if (code) setLocale(code);
          } catch {
            /* ignore */
          }
        } else {
          setLocale(localStorage.getItem("farmdash_locale") || "en");
        }
      })();
      const statusRead = (async () => {
        try {
          setSetupStatus(await withTimeout(fetchSetupStatus(), SIDE_READ_TIMEOUT_MS));
        } catch {
          /* ignore */
        }
      })();
      await Promise.all([localeRead, statusRead]);
      setReady(true);
    })();
  }, []);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 5000);
  }

  function addServer() {
    const name = String(draft.name || "").trim();
    if (!name) {
      flash(t("setup.toastPleaseEnterName"));
      return;
    }
    if (draft.mode === "ftp" && (!draft.ftpHost || !draft.ftpUser || !draft.ftpPass)) {
      flash(t("setup.toastFtpRequired"));
      return;
    }
    setServers([
      ...servers,
      {
        id: `srv_${Date.now()}`,
        name,
        mode: draft.mode || "local",
        localPath: draft.localPath,
        localSubFolder: draft.localSubFolder,
        ftpHost: draft.ftpHost,
        ftpPort: draft.ftpPort || 21,
        ftpUser: draft.ftpUser,
        ftpPass: draft.ftpPass,
        ftpBasePath: draft.ftpBasePath,
        httpFeedHost: draft.httpFeedHost,
        httpFeedPort: draft.httpFeedPort,
        httpFeedCode: draft.httpFeedCode,
      },
    ]);
    setDraft({ name: "", mode: draft.mode || "local", ftpPort: 21 });
    flash(t("setup.toastServerAdded", { name }));
  }

  async function detect() {
    const api = getFarmDashApi();
    if (!api) {
      flash(t("setup.toastAutoDetectPcOnly"));
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
        flash(
          tOr(
            "setup.toastNoCareerFound",
            "No Farming Simulator 25 career was found. Save a career in the game with the Farm Dashboard mod enabled, then select Auto-Detect again, or add the save folder below.",
          ),
        );
        return;
      }
      const imported = importDiscoveredSaves(
        servers,
        saves as Array<Record<string, unknown>>,
        discoveryContextFromScan(result),
      );
      if (imported.awaitingFirstExport.length) {
        setAwaitingIds([...awaitingIds, ...imported.awaitingFirstExport]);
      }
      const feedback = discoveryFeedback(imported, saves.length > 0);
      if (feedback === "added" && imported.awaitingFirstExport.length === imported.added.length) {
        setServers([...servers, ...imported.added]);
        const count = imported.added.length;
        flash(
          count === 1
            ? tFill(
                "setup.toastAwaitingFirstExportOne",
                "Found {{count}} saved career with no dashboard export yet. Select Launch Dashboard, then load that save in Farming Simulator 25 with the Farm Dashboard mod enabled.",
                { count },
              )
            : tFill(
                "setup.toastAwaitingFirstExportMany",
                "Found {{count}} saved careers with no dashboard export yet. Select Launch Dashboard, then load one of them in Farming Simulator 25 with the Farm Dashboard mod enabled.",
                { count },
              ),
        );
        return;
      }
      if (feedback === "recovery") {
        if (imported.added.length) setServers([...servers, ...imported.added]);
        flash(tOr("setup.toastRegistrationRecovery", "Replica registration could not be read. Those replica sources were not added, and the registration file was left unchanged."));
        return;
      }
      if (feedback === "conflict") {
        if (imported.added.length) setServers([...servers, ...imported.added]);
        flash(tOr("setup.toastSourceConflict", "A discovered source conflicts with one already configured. It was not added, and the existing source was left unchanged."));
        return;
      }
      if (feedback === "unresolved") {
        flash(tOr("setup.toastSourceUnresolved", "The default save location could not be resolved, so matching sources were not added."));
        return;
      }
      const added = imported.added;
      if (!added.length) {
        flash(t("setup.toastAllDetected"));
        return;
      }
      setServers([...servers, ...added]);
      flash(
        added.length === 1
          ? t("setup.toastImportedSavesOne", { count: added.length })
          : t("setup.toastImportedSavesMany", { count: added.length }),
      );
    } catch (e) {
      flash(t("setup.toastScanError", { msg: String(e) }));
    }
  }

  async function scanModImages() {
    try {
      await startModStoreImageExport();
    } catch (e) {
      flash(t("setup.toastModImagesError", { msg: String(e) }));
    }
  }

  async function launch() {
    if (!configLoaded) {
      flash(tOr("setup.errLoadFailed", "Setup could not read the saved configuration."));
      return;
    }
    if (!servers.length) {
      flash(t("setup.toastAddAtLeastOne"));
      return;
    }
    setBusy(true);
    try {
      await saveConfig({
        isConfigured: true,
        servers,
        ftpPolling: {
          initialDelaySeconds: ftpDelay,
          intervalMinutes: ftpInterval,
          scheduleMode: ftpSchedule,
        },
      });
      localStorage.setItem("farmdash_locale", locale);
      getFarmDashApi()?.setStoredLocale?.(locale);
      const api = getFarmDashApi();
      if (api?.launchDashboard) {
        const launchRes = await api.launchDashboard();
        if (launchRes && launchRes.ok === false) {
          const code = String(launchRes.error || "");
          if (code === "backend_not_listening" || /eaddrinuse/i.test(code)) {
            flash(
              tOr(
                "setup.errLaunchBackend",
                "The dashboard server did not start. Close another copy of this same edition and retry.",
              ),
            );
            return;
          }
          if (
            code === "navigation_timeout" ||
            code === "did-fail-load" ||
            code === "no_window" ||
            code === "untrusted_sender"
          ) {
            flash(
              tOr(
                "setup.errLaunchNavigate",
                "Could not open the dashboard from this window. Restart Farm Dashboard.",
              ),
            );
            return;
          }
          throw new Error(code || "Launch failed");
        }
        return;
      }
      if (location.protocol === "http:" || location.protocol === "https:") {
        window.location.assign(new URL("/", location.origin).href);
        return;
      }
      flash(tOr("setup.errLaunchNavigate", "Could not open the dashboard from this window. Restart Farm Dashboard."));
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      if (/backend_not_listening|navigation_timeout|did-fail-load|no_window/.test(msg)) {
        flash(
          tOr(
            "setup.errLaunchBackend",
            "The dashboard server did not start. Close another copy of this same edition and retry.",
          ),
        );
      } else if (/untrusted_sender|not_configured/.test(msg)) {
        flash(
          tOr(
            "setup.errLaunchNavigate",
            "Could not open the dashboard from this window. Restart Farm Dashboard.",
          ),
        );
      } else {
        flash(mapSaveError(msg));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div class="fd-splash fd-setup-boot" role="status" aria-live="polite" aria-busy="true">
        <div class="fd-splash__panel">
          <p>{tOr("splash.loading", "Loading your farm data…")}</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div class="fd-setup">
        <div class="fd-setup__card fd-setup__card--blocked" role="alert">
          <h1>{tOr("setup.errLoadFailedTitle", "Could not load your servers")}</h1>
          <p>{tOr("setup.errLoadFailed", "Setup could not read the saved configuration. Retry before adding or launching — saving now could replace your existing servers.")}</p>
          <p>
            <Button onClick={() => void retryConfig()}>
              {tOr("setup.retryLoad", "Retry")}
            </Button>
          </p>
        </div>
      </div>
    );
  }

  if (localOnlyBlock) {
    return (
      <div class="fd-setup">
        <div class="fd-setup__card fd-setup__card--blocked">
          <h1>{tOr("setup.errLocalOnlyTitle", "Setup stays on this PC")}</h1>
          <p>{tOr("setup.errLocalOnly", "Setup is only available on the PC running Farm Dashboard.")}</p>
          <p>
            <a href="/">{tOr("setup.backToDashboard", "Open the dashboard")}</a>
          </p>
        </div>
      </div>
    );
  }

  // Setup status describes the saved backend config. Newly detected draft sources
  // have not been saved yet, so its previous "add a server" error is no longer
  // a truthful instruction for the sources currently shown on this screen.
  const visibleSetupStatus = resolveSetupStatusForDraft(setupStatus, servers.length);

  return (
    <>
    <LinkServerPrompt />
    <div class="fd-setup">
      <div class="fd-setup__card">
        <div class="fd-setup__actions">
          <Button onClick={() => void detect()}>{t("setup.detectIdle")}</Button>
          <Button variant="ghost" onClick={() => void scanModImages()}>
            {t("setup.modImages")}
          </Button>
          <Button onClick={() => void launch()}>
            {busy ? t("setup.launchStarting") : t("setup.launch")}
          </Button>
          {toast ? <p class="fd-setup__toast">{toast}</p> : null}
        </div>
        <div class="fd-setup__left">
          <h1>{t("setup.serverManager")}</h1>
          <ol class="fd-setup__steps" aria-label={t("ux.setup.gatedTitle")}>
            {(visibleSetupStatus?.steps || [
              { id: "detect", state: "pending", errorCode: null },
              { id: "connectivity", state: "pending", errorCode: null },
              { id: "auth", state: "pending", errorCode: null },
              { id: "service", state: "pending", errorCode: null },
            ]).map((step) => (
              <li
                key={step.id}
                class={`fd-setup__step is-${step.state}`}
                aria-label={`${setupStepTitle(step.id)}: ${setupStepStateLabel(step.state)}`}
                aria-current={step.state === "pending" ? "step" : undefined}
              >
                <span class="fd-setup__step-name">{setupStepTitle(step.id)}</span>
                <span class="fd-setup__step-status">{setupStepStateLabel(step.state)}</span>
              </li>
            ))}
          </ol>
          <SetupStatusNotice status={visibleSetupStatus} />
          <p>
            <Button
              variant="ghost"
              onClick={() => void runSetupHandshake().then(setSetupStatus)}
            >
              {t("ux.setup.handshake")}
            </Button>
          </p>
          <div class="fd-form-row">
            <label for="fd-setup-lang">{t("setup.langHeading")}</label>
            <select
              id="fd-setup-lang"
              value={locale}
              onChange={(e) => {
                const code = (e.target as HTMLSelectElement).value;
                setLocale(code);
                localStorage.setItem("farmdash_locale", code);
                getFarmDashApi()?.setStoredLocale?.(code);
              }}
            >
              {["en", "de", "fr", "es", "it", "pl", "nl", "pt", "cs", "da", "sv", "uk"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span class="fd-settings__hint">{t("setup.langHint")}</span>
          </div>
          <h2>{t("setup.dedicatedJoinTitle")}</h2>
          <p class="fd-settings__hint">{t("setup.dedicatedJoinIntro")}</p>
          <ol class="fd-settings__hint" style={{ paddingLeft: "1.25rem", margin: "0.5rem 0 1rem" }}>
            <li>{t("setup.dedicatedJoinStep1")}</li>
            <li>{t("setup.dedicatedJoinStep2")}</li>
            <li>{t("setup.dedicatedJoinStep3")}</li>
            <li>{t("setup.dedicatedJoinStep4")}</li>
            <li>{t("setup.dedicatedJoinStep5")}</li>
          </ol>
          <p class="fd-settings__hint">{t("setup.dedicatedJoinLimits")}</p>

          <h2 style={{ marginTop: "1.25rem" }}>{t("setup.ftpAdvancedTitle")}</h2>
          <p class="fd-settings__hint">{t("setup.ftpPollHint")}</p>
          <div class="fd-form-row">
            <label for="fd-setup-delay">{t("setup.delayLabel")}</label>
            <input
              id="fd-setup-delay"
              type="number"
              min={0}
              max={600}
              value={ftpDelay}
              onInput={(e) => setFtpDelay(Number((e.target as HTMLInputElement).value))}
            />
          </div>
          <div class="fd-form-row">
            <label for="fd-setup-poll">{t("setup.pollLabel")}</label>
            <input
              id="fd-setup-poll"
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
                checked={ftpSchedule === "sync"}
                onChange={() => setFtpSchedule("sync")}
              />
              {t("setup.scheduleSync")}
            </label>
            <label class="fd-check">
              <input
                type="radio"
                checked={ftpSchedule === "staggered"}
                onChange={() => setFtpSchedule("staggered")}
              />
              {t("setup.scheduleStaggered")}
            </label>
          </div>
        </div>
        <div class="fd-setup__right">
          <h2>{tOr("setup.configuredServers", "Configured servers")}</h2>
          {servers.length === 0 ? (
            <p class="fd-settings__hint">{tOr("setup.emptyServers", "No servers yet.")}</p>
          ) : (
            <ul class="fd-server-list">
              {servers.map((s) => (
                <li key={s.id}>
                  <span>
                    <strong>{s.name}</strong>
                    <br />
                    <span class="fd-settings__hint">
                      {s.mode === "ftp"
                        ? t("setup.serverInfoFtp", { host: s.ftpHost || "", extra: "" })
                        : t("setup.serverInfoLocal", {
                            detail: s.localSubFolder || s.localPath || "—",
                          })}
                    </span>
                    {awaitingIds.includes(s.id) ? (
                      <>
                        <br />
                        <span class="fd-settings__hint fd-setup__awaiting" role="status">
                          {tOr(
                            "setup.serverAwaitingFirstExport",
                            "Waiting for the first export. Launch the dashboard, then load this save in Farming Simulator 25 with the Farm Dashboard mod enabled.",
                          )}
                        </span>
                      </>
                    ) : null}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => setServers(servers.filter((x) => x.id !== s.id))}
                  >
                    {tOr("common.remove", "Remove")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <h3>{tOr("setup.addServer", "Add server")}</h3>
          <div class="fd-setup__form-actions">
            <Button onClick={addServer}>{tOr("setup.addServer", "Add server")}</Button>
          </div>
          <div class="fd-form-row">
            <label for="fd-setup-name">{tOr("setup.displayName", "Display name")}</label>
            <input
              id="fd-setup-name"
              type="text"
              value={draft.name || ""}
              onInput={(e) => setDraft({ ...draft, name: (e.target as HTMLInputElement).value })}
            />
          </div>
          <div class="fd-radio-row">
            <label class="fd-check">
              <input
                type="radio"
                checked={(draft.mode || "local") === "local"}
                onChange={() => setDraft({ ...draft, mode: "local" })}
              />
              {t("setup.modeLocal")}
            </label>
            <label class="fd-check">
              <input
                type="radio"
                checked={draft.mode === "ftp"}
                onChange={() => setDraft({ ...draft, mode: "ftp" })}
              />
              {t("setup.modeFtp")}
            </label>
          </div>
          {(draft.mode || "local") === "local" ? (
            <>
              <div class="fd-form-row">
                <label for="fd-setup-local-path">{t("setup.localPath")}</label>
                <input
                  id="fd-setup-local-path"
                  type="text"
                  value={draft.localPath || ""}
                  onInput={(e) =>
                    setDraft({ ...draft, localPath: (e.target as HTMLInputElement).value })
                  }
                />
                <span class="fd-settings__hint">{t("setup.localHint")}</span>
              </div>
              <div class="fd-form-row">
                <label for="fd-setup-local-sub">{tOr("setup.localSubFolder", "Save subfolder")}</label>
                <input
                  id="fd-setup-local-sub"
                  type="text"
                  value={draft.localSubFolder || ""}
                  onInput={(e) =>
                    setDraft({ ...draft, localSubFolder: (e.target as HTMLInputElement).value })
                  }
                />
              </div>
            </>
          ) : (
            <>
              <div class="fd-form-row">
                <label for="fd-setup-ftp-host">{t("setup.ftpHost")}</label>
                <input
                  id="fd-setup-ftp-host"
                  type="text"
                  value={draft.ftpHost || ""}
                  onInput={(e) =>
                    setDraft({ ...draft, ftpHost: (e.target as HTMLInputElement).value })
                  }
                />
              </div>
              <div class="fd-form-row">
                <label for="fd-setup-ftp-port">{t("setup.ftpPort")}</label>
                <input
                  id="fd-setup-ftp-port"
                  type="number"
                  value={Number(draft.ftpPort || 21)}
                  onInput={(e) =>
                    setDraft({ ...draft, ftpPort: Number((e.target as HTMLInputElement).value) })
                  }
                />
              </div>
              <div class="fd-form-row">
                <label for="fd-setup-ftp-user">{t("setup.ftpUser")}</label>
                <input
                  id="fd-setup-ftp-user"
                  type="text"
                  value={draft.ftpUser || ""}
                  onInput={(e) =>
                    setDraft({ ...draft, ftpUser: (e.target as HTMLInputElement).value })
                  }
                />
              </div>
              <div class="fd-form-row">
                <label for="fd-setup-ftp-pass">{t("setup.ftpPass")}</label>
                <input
                  id="fd-setup-ftp-pass"
                  type="password"
                  value={draft.ftpPass || ""}
                  onInput={(e) =>
                    setDraft({ ...draft, ftpPass: (e.target as HTMLInputElement).value })
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    <ModExportProgressModal />
    </>
  );
}

render(<SetupApp />, document.getElementById("app")!);
