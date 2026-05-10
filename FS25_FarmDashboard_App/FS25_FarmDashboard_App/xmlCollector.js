// FS25 FarmDashboard | xmlCollector.js | v2.0.0

/**
 * xmlCollector.js  —  FS25 Savegame XML Reader
 *
 * Parses all useful XML files from the savegame folder and returns
 * structured data ready for dataMerger.js.
 *
 * Files handled:
 *   careerSavegame.xml  — settings, map name, mod list
 *   farms.xml           — farm names, money, loan, players, statistics
 *   farmland.xml        — farmlandId → farmId ownership map  (KEY: fixes fields)
 *   fields.xml          — complete field state: crop, growthState, weed, soil
 *   environment.xml     — current day/time + full weather forecast
 *   missions.xml        — active missions with rewards and field IDs
 *   vehicles.xml        — all owned vehicles with fill levels / damage
 *   economy.xml         — 12-period crop price history
 *   placeables.xml      — all placed buildings / silos
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const { XMLParser } = require('fast-xml-parser');
const { collectFs25DocumentRoots } = require('./fs25Paths');
const { readFileUtf8WithRetryAsync } = require('./fileReadRetry');

// Whole-file read + parse only: fast-xml-parser v4 here exposes parse(string), not a supported streaming API for arbitrary savegame XML.

// ─── XML parser (fast-xml-parser) ────────────────────────────────────────────

const ARRAY_TAGS = new Set([
    'mod', 'farmland', 'field', 'farm', 'player', 'instance', 'vehicle', 'unit',
    'component', 'placeable', 'fillType', 'period', 'farmlandStatistic',
    /** FS25 may nest rows (e.g. fields.fieldStates.field) — tag still forces arrays when repeated. */
    'fieldStates',
]);

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: true,
    trimValues: true,
    isArray: (tagName) => ARRAY_TAGS.has(tagName),
});

function parseXmlToDoc(xmlStr) {
    if (!xmlStr || typeof xmlStr !== 'string') return null;
    try {
        return xmlParser.parse(xmlStr);
    } catch (e) {
        console.warn('[XML] fast-xml-parser failed:', e && e.message ? e.message : e);
        return null;
    }
}

/** Strip optional XML declaration wrapper — parser returns single root key per file. */
function unwrapDoc(parsed) {
    if (!parsed || typeof parsed !== 'object') return null;
    const keys = Object.keys(parsed).filter((k) => k !== '?xml');
    if (keys.length === 1) return parsed[keys[0]];
    return parsed;
}

/** fast-xml-parser uses `attributeNamePrefix: '@_'` (two chars) — strip with slice(2), not slice(3). */
const ATTR_PREFIX = '@_';

function attrs(el) {
    const out = {};
    if (!el || typeof el !== 'object') return out;
    const pxLen = ATTR_PREFIX.length;
    for (const [k, v] of Object.entries(el)) {
        if (k.startsWith(ATTR_PREFIX)) out[k.slice(pxLen)] = v;
    }
    return out;
}

function ensureArray(x) {
    if (x === undefined || x === null) return [];
    return Array.isArray(x) ? x : [x];
}

/** Depth-first collect of elements named tagName (e.g. instance, unit, field, component). */
function collectTagRecursive(node, tagName, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) {
        node.forEach((x) => collectTagRecursive(x, tagName, out));
        return out;
    }
    for (const [k, v] of Object.entries(node)) {
        if (k === tagName) {
            ensureArray(v).forEach((x) => out.push(x));
        } else if (typeof v === 'object' && k !== '?xml' && !k.startsWith('@_')) {
            collectTagRecursive(v, tagName, out);
        }
    }
    return out;
}

function childText(parent, tag) {
    if (!parent || typeof parent !== 'object') return null;
    const v = parent[tag];
    if (v === undefined || v === null) return null;
    if (typeof v === 'object' && '#text' in v) return String(v['#text']).trim();
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
    return null;
}

function scalarText(parent, tag, fallback = null) {
    const t = childText(parent, tag);
    return t !== null && t !== '' ? t : fallback;
}

// ─── savegame path resolution ─────────────────────────────────────────────────

function getElectronDocumentsPath() {
    try {
        const { app } = require('electron');
        return app.getPath('documents');
    } catch {
        return null;
    }
}

