/** Player vs NPC farm scoping — ported from legacy farmScope.js */

export function isPlayerFarmRecord(farm: unknown): boolean {
  if (!farm || typeof farm !== "object") return false;
  const f = farm as Record<string, unknown>;
  const id = Number(f.id ?? f.farmId);
  if (!Number.isFinite(id) || id <= 0) return false;
  if (f.isPlayer === true) return true;
  if (f.isPlayer === false) return false;

  const players = f.players;
  if (Array.isArray(players) && players.length > 0) return true;
  if (players && typeof players === "object" && Object.keys(players as object).length > 0) {
    return true;
  }

  const name = String(f.name ?? "").trim();
  return name.length > 0;
}

export function normalizeFarmInfoList(farmInfo: unknown): Record<string, unknown>[] {
  if (!farmInfo) return [];
  if (Array.isArray(farmInfo)) return farmInfo as Record<string, unknown>[];
  if (typeof farmInfo === "object") return Object.values(farmInfo as Record<string, unknown>) as Record<string, unknown>[];
  return [];
}

export function getPlayerFarmRecords(farmInfo: unknown): Record<string, unknown>[] {
  return normalizeFarmInfoList(farmInfo).filter(isPlayerFarmRecord);
}

export function getPlayerFarmIdSet(farmInfo: unknown): Set<number> {
  const ids = new Set<number>();
  for (const f of getPlayerFarmRecords(farmInfo)) {
    const id = Number(f.id ?? f.farmId);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  return ids;
}

export function entityOwnerFarmId(entity: unknown): number {
  if (!entity || typeof entity !== "object") return 0;
  const e = entity as Record<string, unknown>;
  const direct = Number(e.ownerFarmId ?? e.farmId ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const nestedLists = [e.animals, e.livestock, e.animalList].filter(Array.isArray) as unknown[][];
  for (const list of nestedLists) {
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const fid = Number(r.ownerFarmId ?? r.farmId ?? 0);
      if (Number.isFinite(fid) && fid > 0) return fid;
    }
  }
  return 0;
}

/** Multi-farm UI when more than one player farm exists (legacy isFarmDropdownEnabled). */
export function isMultiFarmEnabled(farmInfo: unknown): boolean {
  return getPlayerFarmRecords(farmInfo).length > 1;
}

function ensureArray(val: unknown): unknown[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "object") return Object.values(val as Record<string, unknown>);
  return [];
}

function animalListFromBuilding(building: unknown): unknown[] {
  if (!building || typeof building !== "object") return [];
  const b = building as Record<string, unknown>;
  if (Array.isArray(b.animals)) return b.animals;
  if (Array.isArray(b.livestock)) return b.livestock;
  if (Array.isArray(b.animalList)) return b.animalList;
  return [];
}

/** When the farm picker / saved id owns no fields (multi-farm dedicated), pick the farm with the most field rows. */
export function inferFarmIdFromFieldOwnership(
  fields: unknown,
  farms: unknown
): number | null {
  const list = ensureArray(fields);
  if (list.length === 0) return null;
  const counts = new Map<number, number>();
  for (const f of list) {
    if (!f || typeof f !== "object") continue;
    const oid = Number((f as Record<string, unknown>).ownerFarmId ?? (f as Record<string, unknown>).farmId ?? 0);
    if (!oid || Number.isNaN(oid)) continue;
    counts.set(oid, (counts.get(oid) || 0) + 1);
  }
  let best: number | null = null;
  let bestN = -1;
  for (const [id, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = id;
    }
  }
  if (best != null) return best;
  const farmList = ensureArray(farms);
  const pl = farmList.find((x) => x && Number((x as Record<string, unknown>).id) > 0) as
    | Record<string, unknown>
    | undefined;
  return pl ? Number(pl.id) : null;
}

