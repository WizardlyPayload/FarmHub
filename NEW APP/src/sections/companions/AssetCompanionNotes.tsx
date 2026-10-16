import type { ComponentChildren } from "preact";
import { Badge, Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import { formatFillQuantity } from "@/lib/fill-units";
import { useFillPhysics, useFillUnitMode, useUnitDisplay } from "@/lib/fill-unit-mode";
import type { EconomyLike, FillTypeCatalog, FillTypeTitles, StockItem } from "@/lib/fillTypeResolve";
import { displayFillTypeName } from "@/lib/storage";
import {
  activeSiloSlot,
  readAdvancedMaintenance,
  readExtendedMaintenance,
  readPalletCondition,
  readRealSilo,
  readSeasonalMilk,
  readVehicleService,
  serviceFaults,
  type AssetStatus,
  type CompanionCoverage,
  type CompanionModsPayload,
  type RealSiloRow,
} from "@/lib/companionMods";
import { companionPanelId } from "@/lib/companionMods/presentation";
import { useDashboardStore } from "@/store/dashboard-store";
import { StatTiles } from "./StatTiles";

export type AssetLiveKey =
  | "advancedMaintenance"
  | "extendedVehicleMaintenance"
  | "realisticVehicleService"
  | "realSilo"
  | "palletDegradation"
  | "seasonalMilk";

const ASSET_KEYS = new Set<string>([
  "advancedMaintenance",
  "extendedVehicleMaintenance",
  "realisticVehicleService",
  "realSilo",
  "palletDegradation",
  "seasonalMilk",
]);

export function isAssetLiveKey(key: string): key is AssetLiveKey {
  return ASSET_KEYS.has(key);
}

function useAssetContext() {
  const payload = useDashboardStore((s) => s.payload);
  const selectedFarmId = useDashboardStore((s) => s.activeFarmId);
  const farmId = typeof selectedFarmId === "number" ? selectedFarmId : Number.NaN;
  const companion = (payload?.companionMods ?? null) as CompanionModsPayload | null;
  return { companion, farmId };
}

function monthName(period: number): string {
  return tOr("companions.periodLabel", "Period {{period}}", { period });
}

function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => (params[key] != null ? String(params[key]) : ""));
}

function text(key: string, fallback: string, params: Record<string, string | number> = {}): string {
  return fill(tOr(key, fallback, params), params);
}

function names(rows: Array<{ name?: string; id?: string }>): string {
  return rows
    .slice(0, 4)
    .map((row) => row.name || row.id || "")
    .filter(Boolean)
    .join(", ");
}

/** Line for a reading that is not a plain complete result; null when there is nothing to caveat. */
export function assetStatusText(status: AssetStatus, coverage: CompanionCoverage | "unknown" = "complete"): string | null {
  switch (status) {
    case "failed":
      return text("companions.live.readFailed", "This reading failed. It is not an empty result.");
    case "pending":
      return text("companions.live.readPending", "This reading is not ready yet.");
    case "no-farm":
      return text("companions.live.needsFarm", "Needs a selected farm before these numbers can be read.");
    case "unavailable":
      return text("companions.live.readUnavailable", "This mod's reading is not available in this save.");
    case "disabled":
      return text("companions.live.readDisabled", "This reading is disabled.");
    case "other-farm":
      return text("companions.live.otherFarm", "These numbers are for another farm.");
    case "unknown":
      return text("companions.live.readUnknown", "This reading reported a state FarmHub does not recognise.");
    case "ok":
    case "empty":
      if (coverage === "truncated") return text("companions.live.readTruncated", "Only part of this farm was read. The real count may be higher.");
      if (coverage === "partial" || coverage === "unknown") return text("companions.live.readPartial", "Some items were not ready to read. The real count may be higher.");
      if (coverage === "unsupported") return text("companions.live.readUnsupported", "Coverage for this reading is not supported.");
      return null;
    default: {
      const never: never = status;
      return never;
    }
  }
}

function emptyAssetText(reading: { coverage: CompanionCoverage | "unknown" }, key: string, fallback: string): string {
  return reading.coverage === "complete"
    ? text(key, fallback)
    : text("companions.live.assetPartialEmpty", "No matching items were found in the portion of this farm that was read.");
}

function Muted({ children }: { children: string }) {
  return <p class="fd-economy__muted">{children}</p>;
}

function StatusOr({ status, coverage, children }: { status: AssetStatus; coverage: CompanionCoverage | "unknown"; children: () => ComponentChildren }) {
  const note = assetStatusText(status, coverage);
  if (status !== "ok" && status !== "empty") return <Muted>{note || ""}</Muted>;
  return (
    <>
      {children()}
      {note ? <Muted>{note}</Muted> : null}
    </>
  );
}