/** Same bundle main.js downloads over FTP (GPortal / dedicated: profile/savegameN/…). */
const SAVEGAME_XML_FILES = [
    'careerSavegame.xml',
    'farmland.xml',
    'fields.xml',
    'farms.xml',
    'environment.xml',
    'missions.xml',
    'vehicles.xml',
    'economy.xml',
    'placeables.xml',
    'precisionFarming.xml',
];

const FTP_SAVEGAME_XML_DOWNLOAD_ORDER = [
    'fields.xml',
    'farms.xml',
    'environment.xml',
    'missions.xml',
    'vehicles.xml',
    'economy.xml',
    'placeables.xml',
    'careerSavegame.xml',
    'farmland.xml',
    'precisionFarming.xml',
];

(function assertFtpOrderMatchesCanonical() {
    const a = new Set(SAVEGAME_XML_FILES);
    const b = new Set(FTP_SAVEGAME_XML_DOWNLOAD_ORDER);
    if (a.size !== b.size || SAVEGAME_XML_FILES.some((f) => !b.has(f))) {
        throw new Error('FTP_SAVEGAME_XML_DOWNLOAD_ORDER must list the same files as SAVEGAME_XML_FILES');
    }
})();

async function fileExists(p) {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

/** @deprecated Prefer getSavegamePathAsync — sync exists checks block the main thread. */
function getSavegamePath(srv, saveSlot) {
    const slot = saveSlot || srv.localSubFolder || 'savegame1';

    if (srv.mode === 'ftp') {
        try {
            const { app } = require('electron');
            return path.join(app.getPath('userData'), 'ftpXmlCache', srv.id, slot);
        } catch (e) {
            console.warn('[XML] FTP savegame cache path unavailable:', e.message);
            return null;
        }
    }

    const slotLocal = srv.localSubFolder || saveSlot || 'savegame1';

    if (srv.localPath) {
        let check = srv.localPath;
        for (let i = 0; i < 6; i++) {
            const candidate = path.join(check, slotLocal);
            if (fsSync.existsSync(path.join(candidate, 'careerSavegame.xml'))) return candidate;
            check = path.dirname(check);
        }
    }

    const fs25Roots = collectFs25DocumentRoots(getElectronDocumentsPath);
    for (const fs25Root of fs25Roots) {
        const direct = path.join(fs25Root, slotLocal);
        if (fsSync.existsSync(path.join(direct, 'careerSavegame.xml'))) return direct;
    }
    const fallbackRoot =
        fs25Roots[0] || path.join(os.homedir(), 'Documents', 'My Games', 'FarmingSimulator2025');
    const direct = path.join(fallbackRoot, slotLocal);

    if (srv.localPath && fsSync.existsSync(path.join(srv.localPath, 'careerSavegame.xml'))) {
        return srv.localPath;
    }

    console.warn(`[XML] Could not locate savegame folder for slot "${slotLocal}"`);
    return direct;
}

async function getSavegamePathAsync(srv, saveSlot) {
    const slot = saveSlot || srv.localSubFolder || 'savegame1';

    if (srv.mode === 'ftp') {
        try {
            const { app } = require('electron');
            return path.join(app.getPath('userData'), 'ftpXmlCache', srv.id, slot);
        } catch (e) {
            console.warn('[XML] FTP savegame cache path unavailable:', e.message);
            return null;
        }
    }

    const slotLocal = srv.localSubFolder || saveSlot || 'savegame1';

    if (srv.localPath) {
        let check = srv.localPath;
        for (let i = 0; i < 6; i++) {
            const candidate = path.join(check, slotLocal);
            if (await fileExists(path.join(candidate, 'careerSavegame.xml'))) return candidate;
            check = path.dirname(check);
        }
    }

    const fs25Roots = collectFs25DocumentRoots(getElectronDocumentsPath);
    for (const fs25Root of fs25Roots) {
        const direct = path.join(fs25Root, slotLocal);
        if (await fileExists(path.join(direct, 'careerSavegame.xml'))) return direct;
    }
    const fallbackRoot =
        fs25Roots[0] || path.join(os.homedir(), 'Documents', 'My Games', 'FarmingSimulator2025');
    const direct = path.join(fallbackRoot, slotLocal);

    if (srv.localPath && await fileExists(path.join(srv.localPath, 'careerSavegame.xml'))) {
        return srv.localPath;
    }

    console.warn(`[XML] Could not locate savegame folder for slot "${slotLocal}"`);
    return direct;
}

// ─── parsers (DOM-shaped objects from fast-xml-parser) ───────────────────────

function parseCareerSavegameDoc(doc) {
    if (!doc || typeof doc !== 'object') return {};
    const career = unwrapDoc(doc) || doc;

    const mods = [];
    const modNodes = ensureArray(career.mods && career.mods.mod);
    for (const m of modNodes) {
        const am = attrs(m);
        mods.push({ modName: String(am.modName || ''), title: String(am.title || '') });
    }

    const settingsEl = career.settings || {};

    return {
        savegameName: scalarText(career, 'savegameName'),
        mapId: scalarText(career, 'mapId'),
        mapTitle: scalarText(career, 'mapTitle'),
        saveDate: scalarText(career, 'saveDateFormatted') || scalarText(career, 'saveDate'),
        creationDate: scalarText(career, 'creationDate'),
        money: parseFloat(scalarText(career, 'money', '0') || '0'),
        playTime: parseFloat(scalarText(career, 'playTime', '0') || '0'),
        economicDifficulty: scalarText(career, 'economicDifficulty'),
        growthMode: scalarText(career, 'growthMode'),
        timeScale: parseFloat(scalarText(career, 'timeScale', '1') || '1'),
        plannedDaysPerPeriod: parseInt(scalarText(career, 'plannedDaysPerPeriod', '2') || '2', 10),
        settings: {
            weedsEnabled: scalarText(settingsEl, 'weedsEnabled') === 'true',
            limeRequired: scalarText(settingsEl, 'limeRequired') === 'true',
            plowingRequired: scalarText(settingsEl, 'plowingRequiredEnabled') === 'true',
            stonesEnabled: scalarText(settingsEl, 'stonesEnabled') === 'true',
            fruitDestruction: scalarText(settingsEl, 'fruitDestruction') === 'true',
            snowEnabled: scalarText(settingsEl, 'isSnowEnabled') === 'true',
            trafficEnabled: scalarText(settingsEl, 'trafficEnabled') === 'true',
            fuelUsage: scalarText(settingsEl, 'fuelUsage'),
            helperBuySeeds: scalarText(settingsEl, 'helperBuySeeds') === 'true',
            helperBuyFuel: scalarText(settingsEl, 'helperBuyFuel') === 'true',
            helperBuyFertilizer: scalarText(settingsEl, 'helperBuyFertilizer') === 'true',
        },
        mods,
    };
}

function parseCareerSavegame(xmlStr) {
    if (!xmlStr) return {};
    const doc = parseXmlToDoc(xmlStr);
    if (!doc) return {};
    return parseCareerSavegameDoc(doc);
}

function parseFarmlandXml(xmlStr) {
    if (!xmlStr) return { ownership: new Map(), playerFarmlandIds: new Set() };
    const doc = parseXmlToDoc(xmlStr);
    if (!doc) return { ownership: new Map(), playerFarmlandIds: new Set() };

    const root = unwrapDoc(doc) || doc;
    const ownership = new Map();
    const playerFarmlandIds = new Set();

    let list = collectTagRecursive(root, 'farmland', []);
    if (list.length === 0) list = collectTagRecursive(doc, 'farmland', []);
    if (list.length === 0) list = ensureArray(root.farmland);
    for (const node of list) {
        const am = attrs(node);
        const id = parseInt(String(am.id || '0'), 10);
        const farmId = parseInt(String(am.farmId || '0'), 10);
        if (id > 0) {
            ownership.set(id, farmId);
            if (farmId > 0) playerFarmlandIds.add(id);
        }
    }

    return { ownership, playerFarmlandIds };
}

function parseFieldsXml(xmlStr, farmlandOwnership, scannedFarmlands, farmlandStats, careerSettings) {
    if (!xmlStr) return [];
    const doc = parseXmlToDoc(xmlStr);
    if (!doc) return [];

    const root = unwrapDoc(doc) || doc;
    const fields = [];
    const plowingRequired = !careerSettings || careerSettings.plowingRequired !== false;

    /** Giants may nest `<field>` under wrappers (e.g. fieldStates); flat `root.field` misses them. */
    let list = collectTagRecursive(root, 'field', []);
    if (list.length === 0) list = collectTagRecursive(doc, 'field', []);
    if (list.length === 0) list = ensureArray(root.field);
    for (const node of list) {
        const a = attrs(node);
        const id = parseInt(String(a.id || '0'), 10);
        const fruitType = String(a.fruitType || 'UNKNOWN');
        const growthState = parseInt(String(a.growthState || '0'), 10);
        const groundType = String(a.groundType || 'UNKNOWN');
        const weedState = parseInt(String(a.weedState || '0'), 10);
        const limeLevel = parseInt(String(a.limeLevel || '0'), 10);
        const sprayLevel = parseInt(String(a.sprayLevel || '0'), 10);
        const sprayType = String(a.sprayType || 'NONE');
        const plowLevel = parseInt(String(a.plowLevel || '0'), 10);
        const stubble = parseInt(String(a.stubbleShredLevel || '0'), 10);
        const lastGrowth = parseInt(String(a.lastGrowthState || '0'), 10);
        const plannedFruit = String(a.plannedFruit || 'FALLOW');
        const stoneLevel = parseInt(String(a.stoneLevel || '0'), 10);
        const rollerLevel = parseInt(String(a.rollerLevel || '0'), 10);

        const ownerFarmId = farmlandOwnership ? (farmlandOwnership.get(id) || 0) : 0;
        const isScanned = scannedFarmlands ? scannedFarmlands.has(id) : false;
        const pfStats = farmlandStats ? (farmlandStats[id] || null) : null;

        const isHarvestReady = groundType.includes('HARVEST_READY');
        const isHarvested = groundType.includes('HARVESTED');
        const isWithered =
            fruitType !== 'GRASS' &&
            growthState > 0 &&
            (groundType === 'WITHERED' || (fruitType !== 'UNKNOWN' && growthState > 12));
        const isEmpty = fruitType === 'UNKNOWN' || growthState === 0;
        const needsPlowFlag = plowingRequired && plowLevel < 1;
        const needsWork = weedState > 2 || limeLevel < 1 || sprayLevel < 1 || needsPlowFlag;

        const maxGrowthEst = fruitType === 'GRASS' ? 4 : 8;
        const growthPct = isEmpty ? 0 : Math.min(100, Math.round((growthState / maxGrowthEst) * 100));

        const suggestions = [];
        if (isHarvestReady) {
            const ftU = String(fruitType || '').toUpperCase();
            const harvestAction = ftU === 'GRASS' ? 'Harvest grass' : `Harvest ${fruitType}`;
            suggestions.push({ priority: 1, action: harvestAction, type: 'harvest' });
        } else if (isEmpty && plowLevel > 0) {
            suggestions.push({ priority: 2, action: 'Cultivate or no-till drill into worked soil', type: 'planting' });
        } else if (!isEmpty && weedState > 2) {
            suggestions.push({ priority: 3, action: 'Spray or mechanical-weed — weeds are high', type: 'maintenance' });
        }
        if (limeLevel < 1) suggestions.push({ priority: 4, action: 'Spread lime — pH is low', type: 'maintenance' });
        if (sprayLevel < 1 && !isEmpty) suggestions.push({ priority: 4, action: 'Fertilize — nutrient level is low', type: 'maintenance' });
        if (needsPlowFlag && isEmpty) suggestions.push({ priority: 5, action: 'Plow or disc — primary tillage needed', type: 'preparation' });
        suggestions.sort((a, b) => a.priority - b.priority);

        const hasPfStats = pfStats && typeof pfStats === 'object';
        const pfActive =
            !!isScanned ||
            (hasPfStats && (pfStats.numSoilSamples > 0 || Object.keys(pfStats).length > 0));

        fields.push({
            id,
            ownerFarmId,
            farmlandId: id,
            fruitType,
            plannedFruit,
            growthState,
            lastGrowthState: lastGrowth,
            maxGrowthState: maxGrowthEst,
            growthStatePercentage: growthPct,
            groundType,
            weedState,
            limeLevel,
            sprayLevel,
            sprayType,
            plowLevel,
            stubbleShredLevel: stubble,
            stoneLevel,
            rollerLevel,
            needsRolling: false,
            harvestReady: isHarvestReady,
            isHarvested,
            isWithered,
            needsWork,
            suggestions,
            isPrecisionFarming: pfActive,
            nitrogenLevel: 0,
            targetNitrogen: 0,
            phValue: 0,
            targetPh: 0,
            isScanned: false,
            nitrogenText: `${sprayLevel}/2`,
            limeText: limeLevel >= 1 ? 'OK' : 'Needed',
            isScanned,
            pfStats,
        });
    }
    return fields;
}

function parseFarmsXml(xmlStr) {
    if (!xmlStr) return [];
    const doc = parseXmlToDoc(xmlStr);
    if (!doc) return [];

    const root = unwrapDoc(doc) || doc;
    const farms = [];

    const farmList = ensureArray(root.farm);
    for (const farm of farmList) {
        const fa = attrs(farm);
        const farmId = parseInt(String(fa.farmId || '0'), 10);
        if (farmId === 0) continue;

        const players = [];
        for (const pm of ensureArray(farm.player)) {
            const pa = attrs(pm);
            players.push({
                userId: String(pa.uniqueUserId || ''),
                nickname: String(pa.lastNickname || 'Unknown'),
                lastConnected: String(pa.timeLastConnected || ''),
                isFarmManager: String(pa.farmManager || '') === 'true',
            });
        }

        const stats = {};
        const statFields = [
            'traveledDistance',
            'fuelUsage',
            'seedUsage',
            'sprayUsage',
            'workedHectares',
            'cultivatedHectares',
            'sownHectares',
            'sprayedHectares',
            'threshedHectares',
            'plowedHectares',
            'workedTime',
            'baleCount',
            'revenue',
            'expenses',
            'playTime',
            'repairVehicleCount',
            'wrappedBales',
            'tractorDistance',
            'carDistance',
            'truckDistance',
        ];
        statFields.forEach((f) => {
            const v = childText(farm, f);
            if (v !== null) stats[f] = parseFloat(v);
        });

        farms.push({
            id: farmId,
            name: String(fa.name || `Farm ${farmId}`),
            color: parseInt(String(fa.color || '1'), 10),
            money: parseFloat(String(fa.money || '0')),
            loan: parseFloat(String(fa.loan || '0')),
            players,
            statistics: stats,
        });
    }
    return farms;
}

function parseEnvironmentXml(xmlStr) {
    if (!xmlStr) return {};
    const doc = parseXmlToDoc(xmlStr);
    if (!doc) return {};

    const env = unwrapDoc(doc) || doc;

    const dayTime = parseFloat(scalarText(env, 'dayTime', '0') || '0');
    const currentDay = parseInt(scalarText(env, 'currentDay', '1') || '1', 10);

    const dayMs = dayTime;
    const hour = Math.floor(dayMs / 3600000);
    const minute = Math.floor((dayMs % 3600000) / 60000);

    const forecast = [];
    const instances = collectTagRecursive(env, 'instance', []);
    for (const inst of instances) {
        const a = attrs(inst);
        forecast.push({
            typeName: String(a.typeName || 'SUN'),
            season: String(a.season || 'SPRING'),
            startDay: parseInt(String(a.startDay || '0'), 10),
            startDayTime: parseInt(String(a.startDayTime || '0'), 10),
            duration: parseInt(String(a.duration || '0'), 10),
        });
    }

    const nowMs = currentDay * 86400000 + dayMs;
    const currentForecast =
        forecast.find((f) => {
            const start = f.startDay * 86400000 + f.startDayTime;
            const end = start + f.duration;
            return nowMs >= start && nowMs < end;
        }) || forecast[0];

    const byDay = {};
    forecast.forEach((f) => {
        if (f.startDay > currentDay && f.startDay <= currentDay + 3) {
            if (!byDay[f.startDay]) byDay[f.startDay] = [];
            byDay[f.startDay].push(f.typeName);
        }
    });
    const forecastDays = Object.entries(byDay).map(([day, types]) => ({
        day: parseInt(day, 10),
        weatherType: types[0],
        allTypes: types,
        minTemperature: null,
        maxTemperature: null,
        precipitationChance: types.includes('RAIN') || types.includes('SNOW') ? 80 : 20,
    }));

    return {
        dayTime,
        currentDay,
        hour,
        minute,
        currentWeather: currentForecast?.typeName || 'SUN',
        currentSeason: currentForecast?.season || 'SPRING',
        forecast: forecastDays,
        rawForecast: forecast,
    };
}

function collectMissionEntries(node, acc) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach((x) => collectMissionEntries(x, acc));
        return;
    }
    for (const [key, val] of Object.entries(node)) {
        if (key === '?xml') continue;
        if (key.endsWith('Mission')) {
            for (const item of ensureArray(val)) {
                acc.push({ type: key, el: item });
            }
        } else if (typeof val === 'object') {
            collectMissionEntries(val, acc);
        }
    }
}

