/** Fleet-map markers — FS25 PDA `mapHotspots` slices. Vehicles stay white; buildings keep game pin colours. */

import tractorUrl from "@/assets/map-hotspots/tractor.png";
import harvesterUrl from "@/assets/map-hotspots/harvester.png";
import trailerUrl from "@/assets/map-hotspots/trailer.png";
import truckUrl from "@/assets/map-hotspots/truck.png";
import carUrl from "@/assets/map-hotspots/car.png";
import wheelLoaderUrl from "@/assets/map-hotspots/wheelLoader.png";
import headerUrl from "@/assets/map-hotspots/header.png";
import toolUrl from "@/assets/map-hotspots/tool.png";
import toolTrailedUrl from "@/assets/map-hotspots/toolTrailed.png";
import otherUrl from "@/assets/map-hotspots/other.png";
import productionUrl from "@/assets/map-hotspots/production.png";
import tipStationUrl from "@/assets/map-hotspots/tipStation.png";
import animalsCowUrl from "@/assets/map-hotspots/animalsCow.png";
import animalsPigUrl from "@/assets/map-hotspots/animalsPig.png";
import animalsSheepUrl from "@/assets/map-hotspots/animalsSheep.png";
import animalsChickenUrl from "@/assets/map-hotspots/animalsChicken.png";
import animalsHorseUrl from "@/assets/map-hotspots/animalsHorse.png";
import animalsBeeUrl from "@/assets/map-hotspots/animalsBee.png";
import woodHarvesterUrl from "@/assets/map-hotspots/woodHarvester.png";
import trainUrl from "@/assets/map-hotspots/train.png";
import ferryUrl from "@/assets/map-hotspots/ferry.png";
import horseUrl from "@/assets/map-hotspots/horse.png";
import motorbikeUrl from "@/assets/map-hotspots/motorbike.png";

export type FleetMapIconKind =
  | "tractor"
  | "harvester"
  | "trailer"
  | "truck"
  | "car"
  | "loader"
  | "cutter"
  | "implement"
  | "other";

export interface FleetMapMarkerVehicle {
  typeName?: string;
  vehicleType?: string;
  categoryName?: string;
  filename?: string | null;
  configFileName?: string | null;
  isMotorized?: boolean;
  headingDeg?: number | null;
}

const KIND_ORDER: Array<{ kind: FleetMapIconKind; re: RegExp }> = [
  { kind: "harvester", re: /harvester|combine|wood.?harvest/ },
  { kind: "cutter", re: /cutter|header/ },
  { kind: "trailer", re: /trailer|wagon/ },
  { kind: "truck", re: /truck|lorry/ },
  { kind: "car", re: /\bcar\b|pickup/ },
  { kind: "loader", re: /loader|telehandler|wheel.?loader|skidsteer/ },
  { kind: "tractor", re: /tractor/ },
  { kind: "implement", re: /plow|plough|cultivator|seeder|sowing|sprayer|spreader|mower|implement|tool/ },
];

const KIND_HOTSPOT: Record<FleetMapIconKind, string> = {
  tractor: tractorUrl,
  harvester: harvesterUrl,
  trailer: trailerUrl,
  truck: truckUrl,
  car: carUrl,
  loader: wheelLoaderUrl,
  cutter: headerUrl,
  implement: toolUrl,
  other: otherUrl,
};

export function classifyFleetMapIcon(vehicle: FleetMapMarkerVehicle | null | undefined): FleetMapIconKind {
  const blob = [
    vehicle?.typeName,
    vehicle?.vehicleType,
    vehicle?.categoryName,
    vehicle?.filename,
    vehicle?.configFileName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const row of KIND_ORDER) {
    if (row.re.test(blob)) return row.kind;
  }
  if (vehicle?.isMotorized) return "tractor";
  return "other";
}

