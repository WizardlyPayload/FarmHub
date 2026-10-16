import { useDashboardStore } from "@/store/dashboard-store";
import {
  effectiveFillUnitMode,
  physicsFromPayload,
  unitDisplayFromPayload,
  type FillPhysicsMap,
  type FillUnitMode,
  type UnitDisplayInfo,
} from "@/lib/fill-units";

/** Follow a readable fill-unit provider. A viewer choice applies when none owns the export. */
export function useFillUnitMode(): FillUnitMode {
  const unitDisplay = useDashboardStore((s) => unitDisplayFromPayload(s.payload));
  const viewerMode = useDashboardStore((s) => s.viewerFillUnitMode);
  return effectiveFillUnitMode(unitDisplay, viewerMode);
}

export function useUnitDisplay(): UnitDisplayInfo {
  return useDashboardStore((s) => unitDisplayFromPayload(s.payload));
}

export function useFillPhysics(): FillPhysicsMap {
  return useDashboardStore((s) => physicsFromPayload(s.payload));
}
