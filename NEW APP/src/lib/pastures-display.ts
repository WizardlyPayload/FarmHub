import type { FoodReport } from "@/lib/pastures-types";

export function pastureFoodLiters(fr: FoodReport | null | undefined): number {
  if (!fr) return 0;
  return parseFloat(String(fr.availableFood || fr.totalMixedRation || fr.food || 0)) || 0;
}

export function pastureWaterLiters(fr: FoodReport | null | undefined): number {
  if (!fr) return 0;
  return parseFloat(String(fr.water ?? 0)) || 0;
}

export function pastureStrawLiters(fr: FoodReport | null | undefined): number {
  if (!fr) return 0;
  return parseFloat(String(fr.straw ?? 0)) || 0;
}

/** Show resource row when we have animals, live monitoring, or a non-zero reading. */
export function shouldShowPastureResource(
  fr: FoodReport | null | undefined,
  resource: "food" | "water" | "straw",
  animalCount: number
): boolean {
  if ((animalCount || 0) > 0) return true;
  if (fr?.hasRealData) return true;
  if (resource === "food") return pastureFoodLiters(fr) > 0;
  if (resource === "water") return pastureWaterLiters(fr) > 0;
  return pastureStrawLiters(fr) > 0;
}

export function pastureResourceMonitored(
  fr: FoodReport | null | undefined,
  resource: "food" | "water" | "straw"
): boolean {
  if (!fr || fr.hasRealData === false) return false;
  if (resource === "food") {
    return (
      pastureFoodLiters(fr) > 0 ||
      Number(fr.totalCapacity) > 0 ||
      Number(fr.hay) > 0 ||
      Number(fr.silage) > 0
    );
  }
  if (resource === "water") return fr.water !== undefined;
  return fr.straw !== undefined;
}
