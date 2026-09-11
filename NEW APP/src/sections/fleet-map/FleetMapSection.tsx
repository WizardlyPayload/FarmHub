import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Button } from "@/components/ui";
import { t } from "@/i18n/i18n";
import {
  fleetMapPercent,
  INGAME_MAP_WORLD_INSET,
  mapOverviewIdentityKey,
  resolveFleetMapTerrainBounds,
} from "@/lib/fleetMapGeo";
import { FleetMapViewport } from "@/lib/fleetMapViewport";
import {
  classifyFleetMapIcon,
  classifyHusbandrySpecies,
  fleetMapHeadingDeg,
  FleetMapMarkerIcon,
  FleetMapPlaceIcon,
  type FleetMapIconKind,
  type FleetMapPlaceKind,
} from "@/lib/fleetMapMarkers";
import {
  availableOverlayModes,
  computeOverlayRange,
  defaultOverlayMode,
  fieldBlobSizePercent,
  FLEET_MAP_TYPE_FILTERS,
  groupedAvailableOverlayModes,
  isFleetMapOverlayMode,
  isFleetMapTypeFilter,
  isOwnedField,
  isRelativeOverlayMode,
  normalizeFieldOutline,
  outlineToSvgPoints,
  overlayLegendItems,
  overlayLegendRange,
  overlayPaintForField,
  overlayScaleInvert,
  pickMapOutlineForField,
  readWorldXZ,
  snapshotHasPrecisionFarming,
  snapshotHasSoilFertilizer,
  typeFilterMatches,
  type FleetMapOverlayGroup,
  type FleetMapOverlayMode,
  type FleetMapTypeFilter,
  type MapFieldOutlineRow,
  type OverlayLegendItem,
} from "@/lib/fleetMapOverlays";
import { paintedBlobKey } from "@/lib/rules-engine";
import {
  getChainsForFarmView,
  normalizeProductionChains,
  type ProductionPayload,
} from "@/lib/productions";
import { sellPointsForMap, type MarketPrices } from "@/lib/economy";
import { formatCropName } from "@/sections/fields/field-helpers";
import {
  getDisplayFleet,
  isDealershipOrPoolStock,
  isStorageItem,
  normalizeVehicleList,
  resolveVehicleDisplayName,
  resolveVehicleRoleFilter,
  vehicleMatchesDeepLinkId,
  vehicleMatchesActiveFarm,
  vehicleRowKey,
  type FleetVehicle,
} from "@/lib/vehicles";
import { useDashboardStore } from "@/store/dashboard-store";
import "@/sections/fleet-map/fleet-map.css";

const FARM_COLOR_FALLBACK = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#95a5a6",
];

interface FarmRecord {
  id?: number | string;
  farmId?: number | string;
  name?: string;
  color?: number | string;
}

interface OverviewResponse {
  ok?: boolean;
  url?: string;
  cacheVersion?: string | number;
  error?: string;
  hintKind?: string;
}

function farmColorToCss(farmId: number, rawColor: unknown): string {
  const n = Number(rawColor);
  if (Number.isFinite(n) && n > 0) {
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    if (r + g + b > 24) return `rgb(${r}, ${g}, ${b})`;
    const r2 = n & 255;
    const g2 = (n >> 8) & 255;
    const b2 = (n >> 16) & 255;
    if (r2 + g2 + b2 > 24) return `rgb(${r2}, ${g2}, ${b2})`;
  }
  const idx = Math.max(0, (Number(farmId) || 1) - 1) % FARM_COLOR_FALLBACK.length;
  return FARM_COLOR_FALLBACK[idx];
}

