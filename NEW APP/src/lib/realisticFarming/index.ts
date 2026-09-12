/** Realistic Farming helpers — domain agents own subfolders; this barrel is Coordinator-frozen. */

export type { RealisticFarmingPayload } from "@/types/dashboard";
export { isRealisticFarmingActive } from "./presence";
export {
  RF_TESTED_MODS,
  buildRfCompatibilityRows,
  buildDetectedRfCompatRows,
  countDetectedRfMods,
  compareRfVersions,
  type RfCompatRow,
  type RfCompatStatus,
} from "./compatibility";

export * as land from "./land";
export * as economy from "./economy";
export * as dairy from "./dairy";
export * as life from "./life";
export * as depot from "./depot";
export * as cores from "./cores";