/** Multi-farm FTP/dedicated: pick farm with the most husbandry pens / heads when fields do not disambiguate. */
export function inferFarmIdFromHusbandryOwnership(
  husbandryRows: unknown,
  farms: unknown
): number | null {
  const list = ensureArray(husbandryRows);
  if (list.length === 0) return null;
  const counts = new Map<number, number>();
  for (const h of list) {
    if (!h || typeof h !== "object") continue;
    const oid = entityOwnerFarmId(h);
    if (!oid || Number.isNaN(oid)) continue;
    const row = h as Record<string, unknown>;
    const heads = Number(row.animalCount ?? row.numAnimals ?? 0);
    const inner = animalListFromBuilding(h);
    const weight = inner.length > 0 ? inner.length : heads > 0 ? heads : 1;
    counts.set(oid, (counts.get(oid) || 0) + weight);
  }
  let best: number | null = null;
  let bestN = -1;
  for (const [id, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = id;
    }
  }
  if (best != null) return best;
  const farmList = ensureArray(farms);
  const pl = farmList.find((x) => x && Number((x as Record<string, unknown>).id) > 0) as
    | Record<string, unknown>
    | undefined;
  return pl ? Number(pl.id) : null;
}

function fieldOwnedByFarm(fields: unknown, farmId: number): boolean {
  const fid = Number(farmId);
  for (const f of ensureArray(fields)) {
    if (!f || typeof f !== "object") continue;
    const oid = Number((f as Record<string, unknown>).ownerFarmId ?? (f as Record<string, unknown>).farmId ?? 0);
    if (oid === fid) return true;
  }
  return false;
}

function husbandryOwnedByFarm(husbandryRows: unknown, farmId: number): boolean {
  const fid = Number(farmId);
  return ensureArray(husbandryRows).some((h) => entityOwnerFarmId(h) === fid);
}

function vehicleOwnedByFarm(vehicles: unknown, farmId: number): boolean {
  const fid = Number(farmId);
  for (const v of ensureArray(vehicles)) {
    if (!v || typeof v !== "object") continue;
    const oid = Number(
      (v as Record<string, unknown>).ownerFarmId ?? (v as Record<string, unknown>).farmId ?? 0
    );
    if (oid === fid) return true;
  }
  return false;
}

/**
 * Keep the user's preferred farm when it owns fields, vehicles, or husbandry.
 * Only infer from ownership counts when preferred owns nothing relevant —
 * otherwise arable farms with fields but no animals snap to the dairy farm
 * on every WebSocket refresh.
 */
export function resolveActiveFarmId(opts: {
  preferred: number;
  farms: unknown;
  fields?: unknown;
  animals?: unknown;
  vehicles?: unknown;
}): number {
  const farms = getPlayerFarmRecords(opts.farms);
  const ids = new Set(
    farms
      .map((f) => Number(f.id ?? f.farmId))
      .filter((id) => Number.isFinite(id) && id > 0)
  );
  let next =
    opts.preferred > 0 && (ids.size === 0 || ids.has(opts.preferred)) ? opts.preferred : 0;
  if (!next && farms.length > 0) {
    const first = Number(farms[0].id ?? farms[0].farmId);
    if (Number.isFinite(first) && first > 0) next = first;
  }
  if (!next) next = 1;

  const allFields = ensureArray(opts.fields);
  const husbandry = ensureArray(opts.animals);
  const vehicles = ensureArray(opts.vehicles);

  const ownsFields = fieldOwnedByFarm(allFields, next);
  const ownsVehicles = vehicleOwnedByFarm(vehicles, next);
  const ownsHusbandry = husbandryOwnedByFarm(husbandry, next);
  if (ownsFields || ownsVehicles || ownsHusbandry) return next;
  if (allFields.length === 0 && husbandry.length === 0 && vehicles.length === 0) return next;

  if (allFields.length > 0) {
    const inferred = inferFarmIdFromFieldOwnership(allFields, farms);
    if (inferred != null && inferred > 0) return inferred;
  }
  if (husbandry.length > 0) {
    const inferred = inferFarmIdFromHusbandryOwnership(husbandry, farms);
    if (inferred != null && inferred > 0) return inferred;
  }

  return next;
}
