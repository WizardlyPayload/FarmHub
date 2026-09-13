/**
 * Side-by-side classic (:8766) vs NEW APP (:8767) API parity snapshot.
 * Writes NDJSON to workspace debug-8787db.log for debug-mode analysis.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.resolve(__dirname, "..", "debug-8787db.log");

function log(hypothesisId, message, data) {
  const line = JSON.stringify({
    sessionId: "8787db",
    runId: "parity-pre",
    hypothesisId,
    location: "tools/parity-compare.mjs",
    message,
    data,
    timestamp: Date.now(),
  });
  fs.appendFileSync(LOG, line + "\n", "utf8");
  console.log(message, JSON.stringify(data));
}

async function load(port) {
  const r = await fetch(`http://127.0.0.1:${port}/api/data`);
  if (!r.ok) throw new Error(`:${port} ${r.status}`);
  return r.json();
}

function farmList(d) {
  const fi = d.farmInfo;
  const arr = Array.isArray(fi) ? fi : fi && typeof fi === "object" ? Object.values(fi) : [];
  return arr
    .filter((f) => f && typeof f === "object")
    .map((f) => ({
      id: f.id ?? f.farmId,
      name: f.name,
      isPlayer: f.isPlayer,
      players:
        f.players && typeof f.players === "object"
          ? Array.isArray(f.players)
            ? f.players.length
            : Object.keys(f.players).length
          : 0,
    }));
}

function stockMoist(d) {
  const by = d?.stock?.byFarm || {};
  let loc = 0;
  let moist = 0;
  for (const row of Object.values(by)) {
    for (const item of row?.items || []) {
      for (const l of item?.locations || []) {
        loc += 1;
        if (l?.moisturePct != null || l?.grade != null) moist += 1;
      }
    }
  }
  return { loc, moist };
}

function snapshot(port, d) {
  return {
    port,
    dataSource: d.dataSource,
    luaAvailable: d.luaAvailable,
    xmlAvailable: d.xmlAvailable,
    modVersion: d.serverInfo?.modVersion || d.modVersion || null,
    farms: farmList(d),
    farmCount: farmList(d).length,
    fields: Array.isArray(d.fields) ? d.fields.length : 0,
    vehicles: Array.isArray(d.vehicles) ? d.vehicles.length : 0,
    animals: Array.isArray(d.animals) ? d.animals.length : 0,
    money: d.money,
    adsEnabled: d.adsSummary?.enabled === true,
    redTapeEnabled: d.redTape?.enabled === true,
    invoices: d.invoices?.enabled ?? (d.invoices == null ? null : !!d.invoices),
    hirePurchasing: d.hirePurchasing?.enabled ?? (d.hirePurchasing == null ? null : !!d.hirePurchasing),
    weatherMoisture: !!d.weather?.moisture?.enabled,
    fieldsWithMoisture: Array.isArray(d.fields)
      ? d.fields.filter((f) => f?.moisture && (f.moisture.enabled || f.moisture.percent != null)).length
      : 0,
    stock: stockMoist(d),
    hasProduction: !!(d.production?.chains || d.production),
    lastLua: d.dataTimestamps?.lastLuaReceivedAt || null,
  };
}

const classic = snapshot(8766, await load(8766));
const neu = snapshot(8767, await load(8767));

const deltas = {
  farmCount: { classic: classic.farmCount, new: neu.farmCount, match: classic.farmCount === neu.farmCount },
  fields: { classic: classic.fields, new: neu.fields, match: classic.fields === neu.fields },
  vehicles: { classic: classic.vehicles, new: neu.vehicles, match: classic.vehicles === neu.vehicles },
  animals: { classic: classic.animals, new: neu.animals, match: classic.animals === neu.animals },
  adsEnabled: { classic: classic.adsEnabled, new: neu.adsEnabled, match: classic.adsEnabled === neu.adsEnabled },
  redTapeEnabled: {
    classic: classic.redTapeEnabled,
    new: neu.redTapeEnabled,
    match: classic.redTapeEnabled === neu.redTapeEnabled,
  },
  weatherMoisture: {
    classic: classic.weatherMoisture,
    new: neu.weatherMoisture,
    match: classic.weatherMoisture === neu.weatherMoisture,
  },
  stockMoistureLocs: {
    classic: classic.stock.moist,
    new: neu.stock.moist,
    match: classic.stock.moist === neu.stock.moist,
  },
  luaAvailable: {
    classic: classic.luaAvailable,
    new: neu.luaAvailable,
    match: classic.luaAvailable === neu.luaAvailable,
  },
};

log("D", "classic snapshot", classic);
log("D", "new-app snapshot", neu);
log("E", "parity deltas", deltas);