function parseMissionsXml(xmlStr) {
    if (!xmlStr) return [];
    const doc = parseXmlToDoc(xmlStr);
    if (!doc) return [];

    const acc = [];
    collectMissionEntries(unwrapDoc(doc) || doc, acc);

    const missions = [];
    for (const { type, el } of acc) {
        const outer = attrs(el);
        const reward =
            parseInt(childText(el, 'reward') || String(outer.reward || '0'), 10) ||
            parseInt(String(outer.reward || '0'), 10);

        let endDay = 0;
        const edNode = el.endDate || el.enddate;
        if (edNode !== undefined) {
            const ed = Array.isArray(edNode) ? edNode[0] : edNode;
            endDay = parseInt(String(attrs(ed).endDay || '0'), 10);
        }

        const fieldIds = [];
        for (const fn of collectTagRecursive(el, 'field', [])) {
            fieldIds.push(parseInt(String(attrs(fn).id || '0'), 10));
        }

        let completion = parseFloat(String(outer.completion || '0'));
        if (Number.isNaN(completion)) completion = 0;

        missions.push({
            uniqueId: outer.uniqueId != null ? String(outer.uniqueId) : '',
            type,
            status: String(outer.status || 'CREATED'),
            reward,
            endDay,
            fieldIds,
            completion,
        });
    }
    return missions;
}

