import { t, tOr } from "@/i18n/i18n";
import { Badge, Card } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  getNpcFavor,
  getNpcFavorForFarm,
  npcFavorLabel,
  npcFavorTone,
} from "@/lib/realisticFarming/life";
import "@/sections/economy/economy.css";

export function NpcFavorSection() {
  const payload = useDashboardStore((s) => s.payload);
  const farmId = useDashboardStore((s) => s.activeFarmId) ?? 1;
  const rf = payload?.realisticFarming;
  const block = getNpcFavor(rf);

  if (!block) {
    return (
      <div class="fd-economy__empty">
        <h2>{t("nav.mod.npcfavor")}</h2>
        <p>{tOr("rf.npcfavor.hintDisabled", "NPC Favor is not detected on this save.")}</p>
      </div>
    );
  }

  const farm = getNpcFavorForFarm(rf, farmId);
  const relationships = farm?.relationships ?? [];
  const favors = farm?.activeFavors ?? [];

  return (
    <div>
      <header class="fd-economy__header">
        <h2>{t("nav.mod.npcfavor")}</h2>
        <p class="fd-economy__muted">
          {tOr("rf.npcfavor.lead", "Relationships and active favors for the selected farm.")}
        </p>
      </header>

      <div class="fd-economy__stats">
        <div>
          <span class="fd-economy__muted">{tOr("rf.npcfavor.relCount", "Relationships")}</span>
          <strong>{relationships.length}</strong>
        </div>
        <div>
          <span class="fd-economy__muted">{tOr("rf.npcfavor.favorCount", "Active favors")}</span>
          <strong>{favors.length}</strong>
        </div>
      </div>

      <Card title={tOr("rf.npcfavor.activeTitle", "Active favors")}>
        {favors.length === 0 ? (
          <p class="fd-economy__muted">{tOr("rf.npcfavor.noFavors", "No active favors.")}</p>
        ) : (
          <div class="fd-economy__table-wrap">
            <table class="fd-economy__table">
              <thead>
                <tr>
                  <th>{tOr("rf.npcfavor.colSummary", "Favor")}</th>
                  <th>{tOr("rf.npcfavor.colType", "Type")}</th>
                  <th>{tOr("rf.npcfavor.colNpc", "NPC")}</th>
                </tr>
              </thead>
              <tbody>
                {favors.map((f, i) => (
                  <tr key={f.id ?? `${f.npcId ?? "f"}-${i}`}>
                    <td>{f.summary || "—"}</td>
                    <td>{f.type || "—"}</td>
                    <td>{f.npcId || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={tOr("rf.npcfavor.relTitle", "Relationships")}>
        {relationships.length === 0 ? (
          <p class="fd-economy__muted">{tOr("rf.npcfavor.noRels", "No NPCs spawned yet.")}</p>
        ) : (
          <div class="fd-economy__table-wrap">
            <table class="fd-economy__table">
              <thead>
                <tr>
                  <th>{tOr("rf.npcfavor.colName", "Name")}</th>
                  <th>{tOr("rf.npcfavor.colValue", "Favor")}</th>
                  <th>{tOr("rf.npcfavor.colStanding", "Standing")}</th>
                </tr>
              </thead>
              <tbody>
                {relationships.map((r) => {
                  const value = Number(r.value) || 0;
                  const labelKey = npcFavorLabel(value);
                  const label =
                    labelKey === "friend"
                      ? tOr("rf.npcfavor.standingFriend", "Friend")
                      : labelKey === "neutral"
                        ? tOr("rf.npcfavor.standingNeutral", "Neutral")
                        : tOr("rf.npcfavor.standingCold", "Cold");
                  return (
                    <tr key={r.npcId}>
                      <td>{r.name || r.npcId}</td>
                      <td>{Math.round(value)}</td>
                      <td>
                        <Badge tone={npcFavorTone(value)}>{label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
