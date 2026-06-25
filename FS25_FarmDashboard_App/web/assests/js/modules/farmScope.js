// FS25 FarmDashboard | farmScope.js — player vs NPC farm scoping (exclude AI farms from UI)

/** @param {unknown} farm */
export function isPlayerFarmRecord(farm) {
  if (!farm || typeof farm !== "object") return false;
  const id = Number(farm.id ?? farm.farmId);
  if (!Number.isFinite(id) || id <= 0) return false;
  if (farm.isPlayer === true) return true;
  if (farm.isPlayer === false) return false;

  const players = farm.players;
  if (Array.isArray(players) && players.length > 0) return true;
  if (players && typeof players === "object" && Object.keys(players).length > 0) {
    return true;
  }

  const name = String(farm.name ?? "").trim();
  return name.length > 0;
}

export function normalizeFarmInfoList(farmInfo) {
  if (!farmInfo) return [];
  if (Array.isArray(farmInfo)) return farmInfo;
  if (typeof farmInfo === "object") return Object.values(farmInfo);
  return [];
}

export function getPlayerFarmRecords(farmInfo) {
  return normalizeFarmInfoList(farmInfo).filter(isPlayerFarmRecord);
}

export function getPlayerFarmIdSet(farmInfo) {
  const ids = new Set();
  for (const f of getPlayerFarmRecords(farmInfo)) {
    const id = Number(f.id ?? f.farmId);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  return ids;
}

export function entityOwnerFarmId(entity) {
  const direct = Number(entity?.ownerFarmId ?? entity?.farmId ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (!entity || typeof entity !== "object") return 0;
  const nestedLists = [entity.animals, entity.livestock, entity.animalList].filter(Array.isArray);
  for (const list of nestedLists) {
    for (const row of list) {
      const fid = Number(row?.ownerFarmId ?? row?.farmId ?? 0);
      if (Number.isFinite(fid) && fid > 0) return fid;
    }
  }
  return 0;
}

export function isEntityOnPlayerFarm(entity, playerFarmIds) {
  const fid = entityOwnerFarmId(entity);
  if (fid <= 0) return false;
  if (!playerFarmIds || playerFarmIds.size === 0) return false;
  return playerFarmIds.has(fid);
}

export function filterEntitiesForPlayerFarms(list, playerFarmIds) {
  if (!Array.isArray(list)) return [];
  if (!playerFarmIds || playerFarmIds.size === 0) return [];
  return list.filter((row) => isEntityOnPlayerFarm(row, playerFarmIds));
}

function normalizeProductionChains(production) {
  if (!production) return [];
  const c = production.chains;
  if (Array.isArray(c)) return c;
  if (c && typeof c === "object") return Object.values(c);
  return [];
}

/**
 * Drop NPC / unassigned farm rows from merged payloads before the dashboard stores them.
 * Player farms = farmInfo entries with at least one player or a non-empty name (excludes empty NPC slots 0/14).
 */
export function pruneMergedDataToPlayerFarms(data) {
  if (!data || typeof data !== "object") return data;

  const farmInfo = getPlayerFarmRecords(data.farmInfo);
  const playerIds = getPlayerFarmIdSet(farmInfo);
  const out = { ...data, farmInfo };

  if (playerIds.size === 0) return out;

  if (Array.isArray(data.vehicles)) {
    out.vehicles = filterEntitiesForPlayerFarms(data.vehicles, playerIds);
  }
  if (Array.isArray(data.fields)) {
    out.fields = filterEntitiesForPlayerFarms(data.fields, playerIds);
  }
  if (Array.isArray(data.animals)) {
    out.animals = filterEntitiesForPlayerFarms(data.animals, playerIds);
  }

  if (data.production && typeof data.production === "object") {
    const chains = normalizeProductionChains(data.production);
    const production = { ...data.production };
    production.chains = filterEntitiesForPlayerFarms(chains, playerIds);
    if (
      production.totalsByFarm &&
      typeof production.totalsByFarm === "object"
    ) {
      const tb = {};
      for (const [key, val] of Object.entries(production.totalsByFarm)) {
        if (playerIds.has(Number(key))) tb[key] = val;
      }
      production.totalsByFarm = tb;
    }
    out.production = production;
  }

  if (data.baleInventory && typeof data.baleInventory === "object") {
    const inv = { ...data.baleInventory };
    if (inv.byFarm && typeof inv.byFarm === "object") {
      const bf = {};
      for (const [key, val] of Object.entries(inv.byFarm)) {
        const id = Number(key);
        if (Number.isFinite(id) && id > 0 && playerIds.has(id)) {
          bf[String(id)] = val;
        }
      }
      inv.byFarm = bf;
      if (inv.moisture?.byFarm) {
        const mf = {};
        for (const [key, val] of Object.entries(inv.moisture.byFarm)) {
          const id = Number(key);
          if (Number.isFinite(id) && id > 0 && playerIds.has(id)) {
            mf[String(id)] = val;
          }
        }
        inv.moisture = { ...inv.moisture, byFarm: mf };
      }
    }
    const bid = Number(inv.farmId);
    if (Number.isFinite(bid) && bid > 0 && !playerIds.has(bid)) {
      inv.farmId = null;
      inv.onField = {};
      inv.offField = {};
    }
    out.baleInventory = inv;
  }

  if (data.stock?.byFarm && typeof data.stock.byFarm === "object") {
    const catalog = {
      ...(data.fillTypeCatalog || {}),
      ...(data.stock.fillTypeCatalog || {}),
      ...(data.economy?.fillTypeCatalog || {}),
      ...(data.economy?.marketPrices?.fillTypesByIndex || {}),
    };
    const n2i = data.economy?.marketPrices?.nameToIndex;
    if (n2i && typeof n2i === "object") {
      for (const [name, idx] of Object.entries(n2i)) {
        if (idx != null) catalog[String(idx)] = name;
      }
    }
    for (const [name, crop] of Object.entries(data.economy?.marketPrices?.crops || {})) {
      const idx = crop?.fillTypeIndex;
      if (idx != null) catalog[String(idx)] = name;
    }
    for (const station of Object.values(data.economy?.marketPrices?.sellPoints || {})) {
      if (!station?.prices || typeof station.prices !== "object") continue;
      for (const [productName, priceInfo] of Object.entries(station.prices)) {
        const idx = priceInfo?.fillTypeIndex;
        if (idx != null) catalog[String(idx)] = productName;
      }
    }
    const stock = {
      ...data.stock,
      fillTypeCatalog: catalog,
      byFarm: {},
    };
    for (const [key, val] of Object.entries(data.stock.byFarm)) {
      const id = Number(key);
      if (Number.isFinite(id) && id > 0 && playerIds.has(id)) {
        const row = val && typeof val === "object" ? { ...val } : val;
        if (row && Array.isArray(row.items)) {
          row.items = row.items.filter((it) => Number(it?.totalLiters) > 0);
          row.fillTypeCount = row.items.length;
        }
        stock.byFarm[String(id)] = row;
      }
    }
    out.stock = stock;
    if (Object.keys(catalog).length > 0) out.fillTypeCatalog = catalog;
  }

  if (data.redTape?.byFarm && typeof data.redTape.byFarm === "object") {
    const redTape = { ...data.redTape, byFarm: {} };
    for (const [key, val] of Object.entries(data.redTape.byFarm)) {
      const id = Number(key);
      if (Number.isFinite(id) && id > 0 && playerIds.has(id)) {
        redTape.byFarm[String(id)] = val;
      }
    }
    out.redTape = redTape;
  }

  return out;
}