function firstVehiclePositionDamage(innerObj) {
    const comps = collectTagRecursive(innerObj, 'component', []);
    for (const c of comps) {
        const ac = attrs(c);
        if (ac.position) {
            const posStr = String(ac.position).trim().split(/\s+/);
            return {
                position: {
                    x: parseFloat(posStr[0] || '0'),
                    y: parseFloat(posStr[1] || '0'),
                    z: parseFloat(posStr[2] || '0'),
                },
                damage: parseFloat(String(ac.damage != null ? ac.damage : '0')),
            };
        }
    }
    return {
        position: { x: 0, y: 0, z: 0 },
        damage: 0,
    };
}

function parseVehiclesXml(xmlStr) {
    if (!xmlStr) return [];
    const doc = parseXmlToDoc(xmlStr);
    if (!doc) return [];

    const root = unwrapDoc(doc) || doc;
    const vehicles = [];

    for (const veh of ensureArray(root.vehicle)) {
        const outerAttrs = attrs(veh);
        const farmId = parseInt(String(outerAttrs.farmId || '0'), 10);
        if (farmId === 0) continue;

        const fillLevels = {};
        for (const unit of collectTagRecursive(veh, 'unit', [])) {
            const ua = attrs(unit);
            if (ua.fillType != null && ua.fillLevel != null) {
                fillLevels[String(ua.fillType)] = parseFloat(String(ua.fillLevel));
            }
        }

        const { position, damage } = firstVehiclePositionDamage(veh);

        const filename = String(outerAttrs.filename || '');
        const nameParts = filename.replace(/\\/g, '/').split('/');
        const rawName = nameParts[nameParts.length - 1].replace('.xml', '');

        vehicles.push({
            uniqueId: outerAttrs.uniqueId != null ? String(outerAttrs.uniqueId) : '',
            filename,
            name: rawName,
            farmId,
            ownerFarmId: farmId,
            age: parseFloat(String(outerAttrs.age || '0')),
            price: parseFloat(String(outerAttrs.price || '0')),
            operatingTime: parseFloat(String(outerAttrs.operatingTime || '0')),
            propertyState: String(outerAttrs.propertyState || 'OWNED'),
            damage,
            fillLevels,
            position,
            source: 'xml',
        });
    }
    return vehicles;
}

