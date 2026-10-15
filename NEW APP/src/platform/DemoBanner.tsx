import { tOr } from "@/i18n/i18n";
import { Button } from "@/components/ui";
import { demoWritesAreLocked } from "@/platform/demo-source";
import { isPublicDemoHost } from "@/platform/viewer-mode";
import { useDashboardStore } from "@/store/dashboard-store";
import "@/platform/platform.css";

export function DemoBanner() {
  const dataSource = useDashboardStore((s) => s.payload?.dataSource);
  const recorded = dataSource === "recorded-demo" || demoWritesAreLocked();
  if (!recorded && !isPublicDemoHost()) return null;
  return (
    <div class="fd-demo-banner" role="status">
      <span>
        <strong>
          {recorded
            ? tOr("viewer.recordedStrong", "Recorded demo")
            : tOr("viewer.demoStrong", "Live demo")}
        </strong>
        {" — "}
        {recorded
          ? tOr(
              "viewer.recordedBody",
              "A saved example. It does not connect to a live farm or change settings.",
            )
          : tOr(
              "viewer.demoBody",
              "read-only view of a real farm save. Data updates while we play.",
            )}
      </span>
      <span style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <a href="https://www.farmdashboard.co.uk/demo.html" target="_blank" rel="noopener">
          {tOr("viewer.demoAbout", "About this demo")}
        </a>
        <a href="https://discord.gg/ZCG9C7h7aT" target="_blank" rel="noopener noreferrer">
          Discord
        </a>
        <Button variant="ghost" onClick={() => window.location.reload()}>
          {tOr("viewer.refresh", "Refresh")}
        </Button>
      </span>
    </div>
  );
}