function MaintenanceLines({ companion, farmId }: { companion: CompanionModsPayload; farmId: number }) {
  const lines: ComponentChildren[] = [];
  if (companion.advancedMaintenance) {
    const am = readAdvancedMaintenance(companion.advancedMaintenance, farmId);
    lines.push(
      <div key="am" data-asset="advancedMaintenance">
        <StatusOr status={am.status} coverage={am.coverage}>
          {() =>
            am.blocked.length ? (
              <Badge tone="warn">
                {text("companions.live.maintenanceBlocked", "{{count}} machine(s) cannot start: {{names}}", {
                  count: am.blocked.length,
                  names: names(am.blocked),
                })}
              </Badge>
            ) : (
              <Muted>{emptyAssetText(am, "companions.live.maintenanceClear", "No machine on this farm is blocked from starting.")}</Muted>
            )
          }
        </StatusOr>
      </div>,
    );
  }
  if (companion.extendedVehicleMaintenance) {
    const evm = readExtendedMaintenance(companion.extendedVehicleMaintenance, farmId);
    lines.push(
      <div key="evm" data-asset="extendedVehicleMaintenance">
        <StatusOr status={evm.status} coverage={evm.coverage}>
          {() => (
            <>
              {evm.inService.length ? (
                <Badge>
                  {text("companions.live.evmService", "{{count}} machine(s) in service: {{names}}", {
                    count: evm.inService.length,
                    names: names(evm.inService),
                  })}
                </Badge>
              ) : (
                <Muted>{emptyAssetText(evm, "companions.live.evmClear", "No machine on this farm is in service.")}</Muted>
              )}
              {evm.failing.length ? (
                <Badge tone="warn">
                  {text("companions.live.evmFailures", "{{count}} machine(s) with a failure: {{names}}", {
                    count: evm.failing.length,
                    names: names(evm.failing),
                  })}
                </Badge>
              ) : null}
            </>
          )}
        </StatusOr>
      </div>,
    );
  }
  if (companion.realisticVehicleService) {
    const rvs = readVehicleService(companion.realisticVehicleService, farmId);
    lines.push(
      <div key="rvs" data-asset="realisticVehicleService">
        <StatusOr status={rvs.status} coverage={rvs.coverage}>
          {() => (
            <>
              {rvs.faulted.length ? (
                <Badge tone="warn">
                  {text("companions.live.rvsFaults", "{{count}} machine(s) with a stored fault: {{names}}", {
                    count: rvs.faulted.length,
                    names: rvs.faulted
                      .slice(0, 4)
                      .map((row) => `${row.name || row.id || ""} (${serviceFaults(row).join(", ")})`)
                      .join("; "),
                  })}
                </Badge>
              ) : (
                <Muted>{emptyAssetText(rvs, "companions.live.rvsClear", "No stored service faults on this farm.")}</Muted>
              )}
              {rvs.serviceSoon.length ? (
                <Badge>{text("companions.live.rvsServiceSoon", "{{count}} machine(s) due for service soon", { count: rvs.serviceSoon.length })}</Badge>
              ) : null}
              {rvs.warmingUp.length ? (
                <Badge>{text("companions.live.rvsWarmup", "{{count}} machine(s) warming up", { count: rvs.warmingUp.length })}</Badge>
              ) : null}
              {rvs.lowestCondition != null ? (
                <Badge>{text("companions.live.rvsCondition", "Lowest condition {{percent}}%", { percent: Math.round(rvs.lowestCondition) })}</Badge>
              ) : null}
            </>
          )}
        </StatusOr>
      </div>,
    );
  }
  return <>{lines}</>;
}

/** Mods whose readings `FleetMaintenanceNotes` already shows on the fleet page. */
export const FLEET_NOTES_IDS = ["advancedMaintenance", "extendedVehicleMaintenance", "realisticVehicleService"] as const;

/** Fleet page: maintenance mods read for the selected farm, next to the native damage cards. */
export function FleetMaintenanceNotes() {
  const { companion, farmId } = useAssetContext();
  if (!companion || (!companion.advancedMaintenance && !companion.extendedVehicleMaintenance && !companion.realisticVehicleService)) {
    return null;
  }
  return (
    <Card class="fd-asset-notes" title={text("companions.assets.fleetTitle", "Maintenance mods")}>
      <MaintenanceLines companion={companion} farmId={farmId} />
    </Card>
  );
}

