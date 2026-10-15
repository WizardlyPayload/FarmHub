/** Companion mods shown on a FarmHub page instead of their own `#mod-<key>` page, by destination section. */
export const FOLDED_COMPANIONS = {
  timeSavingStockCheck: "storage",
  productionWatcher: "productions",
  courseplay: "vehicles",
  vehicleYears: "vehicles",
  vehicleMileage: "vehicles",
  outOfFuel: "vehicles",
  advancedMaintenance: "vehicles",
  collisionDamage: "vehicles",
  puncturedTires: "vehicles",
  bushelPlus: "vehicles",
  soilWorkYieldBonus: "fields",
  // Unit mods have no page: they drive fill units everywhere (see `effectiveFillUnitMode`).
  britishFillUnits: "economy",
  imperialSystem: "economy",
} as const;

export type FoldedCompanionKey = keyof typeof FOLDED_COMPANIONS;

export const FOLDED_COMPANION_IDS = Object.keys(FOLDED_COMPANIONS) as FoldedCompanionKey[];

export function isFoldedCompanion(id: string | null | undefined): id is FoldedCompanionKey {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(FOLDED_COMPANIONS, id);
}