function parseEconomyXml(xmlStr) {
    if (!xmlStr) return {};
    const doc = parseXmlToDoc(xmlStr);
    if (!doc) return {};

    const root = unwrapDoc(doc) || doc;
    const prices = {};
    const fillRoot = root.fillTypes || root;

    for (const ft of ensureArray(fillRoot.fillType)) {
        const fa = attrs(ft);
        const cropName = String(fa.fillType || '');
        if (!cropName) continue;

        const totalAmount = parseFloat(String(fa.totalAmount || '0'));
        const history = {};

        for (const per of ensureArray(ft.period)) {
            const pa = attrs(per);
            const periodKey = pa.period != null ? String(pa.period) : '';
            let txt = null;
            if (per && typeof per === 'object') {
                if ('#text' in per) txt = String(per['#text']);
                else if (typeof per === 'number') txt = String(per);
            }
            if (periodKey && txt != null && txt !== '') {
                history[periodKey] = parseInt(txt, 10);
            }
        }

        if (Object.keys(history).length === 0) continue;
        const vals = Object.values(history);
        prices[cropName] = {
            history,
            avgPrice: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
            minPrice: Math.min(...vals),
            maxPrice: Math.max(...vals),
            totalAmount,
        };
    }
    return prices;
}

function parsePlaceablesXml(xmlStr) {
    if (!xmlStr) return [];
    const doc = parseXmlToDoc(xmlStr);
    if (!doc) return [];

    const root = unwrapDoc(doc) || doc;
    const placeables = [];

    for (const pl of ensureArray(root.placeable)) {
        const pa = attrs(pl);
        const farmId = parseInt(String(pa.farmId || '0'), 10);
        if (farmId === 0) continue;
        placeables.push({
            uniqueId: pa.uniqueId != null ? String(pa.uniqueId) : '',
            farmId,
            age: parseFloat(String(pa.age || '0')),
            price: parseFloat(String(pa.price || '0')),
        });
    }
    return placeables;
}