function readBoolPref(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeBoolPref(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function readStringPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStringPref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

const HIDE_BORDER_PREF = "farmdash_fleet_hide_map_border";
const SHOW_NAMES_PREF = "farmdash_fleet_show_pin_names";
const OVERLAY_PREF = "farmdash_fleet_overlay";
const TYPE_PREF = "farmdash_fleet_type_filter";
const PLACES_PREF = "farmdash_fleet_show_places";
const SEARCH_PREF = "farmdash_fleet_search";

function parseFarms(farmInfo: unknown): FarmRecord[] {
  if (!farmInfo) return [];
  if (Array.isArray(farmInfo)) return farmInfo as FarmRecord[];
  if (typeof farmInfo === "object") {
    const obj = farmInfo as Record<string, unknown>;
    if (Array.isArray(obj.farms)) return obj.farms as FarmRecord[];
    return Object.values(obj).filter((v) => v && typeof v === "object") as FarmRecord[];
  }
  return [];
}

function overlayLabelKey(mode: FleetMapOverlayMode, hasPf = false): string {
  switch (mode) {
    case "off":
      return "map.overlay.off";
    case "crops":
      return "map.overlay.crops";
    case "growth":
      return "map.overlay.growth";
    case "soilOm":
      return "map.overlay.soilOm";
    case "soilPh":
      return hasPf ? "map.overlay.pfPh" : "map.overlay.soilPh";
    case "soilN":
      return hasPf ? "map.overlay.pfNitrogen" : "map.overlay.soilN";
    case "soilUrgency":
      return "map.overlay.soilUrgency";
    case "pfSoilType":
      return "map.overlay.pfSoilType";
    case "fertilized":
      return "map.overlay.fertilized";
    case "weeds":
      return "map.overlay.weeds";
    case "stones":
      return "map.overlay.stones";
    case "needsPlowing":
      return "map.overlay.needsPlowing";
    case "needsLime":
      return "map.overlay.needsLime";
    case "needsRolling":
      return "map.overlay.needsRolling";
    case "mulched":
      return "map.overlay.mulched";
    case "watered":
      return "map.overlay.watered";
    case "moisture":
      return "map.overlay.moisture";
    case "ownership":
      return "map.overlay.ownership";
    case "work":
      return "map.overlay.work";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function overlayGroupLabelKey(group: FleetMapOverlayGroup): string {
  switch (group) {
    case "fields":
      return "map.overlayGroup.fields";
    case "soil":
      return "map.overlayGroup.soil";
    case "precisionFarming":
      return "map.overlayGroup.precisionFarming";
    case "soilFertilizer":
      return "map.overlayGroup.soilFertilizer";
    case "other":
      return "map.overlayGroup.other";
    default: {
      const _exhaustive: never = group;
      return _exhaustive;
    }
  }
}

function overlayFieldNumber(field: Record<string, unknown>): number {
  const n = Number(field.farmlandId ?? field.id);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** GPS merge/extend identity from the mod — not nearby same-crop fields. */
function luaPaintedBlobKey(field: Record<string, unknown>): string {
  const raw = field.paintedBlobKey;
  return typeof raw === "string" && raw.length > 3 ? raw : "";
}

function overlayFieldIds(field: Record<string, unknown>): number[] {
  const clustered = field._clusterFieldIds;
  if (Array.isArray(clustered) && clustered.length) {
    return clustered.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  }
  const n = overlayFieldNumber(field);
  return n > 0 ? [n] : [];
}

function overlayFieldTitle(field: Record<string, unknown>): string {
  const ids = overlayFieldIds(field);
  if (ids.length > 1) return t("map.fieldMerged", { ids: ids.join(" · ") });
  if (ids.length === 1) return t("map.fieldSingle", { id: ids[0] });
  return t("map.fieldSingle", { id: "?" });
}

function overlayFieldHectares(field: Record<string, unknown>): number {
  const clustered = Number(field._clusterHectares);
  if (Number.isFinite(clustered) && clustered > 0) return clustered;
  return Number(field.hectares) || 0;
}

function overlayFieldBanner(field: Record<string, unknown>): { name: string; farm: string; detail: string } {
  return {
    name: overlayFieldTitle(field),
    farm: formatCropName(field.fruitType),
    detail: t("map.fieldHa", { ha: overlayFieldHectares(field).toFixed(1) }),
  };
}

function overlayLegendLabel(item: OverlayLegendItem): string {
  if (item.cropKey) return formatCropName(item.cropKey);
  if (item.soilTypeIndex != null) return t("map.legend.soilType", { id: item.soilTypeIndex });
  if (item.labelKey) return t(item.labelKey);
  return "";
}

function overlayScaleText(mode: FleetMapOverlayMode, min: number, max: number): { min: string; max: string } {
  switch (mode) {
    case "soilN":
    case "soilUrgency":
      return { min: String(Math.round(min)), max: String(Math.round(max)) };
    case "moisture":
      return { min: `${Math.round(min)}%`, max: `${Math.round(max)}%` };
    case "soilOm":
    case "soilPh":
    case "fertilized":
    case "stones":
      return { min: min.toFixed(1), max: max.toFixed(1) };
    case "weeds":
      return { min: `${Math.round(min)}%`, max: `${Math.round(max)}%` };
    case "off":
    case "crops":
    case "growth":
    case "ownership":
    case "work":
    case "needsPlowing":
    case "needsLime":
    case "needsRolling":
    case "mulched":
    case "watered":
    case "pfSoilType":
      return { min: min.toFixed(1), max: max.toFixed(1) };
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function typeFilterLabelKey(filter: FleetMapTypeFilter): string {
  switch (filter) {
    case "all":
      return "map.filter.all";
    case "tractor":
      return "map.filter.tractor";
    case "harvester":
      return "map.filter.harvester";
    case "trailer":
      return "map.filter.trailer";
    case "truck":
      return "map.filter.truck";
    case "car":
      return "map.filter.car";
    case "loader":
      return "map.filter.loader";
    case "cutter":
      return "map.filter.cutter";
    case "implement":
      return "map.filter.implement";
    case "other":
      return "map.filter.other";
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

function placeKindLabelKey(kind: FleetMapPlaceKind): string {
  switch (kind) {
    case "production":
      return "map.placeProduction";
    case "husbandry":
      return "map.placeHusbandry";
    case "sellPoint":
      return "map.placeSellPoint";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function placeKindSection(kind: FleetMapPlaceKind): "productions" | "pastures" | "economy" {
  switch (kind) {
    case "production":
      return "productions";
    case "husbandry":
      return "pastures";
    case "sellPoint":
      return "economy";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function normalizeList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter((v) => v && typeof v === "object") as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    return Object.values(raw).filter((v) => v && typeof v === "object") as Record<string, unknown>[];
  }
  return [];
}

export function FleetMapSection() {
  const payload = useDashboardStore((s) => s.payload);
  const activeFarmId = useDashboardStore((s) => s.activeFarmId);
  const sectionParams = useDashboardStore((s) => s.sectionParams);
  const setSection = useDashboardStore((s) => s.setSection);

  const [showAllFarms, setShowAllFarms] = useState(false);
  const [hideBorder, setHideBorder] = useState(() => readBoolPref(HIDE_BORDER_PREF));
  const [showNames, setShowNames] = useState(() => readBoolPref(SHOW_NAMES_PREF));
  const [showPlaces, setShowPlaces] = useState(() => {
    const raw = readStringPref(PLACES_PREF);
    return raw == null ? true : raw === "1";
  });
  const [overlay, setOverlay] = useState<FleetMapOverlayMode>(() => {
    const saved = readStringPref(OVERLAY_PREF);
    return isFleetMapOverlayMode(saved) ? saved : "crops";
  });
  const overlayPrefSaved = useRef(isFleetMapOverlayMode(readStringPref(OVERLAY_PREF)));
  const [typeFilter, setTypeFilter] = useState<FleetMapTypeFilter>(() => {
    const saved = readStringPref(TYPE_PREF);
    return isFleetMapTypeFilter(saved) ? saved : "all";
  });
  const [search, setSearch] = useState(() => readStringPref(SEARCH_PREF) || "");
  const [hint, setHint] = useState(t("map.hintGeneric"));
  const [hasOverview, setHasOverview] = useState(false);
  const [overviewUrl, setOverviewUrl] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    left: number;
    top: number;
    source?: "hover" | "click" | "focus";
    html: { name: string; farm: string; detail: string };
  } | null>(null);
  const [natSize, setNatSize] = useState({ w: 0, h: 0 });
  const [mapFieldOutlines, setMapFieldOutlines] = useState<MapFieldOutlineRow[]>([]);

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<FleetMapViewport | null>(null);
  const fetchKeyRef = useRef("");
  const loadedOverviewKeyRef = useRef("");

  const mapId = String(payload?.mapId || payload?.serverInfo?.mapId || "");
  const mapTitle = String(payload?.mapTitle || payload?.serverInfo?.mapName || "");
  const farms = useMemo(() => parseFarms(payload?.farmInfo), [payload?.farmInfo]);

  const allFields = useMemo(
    () => (Array.isArray(payload?.fields) ? payload!.fields! : []) as Record<string, unknown>[],
    [payload?.fields],
  );

  const overlayChoices = useMemo(() => groupedAvailableOverlayModes(allFields), [allFields]);
  const pfOverlayLabels =
    snapshotHasPrecisionFarming(allFields) && !snapshotHasSoilFertilizer(allFields);

  useEffect(() => {
    if (allFields.length === 0) return;
    const allowed = availableOverlayModes(allFields);
    setOverlay((current) => {
      if (!overlayPrefSaved.current) {
        overlayPrefSaved.current = true;
        const next = defaultOverlayMode(allFields);
        return allowed.includes(next) ? next : "crops";
      }
      if (allowed.includes(current)) return current;
      const next = defaultOverlayMode(allFields);
      return allowed.includes(next) ? next : "crops";
    });
  }, [allFields]);

  const allVehicles = useMemo(() => {
    return normalizeVehicleList(payload?.vehicles).filter(
      (v) => v && !isStorageItem(v) && !isDealershipOrPoolStock(v)
    );
  }, [payload?.vehicles]);

  const searchNeedle = search.trim().toLowerCase();

  const plotted = useMemo(() => {
    const roleType = resolveVehicleRoleFilter(sectionParams.role).type;
    const src = showAllFarms ? allVehicles : getDisplayFleet(payload?.vehicles, activeFarmId ?? 1);
    const out: FleetVehicle[] = [];
    for (const v of src) {
      const xz = readWorldXZ(v);
      if (!xz) continue;
      if (!showAllFarms && !vehicleMatchesActiveFarm(v, activeFarmId ?? 1)) continue;
      if (roleType) {
        const vehicleType = v.vehicleType || "unknown";
        if (vehicleType !== roleType && roleType !== "tractor") {
          if (roleType !== "motorized" || vehicleType !== "motorized") continue;
        }
      }
      const kind = classifyFleetMapIcon(v);
      if (!typeFilterMatches(kind, typeFilter)) continue;
      if (searchNeedle) {
        const name = resolveVehicleDisplayName(v).toLowerCase();
        const blob = `${name} ${v.typeName || ""} ${v.vehicleType || ""} ${kind}`.toLowerCase();
        if (!blob.includes(searchNeedle)) continue;
      }
      out.push(v);
    }
    return out.slice(0, 400);
  }, [
    allVehicles,
    payload?.vehicles,
    activeFarmId,
    showAllFarms,
    sectionParams.role,
    typeFilter,
    searchNeedle,
  ]);

  const overlayFields = useMemo(() => {
    if (overlay === "off") return [];
    const withGeom = allFields
      .filter((f) => isOwnedField(f))
      .map((f) => {
        const outline = pickMapOutlineForField(f, mapFieldOutlines);
        return outline ? { ...f, outline } : f;
      })
      .filter((f) => readWorldXZ(f) || normalizeFieldOutline(f.outline));
    const membersByGpsBlob = new Map<string, Record<string, unknown>[]>();
    for (const field of withGeom) {
      const gps = luaPaintedBlobKey(field);
      if (!gps) continue;
      const list = membersByGpsBlob.get(gps);
      if (list) list.push(field);
      else membersByGpsBlob.set(gps, [field]);
    }
    const seenBlobs = new Set<string>();
    const painted: Record<string, unknown>[] = [];
    for (const field of withGeom) {
      const paintKey = paintedBlobKey(field);
      if (paintKey) {
        if (seenBlobs.has(paintKey)) continue;
        seenBlobs.add(paintKey);
      }
      const gps = luaPaintedBlobKey(field);
      const members = gps ? membersByGpsBlob.get(gps) || [field] : [field];
      const ids = [...new Set(members.map(overlayFieldNumber).filter((n) => n > 0))].sort((a, b) => a - b);
      const hectares = Math.max(0, ...members.map((row) => Number(row.hectares) || 0));
      painted.push({
        ...field,
        _clusterFieldIds: ids,
        _clusterHectares: hectares,
      });
    }
    return painted;
  }, [allFields, overlay, mapFieldOutlines]);

  const productionPlaces = useMemo(() => {
    if (!showPlaces) return [];
    const production = payload?.production as ProductionPayload | undefined;
    const chains = showAllFarms
      ? normalizeProductionChains(production)
      : getChainsForFarmView(production, activeFarmId ?? 1, payload?.farmInfo, true);
    return chains
      .map((chain) => {
        const xz = readWorldXZ(chain);
        if (!xz) return null;
        const name = String(chain.name || t("map.placeProduction"));
        if (searchNeedle && !name.toLowerCase().includes(searchNeedle)) return null;
        return {
          kind: "production" as const,
          id: String(chain.id ?? chain.name ?? ""),
          name,
          ...xz,
          farmId: Number(chain.ownerFarmId) || 0,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .slice(0, 200);
  }, [payload?.production, payload?.farmInfo, activeFarmId, showAllFarms, showPlaces, searchNeedle]);

  const husbandryPlaces = useMemo(() => {
    if (!showPlaces) return [];
    const rows = normalizeList(payload?.animals);
    return rows
      .map((row) => {
        const xz = readWorldXZ(row);
        if (!xz) return null;
        const farmId = Number(row.ownerFarmId ?? row.farmId ?? 0);
        if (!showAllFarms && farmId !== (activeFarmId ?? 1)) return null;
        const name = String(row.name || t("map.placeHusbandry"));
        if (searchNeedle && !name.toLowerCase().includes(searchNeedle)) return null;
        return {
          kind: "husbandry" as const,
          id: String(row.id ?? name),
          name,
          ...xz,
          farmId,
          species: classifyHusbandrySpecies(row),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .slice(0, 120);
  }, [payload?.animals, activeFarmId, showAllFarms, showPlaces, searchNeedle]);

  const sellPointPlaces = useMemo(() => {
    if (!showPlaces) return [];
    const economy = payload?.economy as { marketPrices?: MarketPrices } | undefined;
    return sellPointsForMap(economy?.marketPrices)
      .map((station) => {
        const xz = readWorldXZ(station);
        if (!xz) return null;
        const name = String(station.name || t("map.placeSellPoint"));
        if (searchNeedle && !name.toLowerCase().includes(searchNeedle)) return null;
        return {
          kind: "sellPoint" as const,
          id: String(station.name ?? `${xz.x},${xz.z}`),
          name,
          ...xz,
          farmId: 0,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .slice(0, 200);
  }, [payload?.economy, showPlaces, searchNeedle]);

  const worldItems = useMemo(() => {
    const items: unknown[] = [
      ...allVehicles,
      ...allFields,
      ...productionPlaces,
      ...husbandryPlaces,
      ...sellPointPlaces,
    ];
    for (const row of allFields) {
      const outline = normalizeFieldOutline((row as { outline?: unknown }).outline);
      if (!outline) continue;
      for (const pt of outline) items.push({ x: pt[0], z: pt[1] });
    }
    return items;
  }, [allVehicles, allFields, productionPlaces, husbandryPlaces, sellPointPlaces]);

  const bounds = useMemo(
    () =>
      resolveFleetMapTerrainBounds(
        {
          mapBounds: payload?.mapBounds as never,
          serverInfo: payload?.serverInfo as never,
        },
        worldItems,
      ),
    [payload?.mapBounds, payload?.serverInfo, worldItems],
  );

  const imageSize = useMemo(() => {
    if (!(natSize.w > 0 && natSize.h > 0)) return { w: 0, h: 0 };
    if (!hideBorder) return natSize;
    return {
      w: natSize.w * INGAME_MAP_WORLD_INSET.width,
      h: natSize.h * INGAME_MAP_WORLD_INSET.height,
    };
  }, [natSize, hideBorder]);

  const toPct = useCallback(
    (x: number, z: number, loose = false) =>
      fleetMapPercent(x, z, bounds, { hideBorder, clampFrame: !loose }),
    [bounds, hideBorder],
  );

  const pinPoints = useMemo(
    () =>
      plotted.map((v) => {
        const xz = readWorldXZ(v)!;
        const pct = toPct(xz.x, xz.z);
        return { ...pct, vehicle: v, x: xz.x, z: xz.z };
      }),
    [plotted, toPct],
  );

  const overlayRange = useMemo(
    () => computeOverlayRange(overlayFields, overlay),
    [overlayFields, overlay],
  );
  const legendRange = useMemo(
    () => overlayLegendRange(overlay, overlayRange),
    [overlay, overlayRange],
  );
  const overlayLegend = useMemo(
    () => overlayLegendItems(overlay, overlayFields),
    [overlay, overlayFields],
  );

  const fieldOverlays = useMemo(
    () =>
      overlayFields.map((field) => {
        const xz = readWorldXZ(field);
        const outline = normalizeFieldOutline(field.outline);
        if (!xz && !outline) return null;
        const fid = Number(field.ownerFarmId ?? field.farmId ?? 0);
        const farm = farms.find((f) => Number(f.id ?? f.farmId) === fid);
        const paint = overlayPaintForField(field, overlay, farmColorToCss(fid, farm?.color), overlayRange);
        if (!paint) return null;
        let centroid = xz;
        if (outline) {
          let sx = 0;
          let sz = 0;
          for (const p of outline) {
            sx += p[0];
            sz += p[1];
          }
          centroid = { x: sx / outline.length, z: sz / outline.length };
        }
        if (!centroid) return null;
        const pct = toPct(centroid.x, centroid.z);
        const points = outline ? outlineToSvgPoints(outline, (x, z) => toPct(x, z, true)) : "";
        return {
          ...pct,
          field,
          x: centroid.x,
          z: centroid.z,
          size:
            fieldBlobSizePercent(Number(field.hectares) || 0, bounds.terrainSize || 2048) *
            (hideBorder ? 1 : INGAME_MAP_WORLD_INSET.width),
          fill: paint.fill,
          farmId: fid,
          points: points || null,
        };
      }).filter((row): row is NonNullable<typeof row> => row != null),
    [overlayFields, overlay, overlayRange, bounds, farms, toPct, hideBorder],
  );

  const placePins = useMemo(
    () =>
      [...productionPlaces, ...husbandryPlaces, ...sellPointPlaces].map((place) => ({
        ...place,
        ...toPct(place.x, place.z),
      })),
    [productionPlaces, husbandryPlaces, sellPointPlaces, toPct],
  );

  const farmsById = useMemo(() => {
    const map = new Map<number, FarmRecord>();
    for (const f of farms) {
      const id = Number(f.id ?? f.farmId);
      if (Number.isFinite(id)) map.set(id, f);
    }
    return map;
  }, [farms]);

  function applyMissingOverviewHint(data?: OverviewResponse | null) {
    const label = mapTitle || mapId || t("map.unknownMap");
    if (data?.error === "missing_map_id") {
      setHint(t("map.hintNoImage"));
    } else if (data?.hintKind === "dlc" && label !== t("map.unknownMap")) {
      setHint(t("map.hintNoImageDlc", { map: label }));
    } else if (label !== t("map.unknownMap")) {
      const token = String(label).split(/[^A-Za-z0-9]+/).find((p) => p.length >= 4) || "";
      setHint(t("map.hintNoImageNamed", { map: label, hint: token || label }));
    } else {
      setHint(t("map.hintNoImage"));
    }
  }

  function clearOverviewImage() {
    setOverviewUrl(null);
    setHasOverview(false);
  }

  function rebindViewport() {
    const stage = stageRef.current;
    if (!stage) return;
    const prev = viewportRef.current;
    if (prev) prev.destroy();
    const vp = new FleetMapViewport(stage);
    vp.bind();
    vp.img = imgRef.current;
    vp.onViewChange = null;
    viewportRef.current = vp;
    requestAnimationFrame(() => {
      vp.syncCanvasSize();
      if (!sectionParams.id) vp.fitWholeImage();
    });
  }

  useEffect(() => {
    rebindViewport();
    return () => {
      const vp = viewportRef.current;
      if (vp) {
        vp.destroy();
        viewportRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewUrl]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !imageSize.w) return;
    vp.img = imgRef.current;
    requestAnimationFrame(() => {
      vp.syncCanvasSize();
      if (!sectionParams.id && !vp.hasUserView()) vp.fitWholeImage();
    });
  }, [imageSize.w, imageSize.h, sectionParams.id, hasOverview]);

  const focusVehicle = useMemo(
    () =>
      sectionParams.id
        ? plotted.find((v) => vehicleMatchesDeepLinkId(v, sectionParams.id)) ||
          allVehicles.find((v) => vehicleMatchesDeepLinkId(v, sectionParams.id)) ||
          null
        : null,
    [plotted, allVehicles, sectionParams.id]
  );

  const focusPin = useMemo(() => {
    const xz = readWorldXZ(focusVehicle);
    if (!xz) return null;
    const pct = toPct(xz.x, xz.z);
    return { ...pct, vehicle: focusVehicle, x: xz.x, z: xz.z };
  }, [focusVehicle, toPct]);

  useEffect(() => {
    if (!focusPin) return;
    const vp = viewportRef.current;
    if (!vp) return;
    requestAnimationFrame(() => {
      vp.fitToPoint(focusPin.left, focusPin.top, 2.8);
    });
    const name = resolveVehicleDisplayName(focusVehicle);
    setTooltip({
      left: focusPin.left,
      top: focusPin.top,
      source: "focus",
      html: {
        name,
        farm: t("map.focusedVehicle"),
        detail: `${focusVehicle?.typeName || focusVehicle?.vehicleType || ""} · ${Math.round(focusPin.x)}, ${Math.round(focusPin.z)}`,
      },
    });
  }, [focusPin, focusVehicle]);

  useEffect(() => {
    const extras = [
      ...fieldOverlays.map(({ left, top }) => ({ left, top })),
      ...placePins.map(({ left, top }) => ({ left, top })),
    ];
    viewportRef.current?.setPinPoints([
      ...pinPoints.map(({ left, top }) => ({ left, top })),
      ...extras,
    ]);
  }, [pinPoints, fieldOverlays, placePins]);

  const noPositionForFocus = useMemo(
    () =>
      Boolean(sectionParams.id) &&
      !focusVehicle &&
      allVehicles.some((v) => vehicleMatchesDeepLinkId(v, sectionParams.id)),
    [sectionParams.id, focusVehicle, allVehicles]
  );

  useEffect(() => {
    const key = mapOverviewIdentityKey(mapId, mapTitle);
    if (!mapId && !mapTitle) {
      clearOverviewImage();
      loadedOverviewKeyRef.current = "";
      setHint(t("map.hintNoImage"));
      return;
    }
    if (key === fetchKeyRef.current && key === loadedOverviewKeyRef.current) {
      return;
    }
    fetchKeyRef.current = key;
    clearOverviewImage();
    setHint(t("map.loadingOverview"));

    const q = new URLSearchParams();
    if (mapId) q.set("mapId", mapId);
    if (mapTitle) q.set("mapTitle", mapTitle);

    let cancelled = false;
    void fetch(`/api/map-overview-image?${q}`)
      .then(async (r) => {
        let data: OverviewResponse = { ok: false };
        try {
          data = (await r.json()) as OverviewResponse;
        } catch {
          data = { ok: false };
        }
        if (!r.ok && data.ok !== true) data = { ...data, ok: false };
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        if (fetchKeyRef.current !== key) return;

        if (data?.ok && data.url) {
          const cacheV = data.cacheVersion ?? key;
          const url = `${data.url}?v=${encodeURIComponent(String(cacheV))}`;
          setHasOverview(false);
          setOverviewUrl(url);
          loadedOverviewKeyRef.current = key;
          setHint(t("map.loadingOverview"));
        } else {
          clearOverviewImage();
          loadedOverviewKeyRef.current = key;
          applyMissingOverviewHint(data);
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (fetchKeyRef.current !== key) return;
        clearOverviewImage();
        loadedOverviewKeyRef.current = key;
        setHint(t("map.hintNoImage"));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, mapTitle]);

  useEffect(() => {
    if (!mapId && !mapTitle) {
      setMapFieldOutlines([]);
      return;
    }
    const q = new URLSearchParams();
    if (mapId) q.set("mapId", mapId);
    if (mapTitle) q.set("mapTitle", mapTitle);
    let cancelled = false;
    void fetch(`/api/map-field-outlines?${q}`)
      .then(async (r) => {
        try {
          return (await r.json()) as { ok?: boolean; fields?: MapFieldOutlineRow[] };
        } catch {
          return { ok: false, fields: [] };
        }
      })
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.fields) ? data.fields : [];
        setMapFieldOutlines(
          rows.filter(
            (row) =>
              Number.isFinite(Number(row?.id)) &&
              Array.isArray(row?.outline) &&
              row.outline.length >= 3,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setMapFieldOutlines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mapId, mapTitle]);

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    setNatSize({ w: natW, h: natH });
    setHasOverview(true);
    setHint(t("map.hint", { map: mapTitle || mapId || t("map.unknownMap") }));
    const vp = viewportRef.current;
    if (vp) {
      vp.img = img;
      requestAnimationFrame(() => {
        vp.syncCanvasSize();
        if (!sectionParams.id && !vp.hasUserView()) vp.fitWholeImage();
      });
    } else {
      rebindViewport();
    }
  };

  const onImgError = () => {
    clearOverviewImage();
    setHint(t("map.hintNoImage"));
  };

  useEffect(() => {
    if (!overviewUrl) return;
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) onImgLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewUrl]);

  useEffect(() => {
    if (overviewUrl) return;
    setNatSize({ w: 1024, h: 1024 });
    requestAnimationFrame(() => {
      viewportRef.current?.syncCanvasSize();
      viewportRef.current?.fitWholeImage();
    });
  }, [overviewUrl]);

  return (
    <div class="fd-fleet-map">
      <header class="fd-fleet-map__header">
        <h2>{t("map.title")}</h2>
        <p class="fd-muted">{t("map.subtitle")}</p>
        <p class="fd-muted fd-fleet-map__map-title">{mapTitle || t("map.unknownMap")}</p>
      </header>

      <div class="fd-fleet-map__toolbar-row">
        <label class="fd-fleet-map__overlay">
          <span>{t("map.overlay")}</span>
          <select
            value={overlay}
            onChange={(e) => {
              const next = (e.target as HTMLSelectElement).value;
              if (!isFleetMapOverlayMode(next)) return;
              setOverlay(next);
              overlayPrefSaved.current = true;
              writeStringPref(OVERLAY_PREF, next);
            }}
          >
            <option value="off">{t(overlayLabelKey("off"))}</option>
            {overlayChoices.map((group) => (
              <optgroup key={group.group} label={t(overlayGroupLabelKey(group.group))}>
                {group.modes.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(overlayLabelKey(mode, pfOverlayLabels))}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <input
          class="fd-fleet-map__search"
          type="search"
          value={search}
          placeholder={t("map.searchPlaceholder")}
          onInput={(e) => {
            const next = (e.target as HTMLInputElement).value;
            setSearch(next);
            writeStringPref(SEARCH_PREF, next);
          }}
        />
        <label class="fd-fleet-map__check">
          <input
            type="checkbox"
            checked={showAllFarms}
            onChange={(e) => setShowAllFarms((e.target as HTMLInputElement).checked)}
          />
          <span>{t("map.showAllFarms")}</span>
        </label>
        <label class="fd-fleet-map__check">
          <input
            type="checkbox"
            checked={showPlaces}
            onChange={(e) => {
              const on = (e.target as HTMLInputElement).checked;
              setShowPlaces(on);
              writeBoolPref(PLACES_PREF, on);
            }}
          />
          <span>{t("map.showPlaces")}</span>
        </label>
        <label class="fd-fleet-map__check">
          <input
            type="checkbox"
            checked={hideBorder}
            onChange={(e) => {
              const on = (e.target as HTMLInputElement).checked;
              setHideBorder(on);
              writeBoolPref(HIDE_BORDER_PREF, on);
            }}
          />
          <span>{t("map.hideMapBorder")}</span>
        </label>
        <label class="fd-fleet-map__check">
          <input
            type="checkbox"
            checked={showNames}
            onChange={(e) => {
              const on = (e.target as HTMLInputElement).checked;
              setShowNames(on);
              writeBoolPref(SHOW_NAMES_PREF, on);
            }}
          />
          <span>{t("map.showPinNames")}</span>
        </label>
        <span class="fd-muted">{t("map.plottedCount", { count: plotted.length })}</span>
      </div>

      <div class="fd-fleet-map__filters" role="group" aria-label={t("map.filterTypes")}>
        {FLEET_MAP_TYPE_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            class={`fd-fleet-map__chip${typeFilter === filter ? " fd-fleet-map__chip--on" : ""}`}
            onClick={() => {
              setTypeFilter(filter);
              writeStringPref(TYPE_PREF, filter);
            }}
          >
            {filter !== "all" ? <FleetMapMarkerIcon kind={filter as FleetMapIconKind} /> : null}
            <span>{t(typeFilterLabelKey(filter))}</span>
          </button>
        ))}
      </div>

      <div class="fd-fleet-map-body">
      <div class="fd-fleet-map-shell">
        <div class="fd-fleet-map-toolbar" role="group" aria-label={t("map.toolbarLabel")}>
          <Button variant="ghost" onClick={() => viewportRef.current?.zoomBy(1 / 1.2)}>
            −
          </Button>
          <Button variant="ghost" onClick={() => viewportRef.current?.zoomBy(1.2)}>
            +
          </Button>
          <Button variant="ghost" onClick={() => viewportRef.current?.fitWholeImage()}>
            {t("map.resetView")}
          </Button>
          <Button onClick={() => viewportRef.current?.fitToPins()}>{t("map.fitItems")}</Button>
        </div>

        <div class="farm-fleet-map-stage-slot">
        <div
          class={`farm-fleet-map-stage${hasOverview ? " farm-fleet-map-stage--has-overview" : ""}${
            showNames ? " farm-fleet-map-stage--allow-names" : ""
          }`}
          id="fleet-map-stage"
          ref={stageRef}
          onClick={() => setTooltip(null)}
        >
          <div class="farm-fleet-map-viewport" id="fleet-map-viewport">
            <div class="farm-fleet-map-transform" id="fleet-map-transform">
              <div
                class="farm-fleet-map-canvas"
                style={
                  imageSize.w
                    ? { width: `${imageSize.w}px`, height: `${imageSize.h}px` }
                    : undefined
                }
              >
                <div
                  id="fleet-map-terrain-clip"
                  class={`farm-fleet-map-terrain-clip${
                    hideBorder ? " farm-fleet-map-terrain-clip--hide-border" : ""
                  }`}
                  style={
                    imageSize.w
                      ? { width: `${imageSize.w}px`, height: `${imageSize.h}px` }
                      : undefined
                  }
                >
                  {overviewUrl ? (
                    <img
                      id="fleet-map-overview-img"
                      ref={imgRef}
                      class="farm-fleet-map-overview"
                      src={overviewUrl}
                      alt={mapTitle || mapId || t("map.unknownMap")}
                      decoding="async"
                      draggable={false}
                      onLoad={onImgLoad}
                      onError={onImgError}
                      style={
                        natSize.w
                          ? {
                              width: `${natSize.w}px`,
                              height: `${natSize.h}px`,
                              left: hideBorder
                                ? `${-natSize.w * INGAME_MAP_WORLD_INSET.left}px`
                                : "0px",
                              top: hideBorder
                                ? `${-natSize.h * INGAME_MAP_WORLD_INSET.top}px`
                                : "0px",
                            }
                          : undefined
                      }
                    />
                  ) : null}
                  <div class="farm-fleet-map-blobs" aria-hidden={overlay === "off"}>
                    <svg
                      class="farm-fleet-map-overlay-svg"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      {fieldOverlays
                        .filter((row) => row.points)
                        .map((blob) => {
                          const field = blob.field;
                          const banner = overlayFieldBanner(field);
                          return (
                            <polygon
                              key={`field-poly-${String(field.id ?? field.farmlandId ?? `${blob.x}-${blob.z}`)}`}
                              class="farm-fleet-map-field-poly"
                              points={blob.points!}
                              fill={blob.fill}
                              aria-label={`${banner.name} ${banner.farm}`}
                              onMouseEnter={() => {
                                setTooltip({
                                  left: blob.left,
                                  top: blob.top,
                                  source: "hover",
                                  html: banner,
                                });
                              }}
                              onMouseLeave={() => {
                                setTooltip((current) => (current?.source === "hover" ? null : current));
                              }}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                if (viewportRef.current?.consumePan()) return;
                                setTooltip({
                                  left: blob.left,
                                  top: blob.top,
                                  source: "click",
                                  html: banner,
                                });
                                setSection("fields");
                              }}
                            />
                          );
                        })}
                    </svg>
                    {fieldOverlays
                      .filter((row) => !row.points)
                      .map((blob) => {
                      const field = blob.field;
                      const banner = overlayFieldBanner(field);
                      return (
                        <button
                          key={`field-${String(field.id ?? field.farmlandId ?? `${blob.x}-${blob.z}`)}`}
                          type="button"
                          class="farm-fleet-map-blob"
                          style={{
                            left: `${blob.left}%`,
                            top: `${blob.top}%`,
                            width: `${blob.size}%`,
                            height: `${blob.size}%`,
                            background: blob.fill,
                          }}
                          aria-label={`${banner.name} ${banner.farm}`}
                          onMouseEnter={() => {
                            setTooltip({
                              left: blob.left,
                              top: blob.top,
                              source: "hover",
                              html: banner,
                            });
                          }}
                          onMouseLeave={() => {
                            setTooltip((current) => (current?.source === "hover" ? null : current));
                          }}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            if (viewportRef.current?.consumePan()) return;
                            setTooltip({
                              left: blob.left,
                              top: blob.top,
                              source: "click",
                              html: banner,
                            });
                            setSection("fields");
                          }}
                        />
                      );
                    })}
                  </div>
                  <div class="farm-fleet-map-places">
                    {placePins.map((place) => (
                      <button
                        key={`${place.kind}-${place.id}-${place.x}-${place.z}`}
                        type="button"
                        class="farm-fleet-map-place farm-fleet-map-pin"
                        style={{
                          left: `${place.left}%`,
                          top: `${place.top}%`,
                        }}
                        aria-label={place.name}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setTooltip({
                            left: place.left,
                            top: place.top,
                            html: {
                              name: place.name,
                              farm: t(placeKindLabelKey(place.kind)),
                              detail: `${Math.round(place.x)}, ${Math.round(place.z)}`,
                            },
                          });
                          const section = placeKindSection(place.kind);
                          if (place.kind === "sellPoint") {
                            setSection(section);
                            return;
                          }
                          setSection(section, { id: place.id });
                        }}
                      >
                        <span class="farm-fleet-map-pin__icon" aria-hidden="true">
                          <FleetMapPlaceIcon
                            kind={place.kind}
                            species={place.kind === "husbandry" ? place.species : undefined}
                          />
                        </span>
                        {showNames ? <span class="farm-fleet-map-pin__label">{place.name}</span> : null}
                      </button>
                    ))}
                  </div>
                  <div id="fleet-map-markers" class="farm-fleet-map-markers">
                    {pinPoints.map(({ left, top, vehicle, x, z }) => {
                      const fid = Number(vehicle.ownerFarmId ?? vehicle.farmId ?? 0);
                      const farm = farmsById.get(fid);
                      const name = resolveVehicleDisplayName(vehicle);
                      const farmName =
                        farm?.name || t("map.farmFallback", { id: fid || "?" });
                      const isFocused =
                        focusVehicle != null && vehicleMatchesDeepLinkId(vehicle, sectionParams.id);
                      const pinId = String(vehicle.id ?? vehicleRowKey(vehicle));
                      const kind = classifyFleetMapIcon(vehicle);
                      const heading = fleetMapHeadingDeg(vehicle);
                      const speed = Number(vehicle.speed);
                      const detailParts = [
                        vehicle.typeName || vehicle.vehicleType || kind,
                        `${Math.round(x)}, ${Math.round(z)}`,
                      ];
                      if (Number.isFinite(speed) && speed > 0.4) {
                        detailParts.push(`${Math.round(speed)} km/h`);
                      }
                      return (
                        <button
                          key={String(vehicle.id ?? `${name}-${x}-${z}`)}
                          type="button"
                          class={`farm-fleet-map-pin${isFocused ? " farm-fleet-map-pin--focus" : ""}`}
                          style={{
                            left: `${left}%`,
                            top: `${top}%`,
                          }}
                          aria-label={`${name} (${farmName})`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setTooltip({
                              left,
                              top,
                              html: {
                                name,
                                farm: farmName,
                                detail: detailParts.join(" · "),
                              },
                            });
                            setSection("vehicles", { id: pinId });
                          }}
                        >
                          <span
                            class="farm-fleet-map-pin__icon"
                            style={
                              heading != null
                                ? { transform: `rotate(${heading}deg)` }
                                : undefined
                            }
                            aria-hidden="true"
                          >
                            <FleetMapMarkerIcon kind={kind} vehicle={vehicle} />
                          </span>
                          {showNames ? (
                            <span class="farm-fleet-map-pin__label">{name}</span>
                          ) : null}
                        </button>
                      );
                    })}
                    {tooltip ? (
                      <div
                        class="farm-fleet-map-tooltip farm-fleet-map-tooltip--layer"
                        style={{ left: `${tooltip.left}%`, top: `${tooltip.top}%` }}
                        role="status"
                      >
                        <strong>{tooltip.html.name}</strong>
                        <br />
                        <span class="fd-muted">{tooltip.html.farm}</span>
                        <br />
                        <small>{tooltip.html.detail}</small>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="farm-fleet-map-grid" aria-hidden="true" />
          <div class="farm-fleet-map-compass" aria-hidden="true">
            <span>N</span>
          </div>
        </div>
        </div>
      </div>

      <aside class="fd-fleet-map-legend-wrap">
        <p class="fd-muted fd-fleet-map__hint">{hint}</p>
      {plotted.length === 0 ? (
        <div class="fd-fleet-map__empty">
          {allVehicles.length > 0 ? t("map.emptyNoPosition") : t("map.empty")}
        </div>
      ) : null}

      {noPositionForFocus ? (
        <div class="fd-fleet-map__empty fd-fleet-map__empty--warn">
          {t("map.noPositionForVehicle")}
        </div>
      ) : null}

        {overlay !== "off" ? (
          <>
            <h6>{t("map.legendOverlay")}</h6>
            {overlayLegend.length === 0 && overlay !== "ownership" ? (
              <span class="fd-muted">{t("map.legendOverlayEmpty")}</span>
            ) : null}
            {overlayLegend.length > 0 ? (
              <div class="farm-fleet-map-legend farm-fleet-map-legend--overlay">
                {overlayLegend.map((item, idx) => (
                  <span key={`${item.fill}-${item.labelKey || item.cropKey || item.soilTypeIndex || idx}`} class="farm-fleet-map-legend-item">
                    <span class="farm-fleet-map-legend-swatch" style={{ background: item.fill }} />
                    {overlayLegendLabel(item)}
                  </span>
                ))}
              </div>
            ) : null}
            {legendRange && isRelativeOverlayMode(overlay) ? (
              <div class={`fd-fleet-map__scale${overlayScaleInvert(overlay) ? " fd-fleet-map__scale--invert" : ""}`}>
                <span>{overlayScaleText(overlay, legendRange.min, legendRange.max).min}</span>
                <div class="fd-fleet-map__scale-bar" aria-hidden="true" />
                <span>{overlayScaleText(overlay, legendRange.min, legendRange.max).max}</span>
              </div>
            ) : null}
            {legendRange && isRelativeOverlayMode(overlay) ? (
              <p class="fd-muted fd-fleet-map__hint">
                {t("map.overlayScaleCaption", overlayScaleText(overlay, legendRange.min, legendRange.max))}
              </p>
            ) : null}
          </>
        ) : null}

        <h6>{t("map.legendTitle")}</h6>
        <div class="farm-fleet-map-legend">
          {farms.filter((f) => Number(f.id ?? f.farmId) > 0).length === 0 ? (
            <span class="fd-muted">{t("map.legendEmpty")}</span>
          ) : (
            farms
              .filter((f) => Number(f.id ?? f.farmId) > 0)
              .map((f) => {
                const id = Number(f.id ?? f.farmId);
                return (
                  <span key={id} class="farm-fleet-map-legend-item">
                    <span
                      class="farm-fleet-map-legend-swatch"
                      style={{ background: farmColorToCss(id, f.color) }}
                    />
                    {f.name || `Farm ${id}`}
                  </span>
                );
              })
          )}
        </div>
        <p class="fd-muted fd-fleet-map__hint">{t("map.overlayHint")}</p>
        {showNames ? <p class="fd-muted fd-fleet-map__hint">{t("map.namesZoomHint")}</p> : null}
        <p class="fd-muted fd-fleet-map__hint">{t("map.iconHint")}</p>
      </aside>
      </div>
    </div>
  );
}