function SiloRow({
  row,
  catalog,
  titles,
  economy,
}: {
  row: RealSiloRow;
  catalog: FillTypeCatalog | null | undefined;
  titles: FillTypeTitles | null | undefined;
  economy: EconomyLike | null | undefined;
}) {
  const fillMode = useFillUnitMode();
  const fillPhysics = useFillPhysics();
  const unitDisplay = useUnitDisplay();
  const slot = activeSiloSlot(row);
  const index = typeof slot?.fillType === "number" ? slot.fillType : null;
  const cropName = index != null ? displayFillTypeName({ fillTypeIndex: index } as StockItem, catalog, economy, titles, fillMode) : "";
  const fillKey = (index != null && catalog?.[String(index)]) || index || cropName;
  const level = typeof slot?.fillLevel === "number" && Number.isFinite(slot.fillLevel) ? slot.fillLevel : null;
  const capacity = typeof slot?.capacity === "number" && Number.isFinite(slot.capacity) ? slot.capacity : null;
  const label = row.name || row.id || "";
  const active =
    row.activeSlot != null && Number.isFinite(Number(row.activeSlot))
      ? row.compartments != null
        ? text("companions.assets.siloSlotOf", "{{slot}} of {{count}}", { slot: Number(row.activeSlot), count: Number(row.compartments) })
        : String(Number(row.activeSlot))
      : text("companions.assets.siloSlotUnknown", "Unknown");
  let amount = "—";
  if (level != null) {
    const levelText = formatFillQuantity(level, fillKey, fillMode, fillPhysics, unitDisplay);
    amount =
      capacity != null
        ? text("companions.assets.siloFill", "{{amount}} of {{capacity}}", { amount: levelText, capacity: formatFillQuantity(capacity, fillKey, fillMode, fillPhysics, unitDisplay) })
        : levelText;
  }
  const percent = level != null && capacity != null && capacity > 0 ? Math.max(0, Math.min(100, (level / capacity) * 100)) : null;
  let transfer: ComponentChildren = "—";
  if (row.transferState === "active" && row.transfer) {
    transfer = <Badge tone="accent">{text("companions.assets.siloTransferShort", "{{from}} to {{to}}", { from: row.transfer.fromSlot ?? "?", to: row.transfer.toSlot ?? "?" })}</Badge>;
  } else if (row.transferState === "failed") {
    transfer = <Badge tone="warn">{text("companions.assets.siloTransferUnread", "Not read")}</Badge>;
  }
  return (
    <tr data-silo-id={row.id}>
      <td><strong>{label}</strong></td>
      <td>{active}</td>
      <td>{slot && cropName ? cropName : "—"}</td>
      <td class="text-end">
        {amount}
        {percent != null ? (
          <span class="fd-companions__fill-bar" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </span>
        ) : null}
      </td>
      <td>{transfer}</td>
    </tr>
  );
}