function collectFarmlandTramlineEntries(node, out) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach((x) => collectFarmlandTramlineEntries(x, out));
        return;
    }
    for (const [key, val] of Object.entries(node)) {
        if (key === 'farmland') {
            for (const el of ensureArray(val)) {
                const a = attrs(el);
                if (a.width != null && a.farmlandId != null) {
                    out.push(el);
                }
            }
        } else if (typeof val === 'object' && key !== '?xml') {
            collectFarmlandTramlineEntries(val, out);
        }
    }
}

function parsePrecisionFarmingXml(xmlStr) {
    if (!xmlStr) return { scannedFarmlands: new Set(), farmlandStats: {} };

    const doc = parseXmlToDoc(xmlStr);
    if (!doc) return { scannedFarmlands: new Set(), farmlandStats: {} };

    const root = unwrapDoc(doc) || doc;

    const scannedFarmlands = new Set();
    const farmlandStats = {};
    const tramlines = {};

    const tramEls = [];
    collectFarmlandTramlineEntries(root, tramEls);
    for (const el of tramEls) {
        const a = attrs(el);
        const fid = parseInt(String(a.farmlandId || '0'), 10);
        if (fid > 0) {
            tramlines[fid] = {
                width: parseFloat(String(a.width || '0')),
                workDirection: parseFloat(String(a.workDirection || '0')),
                spacing: parseFloat(String(a.spacing || '0')),
            };
        }
    }

    function collectStats(ob, acc) {
        if (!ob || typeof ob !== 'object') return;
        if (Array.isArray(ob)) {
            ob.forEach((x) => collectStats(x, acc));
            return;
        }
        for (const [k, v] of Object.entries(ob)) {
            if (k === 'farmlandStatistic') {
                for (const block of ensureArray(v)) acc.push(block);
            } else if (typeof v === 'object') {
                collectStats(v, acc);
            }
        }
    }

    const statBlocks = [];
    collectStats(root, statBlocks);

    for (const inner of statBlocks) {
        const fa = attrs(inner);
        const farmlandId = parseInt(String(fa.farmlandId || '0'), 10);
        if (farmlandId < 1) continue;

        const tcNode = inner.totalCounter;
        const tcWrap = tcNode !== undefined ? (Array.isArray(tcNode) ? tcNode[0] : tcNode) : null;
        if (!tcWrap) continue;

        const tc = attrs(tcWrap);
        const numSamples = parseInt(String(tc.numSoilSamples || '0'), 10);
        const yield_ = parseFloat(String(tc.yield || '0'));
        const yieldWeight = parseFloat(String(tc.yieldWeight || '0'));
        const bestPrice = parseFloat(String(tc.yieldBestPrice || '0'));
        const usedLime = parseFloat(String(tc.usedLime || '0'));
        const usedFert =
            parseFloat(String(tc.usedMineralFertilizer || '0')) +
            parseFloat(String(tc.usedLiquidFertilizer || '0'));
        const usedManure =
            parseFloat(String(tc.usedManure || '0')) + parseFloat(String(tc.usedLiquidManure || '0'));
        const usedFuel = parseFloat(String(tc.usedFuel || '0'));
        const subsidies = parseFloat(String(tc.subsidies || '0'));
        const vehicleCosts = parseFloat(String(tc.vehicleCosts || '0'));

        if (numSamples > 0) scannedFarmlands.add(farmlandId);

        farmlandStats[farmlandId] = {
            numSoilSamples: numSamples,
            yield: yield_,
            yieldWeight,
            yieldBestPrice: bestPrice,
            usedLime,
            usedFertilizer: usedFert,
            usedManure,
            usedFuel,
            subsidies,
            vehicleCosts,
            tramline: tramlines[farmlandId] || null,
        };
    }

    return { scannedFarmlands, farmlandStats, tramlines };
}

