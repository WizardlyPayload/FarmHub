import type { RealisticFarmingPayload } from "@/types/dashboard";
import type { ModPresence } from "@/lib/modPresence";

/** True when RF suite soft-detect says any companion/core is active. */
export function isRealisticFarmingActive(
  rf: RealisticFarmingPayload | null | undefined,
  presence?: ModPresence | null,
): boolean {
  if (presence?.realisticFarming) return true;
  if (!rf || typeof rf !== "object") return false;
  if (rf.presence?.enabled) return true;
  return Object.values(rf).some((block) => {
    if (!block || typeof block !== "object") return false;
    return (block as { enabled?: boolean }).enabled === true;
  });
}
