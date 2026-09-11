/**
 * Standalone livestock section — routing now redirects `#/livestock` → pastures.
 * Kept as a thin wrapper around LivestockPenPanel for any residual imports.
 */
import { LivestockPenPanel } from "./LivestockPenPanel";

export function LivestockSection() {
  return <LivestockPenPanel />;
}