/** Storage page: compartment and pallet condition details. Never changes the native stock totals above it. */
export function StorageAssetNotes({
  catalog,
  titles,
  economy,
}: {
  catalog: FillTypeCatalog | null | undefined;
  titles: FillTypeTitles | null | undefined;
  economy: EconomyLike | null | undefined;
}) {
  const { companion, farmId } = useAssetContext();
  if (!companion || (!companion.realSilo && !companion.palletDegradation)) return null;
  const silo = companion.realSilo ? readRealSilo(companion.realSilo, farmId) : null;
  const pallets = companion.palletDegradation ? readPalletCondition(companion.palletDegradation, farmId) : null;
  return (
    <Card class="fd-asset-notes" title={text("companions.assets.storageTitle", "Storage mods")}>
      <div class="fd-asset-notes__grid">
      {silo ? (
        <div data-asset="realSilo" id={companionPanelId("realSilo")} class="fd-asset-notes__block">
          <h4>{text("companions.assets.siloHeading", "Silo compartments (RealSilo)")}</h4>
          <StatusOr status={silo.status} coverage={silo.coverage}>
            {() =>
              silo.rows.length ? (
                <div class="fd-economy__table-wrap">
                  <table class="fd-economy__table">
                    <thead>
                      <tr>
                        <th>{text("companions.assets.colSilo", "Silo")}</th>
                        <th>{text("companions.assets.colActive", "Active compartment")}</th>
                        <th>{text("companions.assets.colContents", "Contents")}</th>
                        <th class="text-end">{text("companions.assets.colFill", "Fill level")}</th>
                        <th>{text("companions.assets.colTransfer", "Transfer")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {silo.rows.map((row) => (
                        <SiloRow key={row.id} row={row} catalog={catalog} titles={titles} economy={economy} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Muted>{emptyAssetText(silo, "companions.live.siloEmpty", "No compartment silos for this farm.")}</Muted>
              )
            }
          </StatusOr>
        </div>
      ) : null}
      {pallets ? (
        <div data-asset="palletDegradation" id={companionPanelId("palletDegradation")} class="fd-asset-notes__block">
          <h4>{text("companions.assets.palletHeading", "Pallet condition (Storage Overhaul)")}</h4>
          <StatusOr status={pallets.status} coverage={pallets.coverage}>
            {() =>
              pallets.rows.length ? (
                <StatTiles
                  tiles={[
                    { key: "tracked", label: text("companions.assets.palletTracked", "Pallets tracked"), value: pallets.rows.length },
                    {
                      key: "damaged",
                      label: text("companions.assets.palletDamagedLabel", "Damaged"),
                      value: pallets.damaged.length,
                      tone: pallets.damaged.length > 0 ? "warn" : undefined,
                    },
                    { key: "outside", label: text("companions.assets.palletOutside", "Stored outside"), value: pallets.outside.length },
                    {
                      key: "lowest",
                      label: text("companions.assets.palletLowestLabel", "Lowest condition"),
                      value: pallets.lowestCondition != null ? `${Math.round(pallets.lowestCondition)}%` : "—",
                    },
                  ]}
                />
              ) : (
                <Muted>{emptyAssetText(pallets, "companions.live.palletEmpty", "No pallet condition records for this farm.")}</Muted>
              )
            }
          </StatusOr>
          <Muted>{text("companions.assets.palletNote", "Stock amounts and values above are the game's own figures; pallet condition is not deducted from them.")}</Muted>
        </div>
      ) : null}
      </div>
    </Card>
  );
}

/** Seasonal Milk Production modifier. Shown as its own label; never multiplied into the production figure. */
export function SeasonalMilkNote({ compact = false }: { compact?: boolean }) {
  const { companion } = useAssetContext();
  if (!companion?.seasonalMilk) return null;
  const milk = readSeasonalMilk(companion.seasonalMilk);
  if (milk.status !== "ok") {
    return compact ? null : <Muted>{assetStatusText(milk.status) || ""}</Muted>;
  }
  const factor = text("companions.assets.milkFactor", "Seasonal Milk Production factor this month: {{percent}}%", {
    percent: Math.round((milk.factor ?? 0) * 100),
  });
  const peak = milk.nextPeakPeriod != null ? ` ${text("companions.assets.milkPeak", "Next peak: {{month}}.", { month: monthName(milk.nextPeakPeriod) })}` : "";
  return (
    <span class="fd-economy__muted" data-asset="seasonalMilk">
      {compact ? ` ${factor}` : `${factor}.${peak}`}
    </span>
  );
}

/** Companion page card body for the asset readings; same selectors as the fleet, storage and pastures pages. */
export function AssetLiveStats({ kind, payload, farmId }: { kind: AssetLiveKey; payload: CompanionModsPayload; farmId: number }) {
  switch (kind) {
    case "advancedMaintenance":
      return <MaintenanceLines companion={{ advancedMaintenance: payload.advancedMaintenance }} farmId={farmId} />;
    case "extendedVehicleMaintenance":
      return <MaintenanceLines companion={{ extendedVehicleMaintenance: payload.extendedVehicleMaintenance }} farmId={farmId} />;
    case "realisticVehicleService":
      return <MaintenanceLines companion={{ realisticVehicleService: payload.realisticVehicleService }} farmId={farmId} />;
    case "realSilo": {
      const silo = readRealSilo(payload.realSilo, farmId);
      return (
        <StatusOr status={silo.status} coverage={silo.coverage}>
          {() =>
            silo.rows.length ? (
              <Badge>{text("companions.live.siloCount", "{{count}} silo compartment set(s)", { count: silo.rows.length })}</Badge>
            ) : (
              <Muted>{emptyAssetText(silo, "companions.live.siloEmpty", "No compartment silos for this farm.")}</Muted>
            )
          }
        </StatusOr>
      );
    }
    case "palletDegradation": {
      const pallets = readPalletCondition(payload.palletDegradation, farmId);
      return (
        <StatusOr status={pallets.status} coverage={pallets.coverage}>
          {() =>
            pallets.rows.length ? (
              <Badge>
                {text("companions.live.palletDamaged", "{{count}} pallet(s) tracked, {{damaged}} damaged", {
                  count: pallets.rows.length,
                  damaged: pallets.damaged.length,
                })}
              </Badge>
            ) : (
              <Muted>{emptyAssetText(pallets, "companions.live.palletEmpty", "No pallet condition records for this farm.")}</Muted>
            )
          }
        </StatusOr>
      );
    }
    case "seasonalMilk": {
      const milk = readSeasonalMilk(payload.seasonalMilk);
      if (milk.status !== "ok") return <Muted>{assetStatusText(milk.status) || ""}</Muted>;
      return (
        <Badge>
          {text("companions.live.milkFactor", "Season factor {{percent}}%", { percent: Math.round((milk.factor ?? 0) * 100) })}
          {milk.nextPeakPeriod != null ? ` ${text("companions.assets.milkPeak", "Next peak: {{month}}.", { month: monthName(milk.nextPeakPeriod) })}` : ""}
        </Badge>
      );
    }
    default: {
      const never: never = kind;
      return never;
    }
  }
}