/** Pick the matching Giants mapHotspots slice (more specific than the type filter). */
export function fleetMapHotspotUrl(vehicle: FleetMapMarkerVehicle | null | undefined, kind: FleetMapIconKind): string {
  const blob = [
    vehicle?.typeName,
    vehicle?.vehicleType,
    vehicle?.categoryName,
    vehicle?.filename,
    vehicle?.configFileName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/wood.?harvest/.test(blob)) return woodHarvesterUrl;
  if (/\btrain\b/.test(blob)) return trainUrl;
  if (/\b(boat|ferry)\b/.test(blob)) return ferryUrl;
  if (/\bhorse\b/.test(blob)) return horseUrl;
  if (/motorbike|motorcycle/.test(blob)) return motorbikeUrl;
  if (kind === "implement" && /trail/.test(blob)) return toolTrailedUrl;
  return KIND_HOTSPOT[kind];
}

export function fleetMapHeadingDeg(vehicle: FleetMapMarkerVehicle | null | undefined): number | null {
  const n = Number(vehicle?.headingDeg);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}

export function FleetMapHotspotGlyph({ src, className }: { src: string; className?: string }) {
  return (
    <span
      class={className ? `farm-fleet-map-hotspot ${className}` : "farm-fleet-map-hotspot"}
      style={{
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
      }}
      aria-hidden="true"
    />
  );
}

/** Nose points up (north). Map pins are white; filter chips use currentColor. */
export function FleetMapMarkerIcon({
  kind,
  vehicle,
}: {
  kind: FleetMapIconKind;
  vehicle?: FleetMapMarkerVehicle | null;
}) {
  return <FleetMapHotspotGlyph src={fleetMapHotspotUrl(vehicle, kind)} />;
}

export type FleetMapPlaceKind = "production" | "husbandry" | "sellPoint";

/** PlaceableHotspot.TYPE animal slices from FS25 `mapHotspots.xml`. */
export type FleetMapHusbandrySpecies = "cow" | "pig" | "sheep" | "chicken" | "horse" | "bee" | "other";

function husbandryBlob(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "";
  const extra: string[] = [];
  const clusters = row.clusters;
  if (Array.isArray(clusters)) {
    for (const c of clusters) {
      if (!c || typeof c !== "object") continue;
      const rec = c as Record<string, unknown>;
      extra.push(String(rec.subType || ""), String(rec.animalType || ""));
    }
  }
  return [row.animalTypeName, row.animalType, row.type, row.subType, row.name, ...extra]
    .filter((v) => v != null && String(v).trim() !== "")
    .join(" ")
    .toLowerCase();
}

export function classifyHusbandrySpecies(row: Record<string, unknown> | null | undefined): FleetMapHusbandrySpecies {
  const blob = husbandryBlob(row);
  if (/chicken|hen\b|poultry/.test(blob)) return "chicken";
  if (/\bpig|\bhog|\bsow\b/.test(blob)) return "pig";
  if (/sheep|goat/.test(blob)) return "sheep";
  if (/horse|pony/.test(blob)) return "horse";
  if (/\bbee|apiary/.test(blob)) return "bee";
  if (/cow|cattle|dairy|buffalo/.test(blob)) return "cow";
  return "other";
}

function husbandryHotspotUrl(species: FleetMapHusbandrySpecies): string {
  switch (species) {
    case "chicken":
      return animalsChickenUrl;
    case "pig":
      return animalsPigUrl;
    case "sheep":
      return animalsSheepUrl;
    case "horse":
      return animalsHorseUrl;
    case "bee":
      return animalsBeeUrl;
    case "cow":
    case "other":
      return animalsCowUrl;
    default: {
      const _exhaustive: never = species;
      return _exhaustive;
    }
  }
}

export function fleetMapPlaceHotspotUrl(
  kind: FleetMapPlaceKind,
  species?: FleetMapHusbandrySpecies,
): string {
  if (kind === "production") return productionUrl;
  if (kind === "sellPoint") return tipStationUrl;
  return husbandryHotspotUrl(species ?? "other");
}

/** Full-colour PDA placeable pin (not a white mask). */
export function FleetMapPlaceIcon({
  kind,
  species,
}: {
  kind: FleetMapPlaceKind;
  species?: FleetMapHusbandrySpecies;
}) {
  return (
    <img
      class="farm-fleet-map-place-glyph"
      src={fleetMapPlaceHotspotUrl(kind, species)}
      alt=""
      draggable={false}
    />
  );
}
