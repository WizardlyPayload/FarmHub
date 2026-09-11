import { t, tOr } from "@/i18n/i18n";
import { Badge, Card } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import { getWorldEvents } from "@/lib/realisticFarming/life";
import "@/sections/economy/economy.css";

export function WorldEventsSection() {
  const payload = useDashboardStore((s) => s.payload);
  const block = getWorldEvents(payload?.realisticFarming);

  if (!block) {
    return (
      <div class="fd-economy__empty">
        <h2>{t("nav.mod.worldevents")}</h2>
        <p>{tOr("rf.worldevents.hintDisabled", "Random World Events is not detected on this save.")}</p>
      </div>
    );
  }

  const active = block.active;
  const freq = block.frequency != null ? Number(block.frequency) : null;
  const intensity = block.intensity != null ? Number(block.intensity) : null;
  const typeCount = block.eventTypeCount != null ? Number(block.eventTypeCount) : null;

  return (
    <div>
      <header class="fd-economy__header">
        <h2>{t("nav.mod.worldevents")}</h2>
        <p class="fd-economy__muted">
          {tOr("rf.worldevents.lead", "Active world event and frequency settings.")}
        </p>
      </header>

      <div class="fd-economy__stats">
        <div>
          <span class="fd-economy__muted">{tOr("rf.worldevents.frequency", "Frequency")}</span>
          <strong>{freq != null ? `${freq} / 10` : "—"}</strong>
        </div>
        <div>
          <span class="fd-economy__muted">{tOr("rf.worldevents.intensity", "Intensity")}</span>
          <strong>{intensity != null ? `${intensity} / 5` : "—"}</strong>
        </div>
        <div>
          <span class="fd-economy__muted">{tOr("rf.worldevents.types", "Event types")}</span>
          <strong>{typeCount != null ? typeCount : "—"}</strong>
        </div>
      </div>

      <Card title={tOr("rf.worldevents.currentTitle", "Current event")}>
        {active ? (
          <div class="fd-economy__stats">
            <div>
              <span class="fd-economy__muted">{tOr("rf.worldevents.activeName", "Active")}</span>
              <strong>
                <Badge tone="warn">{active.name}</Badge>
              </strong>
            </div>
            {active.category ? (
              <div>
                <span class="fd-economy__muted">{tOr("rf.worldevents.category", "Category")}</span>
                <strong>{active.category}</strong>
              </div>
            ) : null}
            {active.remainingMin != null && active.durationMin != null ? (
              <div>
                <span class="fd-economy__muted">{tOr("rf.worldevents.duration", "Duration")}</span>
                <strong>
                  {tOr("rf.worldevents.durationValue", "{{remaining}}m / {{total}}m", {
                    remaining: active.remainingMin,
                    total: active.durationMin,
                  })}
                </strong>
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            <p class="fd-economy__muted">{tOr("rf.worldevents.noneActive", "No event currently active.")}</p>
            <p>
              <span class="fd-economy__muted">{tOr("rf.worldevents.cooldown", "Cooldown")}: </span>
              {block.cooldownReady === true ? (
                <Badge tone="accent">{tOr("rf.worldevents.cooldownReady", "Ready")}</Badge>
              ) : block.cooldownReady === false ? (
                <Badge tone="default">{tOr("rf.worldevents.cooldownWaiting", "Waiting")}</Badge>
              ) : (
                "—"
              )}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
