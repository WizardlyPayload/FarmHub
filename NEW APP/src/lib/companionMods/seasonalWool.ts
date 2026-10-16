import { selectedCompanionFarmId as validFarmId } from "./readings";

/**
 * Seasonal Wool Production reading. The shearing period and the per-sheep fee
 * are one map-wide setting shared by every farm; pen counts are private to the
 * farm that owns the pens.
 */
export type SeasonalWoolReading = {
  enabled?: boolean;
  readState?: string;
  source?: string;
  /** "map" when the block carries map-wide season facts. */
  scope?: string;
  /** Present only once the provider has initialized its period state. */
  isShearingMonth?: boolean;
  lastProcessedMonth?: number | null;
  shearingCostPerSheep?: number | null;
  /** "map" marks the fee as the shared configured setting, not a farm charge. */
  feeScope?: string;
  /** Owner of `trackedPens`; absent when no farm could be resolved. */
  farmId?: number;
  trackedPens?: number | null;
  coverage?: string;
  pensReadState?: string;
  /** Legacy all-farm total; never shown as a farm value. */
  totalWoolSheared?: number | null;
};

export type WoolSeason = "shearing" | "accumulating" | "unknown";

export type WoolView =
  | { status: "disabled" }
  | { status: "failed" }
  | { status: "pending" }
  | { status: "unavailable" }
  | { status: "other-farm" }
  | {
      status: "ok";
      season: WoolSeason;
      fee: number | null;
      pens: number | null;
      pensTruncated: boolean;
    };

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value !== "number") return null;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function woolView(
  wool: SeasonalWoolReading | null | undefined,
  farmId: number | null,
): WoolView {
  if (!wool || wool.enabled !== true) return { status: "disabled" };
  if (wool.readState === "failed") return { status: "failed" };
  if (wool.readState === "pending") return { status: "pending" };
  if (wool.readState !== "ok") return { status: "unavailable" };

  const owner = validFarmId(wool.farmId);
  const otherFarm = wool.farmId != null && owner !== validFarmId(farmId);
  const ownFarm = owner != null && owner === validFarmId(farmId);
  const mapScope = wool.scope === "map" || wool.scope === "global";
  const observed = wool.isShearingMonth === true || wool.isShearingMonth === false;
  const seasonVisible = observed && (!otherFarm || mapScope);
  if (otherFarm && !seasonVisible && wool.feeScope !== "map") return { status: "other-farm" };

  const season: WoolSeason = !seasonVisible
    ? "unknown"
    : wool.isShearingMonth === true
      ? "shearing"
      : "accumulating";
  const feeVisible = ownFarm || wool.feeScope === "map";
  return {
    status: "ok",
    season,
    fee: feeVisible ? finiteOrNull(wool.shearingCostPerSheep) : null,
    pens: ownFarm ? finiteOrNull(wool.trackedPens) : null,
    pensTruncated: ownFarm && (wool.coverage === "truncated" || wool.coverage === "partial"),
  };
}
