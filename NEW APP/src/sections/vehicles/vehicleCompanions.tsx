import type { ComponentChildren } from "preact";
import { useMemo } from "preact/hooks";
import { Badge } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import { formatCurrency } from "@/lib/economy";
import { useUnitDisplay } from "@/lib/fill-unit-mode";
import { saveProfileFromUnitDisplay } from "@/lib/profile-display";
import {
  KM_PER_MILE,
  finite,
  indexVehicleRows,
  listOf,
  useFoldedCompanion,
  vehicleRowFor,
  type VehicleIdentity,
} from "@/lib/companionFold";
import { getVehicleOdoKm, getVehicleTripKm } from "@/lib/vehicleMileage";
import type { FleetVehicle } from "@/lib/vehicles";

type CpCourses = { count?: number; names?: string[]; workWidth?: number };
type CpStatus = {
  waypoint?: number;
  waypoints?: number;
  remainingTime?: string;
  balesLeft?: number;
  compactionPct?: number;
  fillLeftPct?: number;
};
export type CpVehicle = {
  id?: string | number;
  cpActive?: boolean;
  otherHelper?: boolean;
  fieldWork?: boolean;
  driveToField?: boolean;
  recording?: boolean;
  selectedJob?: string;
  courses?: CpCourses;
  status?: CpStatus;
};
type CpSetting = { name?: string; value?: number | boolean; text?: string };
type YearsRow = { id?: string | number; year?: number };
type MileageRow = { id?: string | number; odoKm?: number; tripKm?: number };
type FuelRow = { id?: string | number; topUpLitres?: number; topUpCost?: number };
export type MaintenanceRow = { id?: string | number; damagePct?: number; zone?: "ok" | "risk" | "locked"; oddsPerCheck?: number };
export type CollisionRow = { id?: string | number; hitThisSession?: boolean; lastHitMinutesAgo?: number };
export type TyreRow = {
  id?: string | number;
  punctured?: boolean;
  armed?: boolean;
  punctureType?: number;
  axle?: "front" | "rear" | "middle";
  side?: "left" | "right";
  position?: "inner" | "outer";
  metersToPuncture?: number;
};
type BushelCombine = { name?: string; equipped?: boolean; bonusPercent?: number };
type BushelUnit = { onCombine?: boolean };

export type VehicleCompanions = {
  courseplay: { detected: boolean; byId: Map<string, CpVehicle>; settings: CpSetting[] };
  years: {
    detected: boolean;
    byId: Map<string, YearsRow>;
    oldest: number | null;
    newest: number | null;
    average: number | null;
  };
  mileage: { detected: boolean; byId: Map<string, MileageRow>; miles: boolean };
  fuel: {
    detected: boolean;
    byId: Map<string, FuelRow>;
    floorPct: number;
    patched: boolean | null;
    topUpLitres: number | null;
    topUpCost: number | null;
  };
  maintenance: { detected: boolean; byId: Map<string, MaintenanceRow>; locked: number | null; risk: number | null };
  collision: { detected: boolean; byId: Map<string, CollisionRow>; hits: number | null; sessionTracking: boolean };
  tyres: { detected: boolean; byId: Map<string, TyreRow>; punctured: number | null; armed: number | null };
  bushel: { detected: boolean; fitted: BushelCombine[]; combines: number | null; idleUnits: number };
};