// ─── main export ─────────────────────────────────────────────────────────────

async function collectXmlData(srv, saveSlot) {
    const savegameDir = await getSavegamePathAsync(srv, saveSlot);
    if (!savegameDir) return null;

    const file = (f) => path.join(savegameDir, f);
    const has = async (f) => fileExists(file(f));

    if (!(await has('careerSavegame.xml')) && !(await has('fields.xml'))) {
        console.log(`[XML] No savegame files found at: ${savegameDir}`);
        return null;
    }
    console.log(`[XML] Reading savegame from: ${savegameDir}`);

    const [
        rawFarmland,
        rawCareer,
        rawPf,
        rawFarms,
        rawFields,
        rawEnv,
        rawMissions,
        rawVehicles,
        rawEconomy,
        rawPlaceables,
    ] = await Promise.all([
        readFileUtf8WithRetryAsync(file('farmland.xml')),
        readFileUtf8WithRetryAsync(file('careerSavegame.xml')),
        readFileUtf8WithRetryAsync(file('precisionFarming.xml')),
        readFileUtf8WithRetryAsync(file('farms.xml')),
        readFileUtf8WithRetryAsync(file('fields.xml')),
        readFileUtf8WithRetryAsync(file('environment.xml')),
        readFileUtf8WithRetryAsync(file('missions.xml')),
        readFileUtf8WithRetryAsync(file('vehicles.xml')),
        readFileUtf8WithRetryAsync(file('economy.xml')),
        readFileUtf8WithRetryAsync(file('placeables.xml')),
    ]);

    const { ownership: farmlandOwnership, playerFarmlandIds } = parseFarmlandXml(rawFarmland);

    const career = parseCareerSavegame(rawCareer);
    const pfData = parsePrecisionFarmingXml(rawPf);
    const farms = parseFarmsXml(rawFarms);
    const fields = parseFieldsXml(rawFields, farmlandOwnership, pfData.scannedFarmlands, pfData.farmlandStats, career.settings);
    const environment = parseEnvironmentXml(rawEnv);
    const missions = parseMissionsXml(rawMissions);
    const vehicles = parseVehiclesXml(rawVehicles);
    const economy = parseEconomyXml(rawEconomy);
    const placeables = parsePlaceablesXml(rawPlaceables);

    const playerFields = fields.filter((f) => f.ownerFarmId > 0);

    console.log(
        `[XML] Parsed: farms=${farms.length} fields=${playerFields.length}/${fields.length} vehicles=${vehicles.length} missions=${missions.length} crops=${Object.keys(economy).length}`
    );

    return {
        career,
        farms,
        farmlandsArray: Array.from(farmlandOwnership.entries()).map(([id, farmId]) => ({ farmlandId: id, farmId })),
        farmlandOwnership,
        fields: playerFields,
        allFields: fields,
        environment,
        missions,
        vehicles,
        economy,
        placeables,
        pfData,
        savegameDir,
        collectedAt: new Date().toISOString(),
    };
}

module.exports = {
    collectXmlData,
    getSavegamePath,
    getSavegamePathAsync,
    SAVEGAME_XML_FILES,
    FTP_SAVEGAME_XML_DOWNLOAD_ORDER,
};
