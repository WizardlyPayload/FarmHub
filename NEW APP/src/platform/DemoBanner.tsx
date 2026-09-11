import { tOr } from "@/i18n/i18n";
import { Button } from "@/components/ui";
import { isPublicDemoHost } from "@/platform/viewer-mode";
import "@/platform/platform.css";

export function DemoBanner() {
  if (!isPublicDemoHost()) return null;
  return (
    <div class="fd-demo-banner" role="status">
      <span>
        <strong>{tOr("viewer.demoStrong", "Live demo")}</strong>
        {" — "}
        {tOr(
          "viewer.demoBody",
          "read-only view of a real multiplayer farm. Data updates while we play.",
        )}
      </span>
      <span style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <a href="https://www.farmdashboard.co.uk/demo.html" target="_blank" rel="noopener">
          {tOr("viewer.demoAbout", "About this demo")}
        </a>
        <a href="https://discord.gg/qsSTRwG2" target="_blank" rel="noopener noreferrer">
          Discord
        </a>
        <Button variant="ghost" onClick={() => window.location.reload()}>
          {tOr("viewer.refresh", "Refresh")}
        </Button>
      </span>
    </div>
  );
}