export function useVehicleCompanions(): VehicleCompanions {
  const cp = useFoldedCompanion("courseplay");
  const vy = useFoldedCompanion("vehicleYears");
  const vm = useFoldedCompanion("vehicleMileage");
  const oof = useFoldedCompanion("outOfFuel");
  const am = useFoldedCompanion("advancedMaintenance");
  const cd = useFoldedCompanion("collisionDamage");
  const pt = useFoldedCompanion("puncturedTires");
  const bp = useFoldedCompanion("bushelPlus");
  return useMemo(() => {
    const settings = (oof.page?.settings && typeof oof.page.settings === "object" ? oof.page.settings : {}) as Record<string, unknown>;
    return {
      courseplay: {
        detected: cp.detected,
        byId: indexVehicleRows(listOf<CpVehicle>(cp.farmData?.vehicles)),
        settings: listOf<CpSetting>(cp.page?.globalSettings),
      },
      years: {
        detected: vy.detected,
        byId: indexVehicleRows(listOf<YearsRow>(vy.farmData?.vehicles)),
        oldest: finite(vy.farmData?.oldestYear),
        newest: finite(vy.farmData?.newestYear),
        average: finite(vy.farmData?.averageYear),
      },
      mileage: {
        detected: vm.detected,
        byId: indexVehicleRows(listOf<MileageRow>(vm.farmData?.vehicles)),
        miles: vm.page?.useMiles === true,
      },
      fuel: {
        detected: oof.detected,
        byId: indexVehicleRows(listOf<FuelRow>(oof.farmData?.vehicles)),
        floorPct: finite(oof.page?.floorPct) ?? 10,
        patched: typeof settings.patched === "boolean" ? settings.patched : null,
        topUpLitres: finite(oof.farmData?.topUpLitres),
        topUpCost: finite(oof.farmData?.topUpCost),
      },
      maintenance: {
        detected: am.detected && am.farmData != null,
        byId: indexVehicleRows(listOf<MaintenanceRow>(am.farmData?.machines)),
        locked: finite(am.farmData?.lockedCount),
        risk: finite(am.farmData?.riskCount),
      },
      collision: {
        detected: cd.detected && cd.farmData != null,
        byId: cd.page?.sessionTracking === false ? new Map() : indexVehicleRows(listOf<CollisionRow>(cd.farmData?.machines)),
        hits: finite(cd.farmData?.hitCount),
        sessionTracking: cd.page?.sessionTracking !== false,
      },
      tyres: {
        detected: pt.detected && pt.farmData != null,
        byId: indexVehicleRows(listOf<TyreRow>(pt.farmData?.vehicles)),
        punctured: finite(pt.farmData?.puncturedCount),
        armed: finite(pt.farmData?.armedCount),
      },
      bushel: {
        detected: bp.detected && bp.farmData != null,
        fitted: listOf<BushelCombine>(bp.page?.combines).filter((c) => c.equipped === true),
        combines: finite(bp.farmData?.combineCount),
        idleUnits: listOf<BushelUnit>(bp.page?.units).filter((u) => u.onCombine !== true).length,
      },
    };
  }, [cp, vy, vm, oof, am, cd, pt, bp]);
}

