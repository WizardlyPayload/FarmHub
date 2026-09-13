import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { initI18n, t, tOr } from "@/i18n/i18n";
import {
  simHubFieldCards,
  simHubPastureCards,
  simHubProductionCards,
  type SimHubCard,
} from "@/simhub/simhub-cards";
import {
  detectAndMarkRemoteViewer,
  farmdashWaitForLanHttpBasicIfNeeded,
  installLanHttpBasicFetchPatch,
} from "@/services/lan-auth";
import { LanAuthOverlay } from "@/platform/LanAuthOverlay";
import "@/styles/global.css";
import "@/platform/platform.css";
import "@/simhub/simhub.css";

detectAndMarkRemoteViewer();
installLanHttpBasicFetchPatch();

interface SimHubView {
  enabled?: boolean;
  view?: "fields" | "pastures" | "production";
  fieldClusterIds?: string[];
  pastureIds?: number[];
  productionKeys?: string[];
}

async function resolveContext(): Promise<{ serverId: string; farmId: number }> {
  const params = new URLSearchParams(window.location.search);
  const urlSid = (params.get("serverId") || "").trim();
  const urlFarmRaw = parseInt(params.get("farmId") || "0", 10);
  const urlFarm = Number.isFinite(urlFarmRaw) && urlFarmRaw > 0 ? urlFarmRaw : 1;
  if (urlSid) return { serverId: urlSid, farmId: urlFarm };
  try {
    const r = await fetch("/api/simhub-session");
    const j = (await r.json()) as { serverId?: string; farmId?: number };
    const sid = String(j.serverId || "").trim();
    const f = Math.max(1, parseInt(String(j.farmId ?? 1), 10) || 1);
    if (sid) return { serverId: sid, farmId: f };
  } catch {
    /* ignore */
  }
  try {
    const r = await fetch("/api/servers");
    const s = (await r.json()) as Array<{ id?: string }>;
    if (Array.isArray(s) && s.length && s[0]?.id != null) {
      return { serverId: String(s[0].id), farmId: 1 };
    }
  } catch {
    /* ignore */
  }
  return { serverId: "", farmId: 1 };
}

function SimHubApp() {
  const [ready, setReady] = useState(false);
  const [banner, setBanner] = useState("");
  const [bannerKind, setBannerKind] = useState<"warn" | "danger" | "info">("info");
  const [updated, setUpdated] = useState("");
  const [cards, setCards] = useState<SimHubCard[]>([]);

  useEffect(() => {
    void (async () => {
      await farmdashWaitForLanHttpBasicIfNeeded();
      await initI18n();
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function tick() {
      try {
        const { serverId, farmId } = await resolveContext();
        const sidQ = serverId ? `?serverId=${encodeURIComponent(serverId)}` : "";
        const cfg = await fetch(`/api/simhub-view-config${sidQ}`).then((r) => r.json());
        const sh = (cfg.simHubView || {}) as SimHubView;
        if (!sh.enabled) {
          if (!cancelled) {
            setBanner(
              tOr(
                "simhub.disabled",
                "SimHub is turned off in Dashboard Settings on this PC.",
              ),
            );
            setBannerKind("warn");
            setCards([]);
          }
          return;
        }
        const data = await fetch(`/api/data${sidQ}`).then((r) => r.json());
        if (cancelled) return;
        setBanner("");
        setUpdated(String(data.lastUpdated || new Date().toISOString()));

        const view = sh.view || "fields";
        let next: SimHubCard[] = [];
        if (view === "fields") {
          next = simHubFieldCards(data.fields, farmId, sh.fieldClusterIds || []);
          if (!next.length) {
            setCards([]);
            setBanner(t("simhub.noFieldRows"));
            setBannerKind("info");
            return;
          }
        } else if (view === "pastures") {
          next = simHubPastureCards(data, farmId, sh.pastureIds || []);
          if (!next.length) {
            setCards([]);
            setBanner(t("simhub.noPastureData"));
            setBannerKind("info");
            return;
          }
        } else {
          next = simHubProductionCards(
            data.production,
            farmId,
            data.farmInfo,
            sh.productionKeys || [],
          );
          if (!next.length) {
            setCards([]);
            setBanner(t("simhub.noProductionChains"));
            setBannerKind("info");
            return;
          }
        }
        setCards(next);
      } catch (e) {
        if (!cancelled) {
          setBanner(String((e as Error)?.message || e));
          setBannerKind("danger");
        }
      }
    }

    void tick();
    const id = setInterval(() => void tick(), 12000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ready]);

  if (!ready) {
    return (
      <div class="fd-splash">
        <div class="fd-splash__panel">
          <p>{t("splash.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <LanAuthOverlay />
      <div class="fd-simhub">
      <header class="fd-simhub__header">
        <strong>SimHub</strong>
        {updated ? (
          <span class="fd-settings__hint">
            {tOr("simhub.updated", "Updated")}: {updated}
          </span>
        ) : null}
      </header>
      {banner ? <div class={`fd-simhub__banner fd-simhub__banner--${bannerKind}`}>{banner}</div> : null}
      <div class="fd-simhub__grid">
        {cards.map((c, i) => (
          <article class="fd-simhub__card" key={`${c.title}-${i}`}>
            <div class="fd-simhub__card-top">
              <h2>{c.title}</h2>
              {c.badge ? <span class="fd-badge">{c.badge}</span> : null}
            </div>
            {c.subtitle ? <p class="fd-settings__hint">{c.subtitle}</p> : null}
            {c.lines?.length ? (
              <ul class="fd-simhub__lines">
                {c.lines.map((line, li) => (
                  <li key={`${i}-${li}`}>{line}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </div>
    </>
  );
}

render(<SimHubApp />, document.getElementById("app")!);
