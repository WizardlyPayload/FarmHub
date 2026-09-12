import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(root, "src/sections/economy/EconomySection.tsx"), "utf8");
const start = src.indexOf("function RedTapeTab(");
const end = src.indexOf("export function EconomySection(");
if (start < 0 || end < 0) {
  console.error("markers not found", { start, end });
  process.exit(1);
}
const redTapeFn = src.slice(start, end);

const header = `import { t } from "@/i18n/i18n";
import { Badge, Card } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import type { DashboardPayload } from "@/types/dashboard";
import {
  formatMoney as rtFormatMoney,
  getCropRotationRows,
  getRedTapeForActiveFarm,
  isRedTapeModActive,
  rtLabel,
  tierTone,
  type RedTapePayload,
} from "@/lib/redTape";
import "@/sections/economy/economy.css";

`;

const footer = `
export function RedTapeSection() {
  const payload = useDashboardStore((s) => s.payload);
  const farmId = useDashboardStore((s) => s.activeFarmId) ?? 1;
  if (!payload || payload.error) {
    return (
      <div class="fd-economy">
        <header class="fd-section-header">
          <h2>{t("nav.section.redtape")}</h2>
          <p class="fd-muted-sm">{t("redtape.hintDisabled")}</p>
        </header>
      </div>
    );
  }
  return (
    <div class="fd-economy">
      <header class="fd-section-header">
        <h2>{t("nav.section.redtape")}</h2>
      </header>
      <RedTapeTab payload={payload} farmId={farmId} />
    </div>
  );
}

export { RedTapeTab };
`;

fs.writeFileSync(path.join(root, "src/sections/redtape/RedTapeSection.tsx"), header + redTapeFn + footer);
console.log("wrote redtape");