function fmt(value: number, dp: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Distance in the game's unit: one decimal under 100, whole numbers above. */
export function formatDistance(km: number | null | undefined, miles: boolean): string {
  if (km == null || !Number.isFinite(km)) return "—";
  const n = miles ? km / KM_PER_MILE : km;
  const value = fmt(n, Math.abs(n) < 100 ? 1 : 0);
  return miles
    ? tOr("companionPage.vehicleMileage.miles", "{{value}} mi", { value })
    : tOr("companionPage.vehicleMileage.km", "{{value}} km", { value });
}

export function companionModelYear(c: VehicleCompanions, vehicle: VehicleIdentity): number | null {
  if (!c.years.detected) return null;
  return finite(vehicleRowFor(c.years.byId, vehicle)?.year);
}

/** Odometer and trip in km: the Vehicle Mileage page export first, then the vehicle's own mileage nest. */
export function vehicleDistance(c: VehicleCompanions, vehicle: FleetVehicle): { odoKm: number | null; tripKm: number | null } {
  const row = c.mileage.detected ? vehicleRowFor(c.mileage.byId, vehicle) : undefined;
  return {
    odoKm: finite(row?.odoKm) ?? getVehicleOdoKm(vehicle),
    tripKm: finite(row?.tripKm) ?? getVehicleTripKm(vehicle),
  };
}

export function showMileage(c: VehicleCompanions, vehicles: FleetVehicle[]): boolean {
  return c.mileage.detected || vehicles.some((v) => v.mileage?.enabled === true);
}

export function useMoneyText(): (amount: number | null) => string {
  const profile = saveProfileFromUnitDisplay(useUnitDisplay());
  return (amount) => (amount == null ? "—" : formatCurrency(amount, profile));
}

/* ── Courseplay ── */

export function cpActivity(v: CpVehicle): { label: string; tone: "accent" | "default" } {
  if (v.recording) return { label: tOr("companionPage.courseplay.actRecording", "Recording a course"), tone: "accent" };
  if (v.cpActive && v.driveToField) return { label: tOr("companionPage.courseplay.actDriveToField", "Driving to field"), tone: "accent" };
  if (v.cpActive && v.fieldWork) return { label: tOr("companionPage.courseplay.actFieldWork", "Field work"), tone: "accent" };
  if (v.cpActive) return { label: tOr("companionPage.courseplay.actActive", "Courseplay driving"), tone: "accent" };
  if (v.otherHelper) return { label: tOr("companionPage.courseplay.actOtherHelper", "Other helper"), tone: "default" };
  return { label: tOr("companionPage.courseplay.actIdle", "Idle"), tone: "default" };
}

export function cpCourseText(courses: CpCourses | undefined): string {
  const count = finite(courses?.count) ?? 0;
  if (!courses || count <= 0) return tOr("companionPage.courseplay.noCourse", "No course loaded");
  const names = (Array.isArray(courses.names) ? courses.names : []).filter((n) => typeof n === "string" && n !== "");
  const label = names.length > 0 ? names.join(", ") : tOr("companionPage.courseplay.unnamedCourse", "Unnamed course");
  const extra =
    count > names.length && names.length > 0
      ? tOr("companionPage.courseplay.moreCourses", " (+{{n}} more)", { n: count - names.length })
      : "";
  return `${label}${extra}`;
}

export function cpProgressText(status: CpStatus | undefined): string | null {
  if (!status) return null;
  const parts: string[] = [];
  const waypoint = finite(status.waypoint);
  const waypoints = finite(status.waypoints);
  if (waypoint != null && waypoints != null && waypoints > 0) {
    parts.push(tOr("companionPage.courseplay.waypointOf", "Waypoint {{n}} of {{total}}", { n: fmt(waypoint, 0), total: fmt(waypoints, 0) }));
  }
  if (status.remainingTime) parts.push(tOr("companionPage.courseplay.remaining", "{{time}} left", { time: status.remainingTime }));
  const bales = finite(status.balesLeft);
  if (bales != null && bales > 0) parts.push(tOr("companionPage.courseplay.balesLeft", "{{n}} bales left", { n: fmt(bales, 0) }));
  const fillLeft = finite(status.fillLeftPct);
  if (fillLeft != null && fillLeft > 0) {
    parts.push(tOr("companionPage.courseplay.fillLeft", "{{pct}} still to unload", { pct: `${fmt(fillLeft, 0)}%` }));
  }
  const compaction = finite(status.compactionPct);
  if (compaction != null && compaction > 0) {
    parts.push(tOr("companionPage.courseplay.compaction", "{{pct}} compacted", { pct: `${fmt(compaction, 0)}%` }));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Courseplay status for one vehicle: what it is doing, its job and course, and progress while driving. */
export function CourseplayStatus({ row }: { row: CpVehicle }) {
  const activity = cpActivity(row);
  const progress = row.cpActive ? cpProgressText(row.status) : null;
  const detail = [row.selectedJob, cpCourseText(row.courses)].filter(Boolean).join(" · ");
  return (
    <span class="fd-vehicles__cp" data-fold="courseplay">
      <Badge tone={activity.tone}>{activity.label}</Badge>
      <small class="fd-muted">{detail}</small>
      {progress ? <small class="fd-muted">{progress}</small> : null}
    </span>
  );
}

const CP_SETTING_LABELS: Record<string, [string, string]> = {
  wageModifier: ["companionPage.courseplay.setWage", "Worker wage"],
  autoRepair: ["companionPage.courseplay.setAutoRepair", "Auto repair"],
  fuelThreshold: ["companionPage.courseplay.setFuel", "Refuel below"],
  waitForRefueling: ["companionPage.courseplay.setWaitFuel", "Wait for refuelling"],
  brokenThreshold: ["companionPage.courseplay.setBroken", "Stop when damage above"],
  stopThreshingDuringRain: ["companionPage.courseplay.setRain", "Stop threshing in rain"],
  fruitDestruction: ["companionPage.courseplay.setFruit", "Crop destruction"],
  expertModeActive: ["companionPage.courseplay.setExpert", "Expert mode"],
  distanceUnit: ["companionPage.courseplay.setDistance", "Distance unit"],
};

function settingValue(row: CpSetting): string {
  if (typeof row.text === "string" && row.text !== "") return row.text;
  if (row.value === true) return tOr("companionPage.shared.yes", "Yes");
  if (row.value === false) return tOr("companionPage.shared.no", "No");
  const n = finite(row.value);
  return n == null ? "—" : fmt(n, Number.isInteger(n) ? 0 : 2);
}

/** Courseplay's global settings, folded away under the fleet summary. */
export function CourseplaySettings({ settings }: { settings: CpSetting[] }) {
  const rows = settings.filter((row) => typeof row.name === "string" && CP_SETTING_LABELS[row.name]);
  if (rows.length === 0) return null;
  return (
    <details class="fd-vehicles__mod-details" data-fold="courseplay-settings">
      <summary>{tOr("vehicles.fold.courseplaySettings", "Courseplay settings")}</summary>
      <dl class="fd-vehicles__mod-kv">
        {rows.map((row) => {
          const [key, fallback] = CP_SETTING_LABELS[row.name as string];
          return (
            <div key={row.name} data-kv={row.name}>
              <dt>{tOr(key, fallback)}</dt>
              <dd>{settingValue(row)}</dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}

/* ── Out Of Fuel ── */

export function fuelTopUpLitres(c: VehicleCompanions, vehicle: VehicleIdentity): number | null {
  if (!c.fuel.detected || c.fuel.patched === false) return null;
  const litres = finite(vehicleRowFor(c.fuel.byId, vehicle)?.topUpLitres);
  return litres != null && litres > 0 ? litres : null;
}

/** Per-vehicle line under a fuel reading: the load top-up Out Of Fuel no longer gives this tank. */
export function FuelTopUpNote({ litres }: { litres: number | null }) {
  if (litres == null) return null;
  return (
    <small class="fd-muted fd-vehicles__fuel-note" data-fold="outOfFuel">
      {tOr("vehicles.fold.noTopUp", "No top-up on load ({{litres}} L)", { litres: fmt(litres, 0) })}
    </small>
  );
}

/** Fleet note next to the fuel figures: the game's load top-up is off, and what it would have added. */
export function OutOfFuelNote({ fuel }: { fuel: VehicleCompanions["fuel"] }) {
  const money = useMoneyText();
  if (!fuel.detected) return null;
  if (fuel.patched === false) {
    return (
      <p class="fd-vehicles__mod-note" data-fold="outOfFuel">
        {tOr("vehicles.fold.outOfFuelNotPatched", "Out Of Fuel is installed, but the game's top-up on load is still on.")}
      </p>
    );
  }
  const pct = fmt(fuel.floorPct, 0);
  const litres = fuel.topUpLitres != null && fuel.topUpLitres > 0 ? fuel.topUpLitres : null;
  return (
    <p class="fd-vehicles__mod-note" data-fold="outOfFuel">
      {tOr("vehicles.fold.outOfFuelNote", "Out Of Fuel: tanks are no longer topped up to {{pct}}% when the save loads.", { pct })}
      {litres != null ? (
        <>
          {" "}
          {fuel.topUpCost != null
            ? tOr("vehicles.fold.outOfFuelTopUpCost", "That top-up would add {{litres}} L across the fleet (about {{cost}}).", {
                litres: fmt(litres, 0),
                cost: money(fuel.topUpCost),
              })
            : tOr("vehicles.fold.outOfFuelTopUp", "That top-up would add {{litres}} L across the fleet.", { litres: fmt(litres, 0) })}
        </>
      ) : null}
    </p>
  );
}

/* ── Advanced Maintenance, Collision Damage, Punctured Tires: per-vehicle flags ── */

function wheelText(row: TyreRow): string {
  const parts: string[] = [];
  if (row.axle === "front") parts.push(tOr("companionPage.puncturedTires.axleFront", "Front"));
  if (row.axle === "rear") parts.push(tOr("companionPage.puncturedTires.axleRear", "Rear"));
  if (row.axle === "middle") parts.push(tOr("companionPage.puncturedTires.axleMiddle", "Middle"));
  if (row.side === "left") parts.push(tOr("companionPage.puncturedTires.sideLeft", "left"));
  if (row.side === "right") parts.push(tOr("companionPage.puncturedTires.sideRight", "right"));
  if (row.position === "inner") parts.push(tOr("companionPage.puncturedTires.posInner", "inner"));
  if (row.position === "outer") parts.push(tOr("companionPage.puncturedTires.posOuter", "outer"));
  return parts.join(" ");
}

function hitWhen(minutes: number | null): string {
  if (minutes == null) return tOr("companionPage.collisionDamage.hitEarlier", "This session");
  if (minutes < 1) return tOr("companionPage.collisionDamage.justNow", "Just now");
  if (minutes < 120) return tOr("companionPage.collisionDamage.minutesAgo", "{{n}} min ago", { n: fmt(minutes, 0) });
  return tOr("companionPage.collisionDamage.hoursAgo", "{{n}} h ago", { n: fmt(minutes / 60, 1) });
}

/** Engine zone, this session's collision and tyre state for one vehicle; nothing when all is well. */
export function VehicleModFlags({ c, vehicle }: { c: VehicleCompanions; vehicle: VehicleIdentity }) {
  const maint = c.maintenance.detected ? vehicleRowFor(c.maintenance.byId, vehicle) : undefined;
  const hit = c.collision.detected ? vehicleRowFor(c.collision.byId, vehicle) : undefined;
  const tyre = c.tyres.detected ? vehicleRowFor(c.tyres.byId, vehicle) : undefined;
  const flags: ComponentChildren[] = [];
  if (maint?.zone === "locked") {
    flags.push(
      <span key="am" data-fold="advancedMaintenance">
        <Badge tone="danger">{tOr("companionPage.advancedMaintenance.zoneLocked", "Will not start")}</Badge>
      </span>,
    );
  } else if (maint?.zone === "risk") {
    const odds = finite(maint.oddsPerCheck);
    flags.push(
      <span key="am" data-fold="advancedMaintenance">
        <Badge tone="warn">{tOr("companionPage.advancedMaintenance.zoneRisk", "May stall")}</Badge>
        {odds != null ? (
          <small class="fd-muted"> {tOr("companionPage.advancedMaintenance.odds", "1 in {{n}}", { n: fmt(odds, 0) })}</small>
        ) : null}
      </span>,
    );
  }
  if (hit?.hitThisSession === true) {
    flags.push(
      <span key="cd" data-fold="collisionDamage">
        <Badge tone="warn">
          {tOr("vehicles.fold.collisionHit", "Collision {{when}}", { when: hitWhen(finite(hit.lastHitMinutesAgo)) })}
        </Badge>
      </span>,
    );
  }
  if (tyre?.punctured === true) {
    const wheel = wheelText(tyre);
    flags.push(
      <span key="pt" data-fold="puncturedTires">
        <Badge tone="danger">
          {wheel
            ? tOr("vehicles.fold.punctureAt", "Puncture: {{wheel}}", { wheel })
            : tOr("vehicles.fold.puncture", "Puncture")}
        </Badge>
      </span>,
    );
  } else if (tyre?.armed === true) {
    const metres = finite(tyre.metersToPuncture);
    flags.push(
      <span key="pt" data-fold="puncturedTires">
        <Badge tone="warn">
          {metres != null
            ? tOr("companionPage.puncturedTires.stateArmed", "Nail in tyre, flat in {{m}} m", { m: fmt(metres, 0) })
            : tOr("vehicles.fold.nailInTyre", "Nail in tyre")}
        </Badge>
      </span>,
    );
  }
  if (flags.length === 0) return null;
  return <span class="fd-vehicles__mod-flags">{flags}</span>;
}

/* ── Bushel Plus: which combines carry the loss-measurement pan ── */

export function BushelPlusNote({ bushel }: { bushel: VehicleCompanions["bushel"] }) {
  if (!bushel.detected) return null;
  const total = bushel.combines ?? 0;
  if (total === 0 && bushel.fitted.length === 0 && bushel.idleUnits === 0) return null;
  const names = bushel.fitted
    .map((row) => {
      const bonus = finite(row.bonusPercent);
      return bonus != null ? `${row.name ?? "?"} (+${fmt(bonus, Number.isInteger(bonus) ? 0 : 1)}%)` : row.name ?? "?";
    })
    .join(", ");
  return (
    <p class="fd-vehicles__mod-note" data-fold="bushelPlus">
      {bushel.fitted.length > 0
        ? tOr("vehicles.fold.bushelFitted", "Bushel Plus: fitted on {{count}} of {{total}} combines, {{names}}.", {
            count: bushel.fitted.length,
            total,
            names,
          })
        : tOr("vehicles.fold.bushelNone", "Bushel Plus: no combine has one attached, so none gets the yield bonus.")}
      {bushel.idleUnits > 0 ? (
        <> {tOr("vehicles.fold.bushelIdle", "{{count}} unit(s) not on a combine.", { count: bushel.idleUnits })}</>
      ) : null}
    </p>
  );
}
