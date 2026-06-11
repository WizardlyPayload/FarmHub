// FS25 FarmDashboard | farmScope.cjs — Node (dataMerger); keep in sync with web/assests/js/modules/farmScope.js

function isPlayerFarmRecord(farm) {
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

function normalizeFarmInfoList(farmInfo) {
  if (!farmInfo) return [];
  if (Array.isArray(farmInfo)) return farmInfo;
  if (typeof farmInfo === "object") return Object.values(farmInfo);
  return [];
}

function getPlayerFarmRecords(farmInfo) {
  return normalizeFarmInfoList(farmInfo).filter(isPlayerFarmRecord);
}

function getPlayerFarmIdSet(farmInfo) {
  const ids = new Set();
  for (const f of getPlayerFarmRecords(farmInfo)) {
    const id = Number(f.id ?? f.farmId);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  return ids;
}

function entityOwnerFarmId(entity) {
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

function isEntityOnPlayerFarm(entity, playerFarmIds) {
  const fid = entityOwnerFarmId(entity);
  if (fid <= 0) return false;
  if (!playerFarmIds || playerFarmIds.size === 0) return false;
  return playerFarmIds.has(fid);
}

function filterEntitiesForPlayerFarms(list, playerFarmIds) {
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

function pruneMergedDataToPlayerFarms(data) {
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
    if (production.totalsByFarm && typeof production.totalsByFarm === "object") {
      const tb = {};
      for (const [key, val] of Object.entries(production.totalsByFarm)) {
        if (playerIds.has(Number(key))) tb[key] = val;
      }
      production.totalsByFarm = tb;
    }
    out.production = production;
  }
  if (data.baleInventory && typeof data.baleInventory === "object") {
    const bid = Number(data.baleInventory.farmId);
    if (Number.isFinite(bid) && bid > 0 && !playerIds.has(bid)) {
      out.baleInventory = { farmId: null, onField: {}, offField: {} };
    }
  }
  return out;
}

module.exports = {
  isPlayerFarmRecord,
  getPlayerFarmRecords,
  getPlayerFarmIdSet,
  entityOwnerFarmId,
  pruneMergedDataToPlayerFarms,
};
