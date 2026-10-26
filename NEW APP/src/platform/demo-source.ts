/**
 * Recorded demo snapshots. Publication keeps a typed public projection per
 * section and a positive export generation. Visitors select only committed
 * generations. Imports stay relative so the Node publisher can load this file.
 */

export const DEMO_IDS = [
  "base",
  "precision-farming",
  "realistic-farming",
  "precision-companions",
] as const;

export type DemoId = (typeof DEMO_IDS)[number];

const MAX_NODES = 20000;
const MAX_DEPTH = 12;
const MAX_TEXT = 120;
const MAX_LIMITATIONS = 8;
const PRIVATE_PATH = /^[a-z]:[\\/]|^\/users\/|^\/home\/|^\\\\|[\\/]users[\\/]|^~[\\/]/i;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\/|^(file|data|javascript|mailto):/i;
const IPV4 = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PRIVATE_KEY = /host|user|pass(word|wd)?$|token|secret|credential|e?mail|steam|notes|path|filename|directory|^ip$|ipaddress|^servers?$|^auth/i;
const ID_TEXT = /^[A-Za-z0-9][A-Za-z0-9 _.:#-]{0,63}$/;
const FARM_KEY = /^(?:[1-9]|1[0-6])$/;
const DICT_KEY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const ID_KEYS = new Set(["id", "fieldId", "farmlandId", "farmId", "ownerFarmId", "fillTypeIndex", "fruitTypeIndex"]);

export type Rule =
  | { k: "text"; max?: number; empty?: boolean }
  | { k: "version" }
  | { k: "num" }
  | { k: "int" }
  | { k: "bool" }
  | { k: "id" }
  | { k: "nullable"; of: Rule }
  | { k: "oneOf"; of: readonly Rule[] }
  | { k: "obj"; fields: Record<string, Rule>; drop?: readonly string[]; farmName?: boolean; privateFarm?: boolean; requireFarmId?: boolean; saveScoped?: boolean; mixedFarm?: "wool" | "livestock" }
  | { k: "list"; of: Rule; max: number }
  | { k: "enumSet"; values: readonly string[] }
  | { k: "farms"; of: Rule }
  | { k: "dict"; of: Rule; max: number };

const text: Rule = { k: "text" };
const version: Rule = { k: "version" };
const emptyText: Rule = { k: "text", empty: true };
const num: Rule = { k: "num" };
const int: Rule = { k: "int" };
const bool: Rule = { k: "bool" };
const id: Rule = { k: "id" };
const opt = (of: Rule): Rule => ({ k: "nullable", of });
const obj = (fields: Record<string, Rule>, drop?: readonly string[]): Rule => ({ k: "obj", fields, drop });
const list = (of: Rule, max = 500): Rule => ({ k: "list", of, max });
const dict = (of: Rule, max = 256): Rule => ({ k: "dict", of, max });
const farms = (of: Rule): Rule => ({ k: "farms", of });

const LEVEL = obj({ value: opt(num), status: opt(text) });
const VEHICLE = obj({
  id,
  name: text,
  typeName: text,
  vehicleType: text,
  categoryName: text,
  category: text,
  type: text,
  brand: opt({ k: "oneOf", of: [text, obj({ title: text, name: text, label: text, displayName: text })] }),
  headingDeg: opt(num),
  ownerFarmId: opt(id),
  farmId: opt(id),
  ownerFarmIdPool: bool,
  propertyState: opt(text),
  isUsedEquipmentYardStock: bool,
  isMotorized: bool,
  engineOn: bool,
  speed: num,
  fuelLevel: num,
  fuelCapacity: num,
  fillLevels: dict(obj({ level: opt(num), capacity: opt(num) }), 32),
  operatingTime: num,
  position: opt(obj({ x: num, y: num, z: num })),
  attachedImplementsCount: int,
  storeName: opt(text),
  price: num,
  damage: opt(num),
  age: num,
  mileage: opt(obj({ enabled: bool, odoKm: opt(num), tripKm: opt(num) })),
  vehicleYears: opt(obj({
    enabled: bool,
    modelYear: opt(int),
    decadeId: opt(text),
    decadeLabel: opt(text),
    yearKnown: bool,
    reliability: opt(num),
    maintainability: opt(num),
    storeName: opt(text),
  })),
  ads: opt(obj({
    enabled: bool,
    condition: num,
    inspectedCondition: opt(num),
    serviceLevel: num,
    inspectedService: opt(num),
    intervalRatio: opt(num),
    inService: bool,
    state: opt(text),
    breakdownCount: int,
    realOperatingHours: opt(num),
    hoursSinceMaintenance: opt(num),
    maintenanceInterval: opt(num),
    maintainability: opt(num),
    ageMonths: opt(num),
    sellValue: opt(num),
    purchaseValue: opt(num),
    year: opt(int),
    reliability: opt(num),
    engineTemp: opt(num),
    lubricationLevel: opt(num),
    maintenanceSpend: opt(num),
  }, ["inspectionNotes"])),
}, ["filename", "configFileName", "xmlFilename", "storeImage", "uniqueId"]);

const FIELD = obj({
  id,
  name: text,
  fieldId: id,
  farmlandId: id,
  ownerFarmId: opt(id),
  farmId: opt(id),
  crop: text,
  hectares: num,
  fruitType: opt(text),
  fruitTypeIndex: int,
  growthState: int,
  maxGrowthState: int,
  growthStateName: opt(text),
  stateName: opt(text),
  growthLabel: opt(text),
  growthStatePercentage: num,
  harvestReady: bool,
  isHarvested: bool,
  isWithered: bool,
  isMulched: opt(bool),
  // The live FS25 collector exports the ground-type enum as a number; XML
  // fallback can supply its label as text. Both are public field state.
  groundType: opt({ k: "oneOf", of: [num, text] }),
  groundTypeName: opt(text),
  plowLevel: num,
  stubbleShredLevel: num,
  mulchLevel: num,
  grassRingStage: num,
  weedLevel: num,
  needsWeeding: bool,
  needsRolling: bool,
  needsLime: opt(bool),
  needsWork: bool,
  fertilizationLevel: opt(num),
  nitrogenLevel: opt(num),
  nitrogenText: opt(text),
  limeText: opt(text),
  phValue: opt(num),
  targetNitrogen: opt(num),
  targetPh: opt(num),
  isPrecisionFarming: bool,
  isScanned: opt(bool),
  soilReadState: opt(text),
  nitrogenReadState: opt(text),
  phReadState: opt(text),
  soilSampledAt: opt(num),
  nitrogenSampledAt: opt(num),
  phSampledAt: opt(num),
  baleCountOnField: int,
  hasLooseForage: bool,
  hasLooseGrassWindrow: bool,
  hasLooseHayWindrow: bool,
  hasLooseStraw: bool,
  baleableLooseLiters: num,
  windrowLiters: num,
  soilFertilizer: opt(obj({
    enabled: bool,
    reason: opt(text),
    nitrogen: LEVEL,
    phosphorus: LEVEL,
    potassium: LEVEL,
    ppm: opt(obj({ n: opt(num), p: opt(num), k: opt(num), nTarget: opt(num), pTarget: opt(num), kTarget: opt(num) })),
    pH: num,
    organicMatter: num,
    weedPressure: num,
    pestPressure: num,
    diseasePressure: opt(num),
    shownDiseasePressure: opt(num), activeDisease: opt(emptyText), diseaseDiscovered: bool,
    lastCrop: opt(text),
    lastCrop2: opt(text), lastCrop3: opt(text), rotationStatus: opt({ k: "oneOf", of: [text, num] }),
    rotationBonusDaysLeft: num, herbicideActive: bool, insecticideActive: bool, fungicideActive: bool,
    simDisabled: bool, simDisabledReason: opt(text), isMeadow: bool, pfConflict: bool,
    cropTargets: opt(obj({ N: obj({ opt: num }), P: obj({ opt: num }), K: obj({ opt: num }) })),
    targetDefaults: opt(obj({ nitrogen: num, phosphorus: num, potassium: num, pH: num, organicMatter: num })),
    growthFraction: opt(num), coverageFraction: opt(num), sessionCoverageFraction: opt(num),
    sessionLastProduct: opt(text), amendBurnRisk: bool, burnDaysLeft: num, daysSinceHarvest: opt(num),
    yieldEfficiency: opt(num),
    needsFertilization: bool,
    urgency: num,
    compaction: num,
    fieldArea: opt(num),
    treatmentPlan: list(obj({ key: text, label: text, text, priority: text, hasRates: bool }), 12),
  })),
  cropStress: opt(obj({
    enabled: bool,
    difficulty: opt(text),
    moisturePercent: opt(num),
    stressPercent: opt(num),
    critical: bool,
    irrigationActive: opt(bool),
    moistureOutlook: list(obj({ dayOffset: int, moisturePercent: num }), 14),
    alertHint: opt(text),
  })),
}, ["outline", "suggestions", "_clusterFieldIds", "_clusterFields", "_displayClusterId", "manualGroups"]);

const MARKET_CROP = obj({
  avgPrice: num,
  fillTypeIndex: int,
  locations: list(obj({ name: text, price: num }), 64),
});
const SELL_POINT = obj({
  name: text,
  isSpecialEvent: bool,
  prices: dict(obj({ price: num, multiplier: num, isSpecialEvent: bool, fillTypeIndex: int }), 128),
  position: opt(obj({ x: num, y: num, z: num })),
  x: num,
  z: num,
});
const ECONOMY = obj({
  marketPrices: obj({
    crops: dict(MARKET_CROP, 256),
    sellPoints: { k: "oneOf", of: [list(SELL_POINT, 128), dict(SELL_POINT, 128)] },
  }),
  money: num,
  balance: num,
  currency: text,
});
const FARM_INFO = list({ k: "obj", fields: { id: int, farmId: int, name: text, money: num, loan: num, color: int }, farmName: true }, 16);
const FINANCE = obj({
  buildings: obj({ totalValue: num }),
  animals: obj({ totalValue: num }),
  land: obj({ totalValue: num }),
});

// Frozen045 asset envelope,041 field/economy and042 production-path contracts.
// Each extension remains an explicit projection, never an arbitrary provider object.
const READ = {
  enabled: bool, readState: text, source: text, coverage: text,
  scope: text, farmId: opt(int), reason: opt(text), pinnedVersion: opt(version),
  units: dict(text, 24),
};
const FACTORY_IO = obj({
  fillType: opt(text), fillTypeIndex: opt(int), perCycleLiters: opt(num),
  monthlyLiters: opt(num), capacityLiters: opt(num), fillLevelLiters: opt(num),
  purchasePricePer1000: opt(num), theoreticalPeakPer1000: opt(num),
});
const MACHINE = { id, name: text, ownerFarmId: opt(int) };
const DISTRIBUTION_OVERRIDE = obj({ uniqueId: id, fillType: opt(text), mode: opt(int), modeKey: opt(text) });
const DISTRIBUTION_MOVEMENT = obj({ uniqueId: id, fillType: opt(text), distributedLiters: opt(num),
  soldLiters: opt(num), storedLiters: opt(num), receivedLiters: opt(num) });
const RESTRICTED_WINDOW = obj({ currentAllowed: bool, nextCalendarPeriod: int,
  nextUnconditionalPeriod: int, temperatureConditional: bool, reason: text });
const COMPANION = obj({
  enabled: bool,
  mods: list(obj({ id: text, title: text, category: text, version: opt(version), modName: opt(text), detected: bool }), 128),
  loans: obj({
    ...READ,
    loanCount: int,
    restAmount: num,
    loanInterest: opt(num),
    dynamicInterest: bool,
    byFarm: farms(obj({
      count: int,
      restAmount: num,
      monthlyAnnuity: opt(num),
      loans: list(obj({
        amount: num,
        restAmount: num,
        interest: opt(num),
        durationYears: num,
        restMonths: num,
        monthlyAnnuity: opt(num),
      }), 32),
    })),
  }),
  diesel: obj({ enabled: bool, source: text, pricePerLiter: opt(num), region: opt(text), country: opt(text),
    contributors: { k: "enumSet", values: ["realisticDieselPrice", "fluctuatingDieselPrice"] } }),
  restrictedPeriods: obj({ ...READ, liquidBan: opt(text), solidBan: opt(text), anyActive: bool, currentPeriod: opt(int),
    liquidWindow: RESTRICTED_WINDOW, solidWindow: RESTRICTED_WINDOW }),
  cropCalendar: obj({ ...READ, selectedRegion: opt(text), calendarsReadState: text,
    crops: list(obj({ crop: text, plantingPeriods: list(int, 12), harvestPeriods: list(int, 12), readState: text, source: text }), 256),
    weatherEnabled: bool, yieldEnabled: bool, strictSuitabilityEnabled: bool }),
  seasonalWool: obj({ ...READ, isShearingMonth: bool, lastProcessedMonth: opt(int),
    shearingCostPerSheep: opt(num), feeScope: text, trackedPens: opt(int), pensReadState: text }, ["totalWoolSheared"]),
  seasonalMilk: obj({ ...READ, seasonFactor: opt(num), period: opt(int), nextPeakPeriod: opt(int), cowsEnabled: bool }),
  yieldTracker: obj({ ...READ, rows: list(obj({ year: opt(int), fieldId: opt(int), crop: text, fillKey: opt(text), liters: opt(num) }), 200) }),
  realSilo: obj({
    ...READ,
    farmId: int,
    silos: list(obj({
      id, ownerFarmId: opt(int), name: text, compartments: opt(int), capacityEach: opt(num),
      activeSlot: opt(int), transferState: text,
      transfer: opt(obj({ fromSlot: opt(int), toSlot: opt(int), rate: opt(num), active: bool })),
      slots: list(obj({ index: opt(int), fillType: opt(int), fillLevel: opt(num), capacity: opt(num), isActive: bool }), 32),
    }), 64),
  }),
  economicHistory: obj({
    ...READ,
    current: opt(obj({ balance: opt(num), total: opt(num), loanBalance: opt(num) })),
    months: list(obj({ year: opt(int), period: opt(int), total: opt(num) }), 48),
  }),
  animalPlanner: obj({ ...READ, barns: list(obj({ name: text, numAnimals: opt(int), maxAnimals: opt(int) }), 64) }),
  farmReputation: obj({ ...READ, reputation: opt(num), missionLimit: opt(int), rewardBonus: opt(num) }),
  moistureSystem: obj({ ...READ, mapMoisture: opt(num), mapMoisturePercent: opt(num),
    storedGoods: obj({ ...READ, warnings: list(obj({ fillType: text, qualityPercent: opt(num), moisturePercent: opt(num), grade: opt(num) }), 256) }),
  }),
  distributionRedux: obj({ ...READ, mode: opt(int), modeKey: opt(text), radius: opt(num), bufferHours: opt(num), sellEnabled: bool,
    masterEnabled: bool, participation: opt(int), activity: text,
    farmAssets: obj({ ...READ,
      overrides: list(DISTRIBUTION_OVERRIDE, 256), lastCycle: list(DISTRIBUTION_MOVEMENT, 256),
      overridesReading: obj({ ...READ, rows: list(DISTRIBUTION_OVERRIDE, 256) }),
      history: obj({ ...READ, window: text, retained: bool, rows: list(DISTRIBUTION_MOVEMENT, 256) }),
    }),
  }),
  silageCompaction: obj({ ...READ, context: text, status: text, estimate: opt(text), line: text }),
  factoryProfitCalculator: obj({ ...READ, period: text, periodBasis: text,
    lines: list(obj({ pointId: opt(id), pointName: opt(text), recipeId: opt(id), recipeName: opt(text),
      readState: text, coverage: text,
      inputReading: obj({ ...READ, observedCount: int }), outputReading: obj({ ...READ, observedCount: int }),
      cyclesPerMonth: opt(num), upkeepPerMonth: opt(num), inputs: list(FACTORY_IO, 64), outputs: list(FACTORY_IO, 64),
    }), 256),
  }),
  farmOperations: obj({ ...READ, fields: list(obj({ farmlandId: opt(int), growthState: opt(int) }), 500) }),
  automaticLoanRepay: obj({ ...READ, minimumBalance: opt(num), repaymentHour: opt(num) }),
  livestockMonitor: obj({ ...READ, displayMode: text, refreshInterval: num, queuedAlerts: int,
    hasActiveAlert: bool, alertScope: text, alertCoverage: text }),
  productionWatcher: obj({ ...READ, productionPointCount: int, countSource: text, alertsReadable: bool }),
  outOfFuel: obj({ enabled: bool }), soilWorkYieldBonus: obj({ enabled: bool }), dynamicMarket: obj({ enabled: bool }),
  saveUnitProfiles: obj({ ...READ, moneyUnit: opt(int), moneyUnitName: opt(text), profileName: opt(text), hasApplied: bool, lastApplyOk: bool }),
  taskList: obj({ ...READ, tasks: list(obj({ id: text, detail: text, priority: opt(num) }), 256) }),
  productionSchedule: obj({ ...READ, recipes: list(obj({ pointKey: text, recipeId: text, status: opt(text) }), 256) }),
  animalFoodCalculator: obj({ ...READ, mode: opt(text), foodScale: opt(num), waterScale: opt(num),
    strawScale: opt(num), daysPerPeriod: opt(num), scalingEnabled: bool }),
  vipOrders: obj({ ...READ, orderCount: opt(int), currentOrder: opt(obj({ level: opt(num), items: int,
    remainingItems: int, payout: num, coverage: text })) }),
  advancedMaintenance: obj({ ...READ, machines: list(obj({ ...MACHINE, startBlocked: bool }), 500) }),
  extendedVehicleMaintenance: obj({ ...READ, machines: list(obj({ ...MACHINE, hoursPool: opt(num), serviceActive: bool,
    serviceRemainingMs: opt(num), failureType: opt(emptyText), failureSeverity: opt(num),
  }), 500) }),
  realisticVehicleService: obj({ ...READ, machines: list(obj({ ...MACHINE, condition: opt(num), serviceSoon: bool,
    warmupMs: opt(num), keyInserted: bool, immobilizerArmed: bool, faults: list(text, 64),
  }), 500) }),
  palletDegradation: obj({ ...READ, pallets: list(obj({ id, ownerFarmId: opt(int), condition: opt(num), tempDamage: opt(num),
    permDamage: opt(num), wear: opt(num), outside: bool, mirrored: bool,
  }), 500) }),
  betterContracts: obj({ enabled: bool, missionCount: int, lazyNPC: bool, hardMode: bool }),
  fieldLeases: obj({ ...READ, farmId: int, leases: list(obj({ farmlandId: opt(int), price: opt(num), duration: opt(num) }), 64) }),
  rentYourField: obj({ ...READ, agreements: list(obj({ farmlandId: opt(int), duration: opt(num) }), 128) }),
  farmlandMarketplace: obj({ ...READ, rows: list(obj({ kind: text, farmlandId: opt(int), price: opt(num) }), 128) }),
  fieldProfitabilityLedger: obj({ ...READ, cycles: list(obj({ cycleId: opt(text), farmId: int, land: opt(text), crop: opt(text), state: opt(text),
    area: opt(num), qualityClass: opt(text), totalsRead: text,
    totalsCoverage: text, totalsCount: int, totalsCountExact: bool, totalsScanned: int,
    totalsRejected: int, totalsTruncated: bool,
    totals: list(obj({ category: text, accountingClass: text, direction: opt(text), amount: num, unit: text }), 128),
  }), 128), sales: obj({ present: bool, reason: text }) }),
});

// Privacy belongs to the feature contract, never to an untrusted scope label.
// Unidentified private rows cannot be exposed just because a UI would hide them.
if (COMPANION.k === "obj") {
  for (const key of ["advancedMaintenance", "extendedVehicleMaintenance", "realisticVehicleService", "realSilo",
    "palletDegradation", "factoryProfitCalculator", "fieldLeases", "farmReputation", "rentYourField",
    "farmlandMarketplace", "fieldProfitabilityLedger", "yieldTracker", "silageCompaction", "farmOperations",
    "productionWatcher", "vipOrders", "taskList", "productionSchedule", "economicHistory", "animalPlanner"]) {
    const rule = COMPANION.fields[key];
    if (rule?.k === "obj") { rule.privateFarm = true; rule.saveScoped = key === "yieldTracker"; }
  }
  const wool = COMPANION.fields.seasonalWool;
  if (wool.k === "obj") wool.mixedFarm = "wool";
  const livestock = COMPANION.fields.livestockMonitor;
  if (livestock.k === "obj") livestock.mixedFarm = "livestock";
  const moisture = COMPANION.fields.moistureSystem;
  if (moisture.k === "obj" && moisture.fields.storedGoods.k === "obj") moisture.fields.storedGoods.privateFarm = true;
  const distribution = COMPANION.fields.distributionRedux;
  if (distribution.k === "obj" && distribution.fields.farmAssets.k === "obj") {
    const assets = distribution.fields.farmAssets;
    assets.privateFarm = true;
    for (const key of ["overridesReading", "history"]) {
      const rule = assets.fields[key];
      if (rule.k === "obj") rule.privateFarm = true;
    }
  }
}

const RF_STATUS = obj({
  soilFertilizer: obj({ enabled: bool, pfConflict: bool, fieldCount: int, reason: opt(text),
    modLoaded: bool, managerPresent: bool, systemPresent: bool, settingsEnabled: opt(bool) }),
  cropStress: obj({ enabled: bool, fieldCount: int, alertHint: opt(text) }),
  presence: obj({ enabled: bool, mods: list(obj({ id: text, title: text, version: opt(version), detected: bool }), 32) }),
});

const ANIMAL = obj({ id, name: text, gender: text, age: num, health: num, weight: num,
  subType: text, type: text, isPregnant: bool, isLactating: { k: "oneOf", of: [bool, text] }, isParent: bool,
  reproduction: num, genetics: obj({ productivity: num }), husbandryId: id, husbandryName: text,
  location: text, locationType: text, ownerFarmId: int, farmId: int, clusterCount: int,
  __emptyPen: bool, __lodClusterAggregate: bool, __lodSynth: bool, __lodSynthEstimate: bool, __detailHydrated: bool,
});
const PASTURE = obj({
  id,
  name: text,
  buildingName: text,
  ownerFarmId: opt(id),
  farmId: opt(id),
  animalType: text,
  animalCount: int,
  numAnimals: int,
  capacity: int,
  maxAnimals: int,
  health: num,
  productivity: num,
  foodData: dict(num, 32),
  storageData: dict(num, 32),
  productionData: dict(num, 32),
  type: text, animalTypeName: text, fillLevels: dict(num, 64),
  production: obj({ milk: opt(num), wool: opt(num), eggs: opt(num), manure: opt(num), slurry: opt(num) }),
  buildingId: id, numOfAnimalsReported: int, consumptionData: dict({ k: "oneOf", of: [num, bool] }),
  clusters: list(obj({ count: int }), 256), animals: list(ANIMAL, 500), livestock: list(ANIMAL, 500),
  animalList: list(ANIMAL, 500), aggregatedStorage: obj({ totalMilk: num }), calculatedMilkProduction: num,
});

const PROFILE_VALUES = { money: int, miles: bool, fahrenheit: bool, acre: bool, use24HourTime: bool };
const UNIT_DISPLAY = obj({
  british: bool,
  system: text,
  currency: text,
  distance: text,
  area: text,
  temperature: text,
  britishFillUnits: opt(obj({ present: bool, active: bool, settingsAvailable: bool, ownsFillUnits: bool, version })),
  imperial: opt(obj({ present: bool, settingsAvailable: bool, ownsFillUnits: bool, liquid: text, crops: text,
    weight: text, weightScale: text, measure: text })),
  unitConverter: opt(obj({ present: bool, settingsKnown: bool, settingsAvailable: bool, ownsFillUnits: bool,
    settings: obj({ volume: text, weight: text, distance: text, area: text, temperature: text }),
  })),
  saveUnitProfiles: opt(obj({ present: bool, active: bool, settingsAvailable: bool, ownsFillUnits: bool,
    profileName: text, ...PROFILE_VALUES, lastApplyOk: bool, hasApplied: bool, applyState: text, effective: obj(PROFILE_VALUES),
  })),
  mods: list(obj({ id: text, style: text }), 32),
});

const STOCK_LOCATION = obj({ name: text, kind: text, liters: num, moisturePct: opt(num), qualityPct: opt(num),
  grade: opt({ k: "oneOf", of: [text, num] }), ownerFarmId: opt(int), farmId: opt(int),
  compaction: opt(num), compactionPercent: opt(num), fermentation: opt(num), fermentationPercent: opt(num),
});
const STOCK = obj({ ...READ, fillTypeCatalog: dict(text), fillTypeTitles: dict(text),
  byFarm: farms(obj({ farmId: int, fillTypeCount: int, items: list(obj({
    fillType: text, fillTypeIndex: int, fillTypeDisplay: text, fillTypeTitle: text,
    totalLiters: num, bestSellPrice: opt(num), bestSellStation: opt(text),
    priceTrend: opt({ k: "oneOf", of: [text, num] }), greatDemand: bool,
    locations: { k: "oneOf", of: [list(STOCK_LOCATION, 256), dict(STOCK_LOCATION)] },
  }), 256) })),
});
const PRODUCTION_IO = obj({ fillType: text, recipeAmount: num });
const PRODUCTION_CHAIN = obj({ id, name: text, ownerFarmId: int, isActive: bool, isPublic: bool, isOwned: bool,
  inputFillLevels: dict(num), outputFillLevels: dict(num), productions: list(obj({ name: text, isActive: bool,
    status: text, cyclesPerHour: num, inputs: list(PRODUCTION_IO, 64), outputs: list(PRODUCTION_IO, 64),
  }), 128),
}, ["filename", "xmlFilename", "image", "uniqueId"]);

// Dedicated public construction demo: the live collector already limits these
// rows to the active farm, and the projection enforces that scope again. Other
// companion pages are deliberately absent until they have their own contract.
const CONSTRUCTION_MATERIAL = obj({
  fillType: opt(text), required: opt(num), delivered: opt(num), remaining: opt(num),
});
const CONSTRUCTION_PROJECT: Rule = { k: "obj", requireFarmId: true, fields: {
  id: opt(id), farmId: id, name: opt(text), mode: opt(text),
  phase: opt(int), phaseCount: opt(int), progress: opt(num),
  totalPrice: opt(num), totalPaid: opt(num), remainingCost: opt(num),
  x: opt(num), z: opt(num), materials: list(CONSTRUCTION_MATERIAL, 24),
} };
const CONSTRUCTION_PAGE = obj({
  key: text, detected: bool, readState: text, coverage: opt(text), reason: opt(text),
  sampledAt: opt(num), byFarm: farms(obj({
    siteCount: int, pausedCount: int, pendingMaterials: int, remainingCost: num,
  })),
  projects: list(CONSTRUCTION_PROJECT, 40),
});

/** Payload keys a recorded snapshot may carry, each with its public projection. */
const PAYLOAD_RULES: Record<string, Rule> = {
  activeFarmId: int,
  vehicles: { k: "oneOf", of: [list(VEHICLE, 500), dict(VEHICLE, 500)] },
  fields: list(FIELD, 500),
  economy: ECONOMY,
  money: num,
  farmInfo: FARM_INFO,
  finance: FINANCE,
  companionMods: COMPANION,
  companionPages: obj({ pages: obj({ everythingConstructable: CONSTRUCTION_PAGE }) }),
  realisticFarming: RF_STATUS,
  pastures: list(PASTURE, 200),
  animals: list(ANIMAL, 500),
  husbandries: list(PASTURE, 200),
  unitDisplay: UNIT_DISPLAY,
  stock: STOCK,
  production: obj({ chains: { k: "oneOf", of: [list(PRODUCTION_CHAIN, 256), dict(PRODUCTION_CHAIN)] } }),
  fillTypePhysics: dict(obj({ kg: num, liquid: bool })),
  fillTypeCatalog: dict(text), fillTypeTitles: dict(text), cropFillTypeIndex: dict(int),
};

/** Section id to the payload key(s) that populate it. */
export const FEATURE_ROUTES: Record<string, string> = {
  vehicles: "vehicles",
  fields: "fields",
  economy: "economy",
  pastures: "pastures",
  storage: "stock",
  productions: "production",
  "mod-everythingConstructable": "companionPages",
};

export function featureKeyForSection(section: string): string | null {
  return Object.prototype.hasOwnProperty.call(FEATURE_ROUTES, section) ? FEATURE_ROUTES[section] : null;
}

export type DemoPayload = Record<string, unknown>;

export type DemoGeneration = {
  id: string;
  demoId: DemoId;
  capturedAt: string;
  gameDate: string | null;
  mapTitle: string;
  limitations: string[];
  section: string;
  exportGeneration: number;
  schema: string | null;
  publicationSequence: number | null;
  payload: DemoPayload;
};

export type DemoLibrary = {
  pointer: string | null;
  pointers: Partial<Record<DemoId, string>>;
  generations: Record<string, DemoGeneration>;
};

export type DemoVisitor = {
  id: string;
  demoId: DemoId | null;
  generationId: string | null;
};

export type DemoVisitors = Record<string, DemoVisitor>;

let demoWritesLocked = false;

export function demoWritesAreLocked(): boolean {
  return demoWritesLocked;
}

export function setDemoWritesLocked(locked: boolean): void {
  demoWritesLocked = locked;
}

export function emptyDemoLibrary(): DemoLibrary {
  return { pointer: null, pointers: {}, generations: {} };
}

export function isDemoId(value: string): value is DemoId {
  return (DEMO_IDS as readonly string[]).includes(value);
}

export function safeGenerationId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}

function positiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 2147483647) return value;
  return null;
}

/** Public text: bounded, printable, and not a path, URL, address or e-mail. */
export function publicText(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const out = value.trim();
  if (!out || out.length > max) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(out)) return null;
  if (PRIVATE_PATH.test(out) || URL_SCHEME.test(out) || IPV4.test(out) || EMAIL.test(out)) return null;
  if (/%2e|%2f|%5c|\.\.[\\/]/i.test(out)) return null;
  return out;
}

type Walk = { nodes: number; strict: boolean; farmId: number | null };
type Projected = { ok: true; value: unknown } | { ok: false; error: string };

function project(rule: Rule, value: unknown, walk: Walk, depth: number): Projected {
  if (depth > MAX_DEPTH) return { ok: false, error: "payload-too-deep" };
  walk.nodes += 1;
  if (walk.nodes > MAX_NODES) return { ok: false, error: "payload-too-large" };
  switch (rule.k) {
    case "text": {
      if (rule.empty && value === "") return { ok: true, value: "" };
      const out = publicText(value, rule.max);
      return out == null ? { ok: false, error: "private-or-invalid-text" } : { ok: true, value: out };
    }
    case "version":
      return typeof value === "string" && /^[0-9]{1,4}(?:\.[0-9]{1,4}){1,3}(?:[-+][A-Za-z0-9.-]{1,32})?$/.test(value)
        ? { ok: true, value } : { ok: false, error: "invalid-version" };
    case "num":
      return typeof value === "number" && Number.isFinite(value) ? { ok: true, value } : { ok: false, error: "invalid-number" };
    case "int":
      return typeof value === "number" && Number.isInteger(value) && Math.abs(value) <= 2147483647
        ? { ok: true, value }
        : { ok: false, error: "invalid-integer" };
    case "bool":
      return typeof value === "boolean" ? { ok: true, value } : { ok: false, error: "invalid-boolean" };
    case "id": {
      if (typeof value === "number") {
        return Number.isInteger(value) && value >= 0 && value <= 2147483647
          ? { ok: true, value }
          : { ok: false, error: "invalid-id" };
      }
      const out = publicText(value, 64);
      return out != null && ID_TEXT.test(out) ? { ok: true, value: out } : { ok: false, error: "invalid-id" };
    }
    case "nullable":
      return value === null ? { ok: true, value: null } : project(rule.of, value, walk, depth);
    case "oneOf": {
      let last: Projected = { ok: false, error: "invalid-shape" };
      for (const option of rule.of) {
        const nodes = walk.nodes;
        last = project(option, value, walk, depth);
        if (last.ok) return last;
        walk.nodes = nodes;
      }
      return last;
    }
    case "list": {
      // The production Lua serializer emits {} for an empty table. Accept that
      // input only at publication; persisted public JSON is always canonical [].
      if (!walk.strict && value && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).length === 0) value = [];
      if (!Array.isArray(value)) return { ok: false, error: "invalid-list" };
      if (value.length > rule.max) return { ok: false, error: "payload-too-large" };
      const out: unknown[] = [];
      for (const item of value) {
        const row = project(rule.of, item, walk, depth + 1);
        if (!row.ok) return row;
        if (row.value !== undefined) out.push(row.value);
      }
      return { ok: true, value: out };
    }
    case "enumSet": {
      // Only listed ids are public; output is de-duplicated in the rule's order. The rejected value is never echoed.
      if (!walk.strict && value && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).length === 0) value = [];
      if (!Array.isArray(value)) return { ok: false, error: "invalid-list" };
      const items: unknown[] = value;
      if (items.length > rule.values.length) return { ok: false, error: "payload-too-large" };
      walk.nodes += items.length;
      if (walk.nodes > MAX_NODES) return { ok: false, error: "payload-too-large" };
      if (items.some((item) => typeof item !== "string" || !rule.values.includes(item))) {
        return { ok: false, error: "invalid-id" };
      }
      return { ok: true, value: rule.values.filter((item) => items.includes(item)) };
    }
    case "farms":
    case "dict": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "invalid-record" };
      const keys = Object.keys(value as object);
      if (rule.k === "dict" && keys.length > rule.max) return { ok: false, error: "payload-too-large" };
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        const allowed = rule.k === "farms" ? FARM_KEY.test(key) : DICT_KEY.test(key) && publicText(key, 64) != null;
        if (!allowed) return { ok: false, error: "invalid-record-key" };
        if (rule.k === "farms" && Number(key) !== walk.farmId) continue;
        const row = project(rule.of, (value as Record<string, unknown>)[key], walk, depth + 1);
        if (!row.ok) return row;
        if (row.value !== undefined) out[rule.k === "farms" ? "1" : key] = row.value;
      }
      return { ok: true, value: out };
    }
    case "obj": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "invalid-object" };
      let record = value as Record<string, unknown>;
      if (rule.requireFarmId && (typeof record.farmId !== "number" || !Number.isInteger(record.farmId)
        || record.farmId < 1 || record.farmId > 16)) return { ok: false, error: "missing-farm" };
      for (const key of Object.keys(record)) {
        if (!Object.prototype.hasOwnProperty.call(rule.fields, key) && PRIVATE_KEY.test(key)
          && (walk.strict || !rule.drop?.includes(key))) return { ok: false, error: "private-field" };
      }
      const saveScoped = rule.saveScoped && record.scope === "save" && record.farmId == null;
      if (rule.privateFarm && !saveScoped && (walk.farmId == null || record.farmId !== walk.farmId)) {
        return { ok: true, value: {
          enabled: record.enabled === true, scope: "farm", readState: "unavailable",
          coverage: "unsupported", reason: record.farmId != null || record.reason === "other-farm" ? "other-farm" : "no-farm",
        } };
      }
      // These providers mix global settings with private counters. Keep only the
      // explicitly shared observations when the private owner is not selected.
      if (rule.mixedFarm && (walk.farmId == null || record.farmId !== walk.farmId)) {
        record = { ...record };
        delete record.farmId;
        if (rule.mixedFarm === "wool") {
          delete record.trackedPens; delete record.pensReadState; delete record.coverage;
          if (record.scope !== "map" && record.scope !== "global") {
            delete record.isShearingMonth; delete record.lastProcessedMonth;
          }
          if (record.feeScope !== "map") delete record.shearingCostPerSheep;
        } else {
          delete record.queuedAlerts; delete record.hasActiveAlert;
          delete record.alertScope; delete record.alertCoverage;
        }
      }
      // Only explicitly identified readings can be mapped to the demo farm.
      // Missing ids remain missing so the real selectors continue to fail closed.
      const ownedId = rule.farmName ? record.id ?? record.farmId : record.ownerFarmId ?? record.farmId;
      if (ownedId != null && ownedId !== walk.farmId) {
        if (rule.fields.readState) return { ok: true, value: {
          enabled: record.enabled === true, scope: "farm", readState: "unavailable",
          coverage: "unsupported", reason: "other-farm",
        } };
        return { ok: true, value: undefined };
      }
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(record)) {
        const fieldRule = Object.prototype.hasOwnProperty.call(rule.fields, key) ? rule.fields[key] : undefined;
        if (!fieldRule) {
          if (!walk.strict && rule.drop?.includes(key)) continue;
          if (PRIVATE_KEY.test(key)) return { ok: false, error: "private-field" };
          if (walk.strict) return { ok: false, error: "unknown-field" };
          continue;
        }
        if (record[key] === undefined) continue;
        const farmKey = key === "farmId" || key === "ownerFarmId" || (rule.farmName && key === "id");
        const row = project(fieldRule, farmKey && record[key] === walk.farmId ? 1 : record[key], walk, depth + 1);
        if (!row.ok) return row;
        if (row.value !== undefined) out[key] = row.value;
      }
      if (rule.farmName && typeof out.id === "number") out.name = `Farm ${out.id}`;
      else if (rule.farmName && out.farmId === 1) { out.id = 1; out.name = "Farm 1"; }
      else if (rule.farmName) delete out.name;
      if (rule.fields.byFarm && rule.fields.loanCount) {
        const selected = (out.byFarm as Record<string, Record<string, unknown>> | undefined)?.["1"];
        delete out.loanCount; delete out.restAmount;
        if (selected?.count != null) out.loanCount = selected.count;
        if (selected?.restAmount != null) out.restAmount = selected.restAmount;
      }
      return { ok: true, value: out };
    }
    default: {
      const unhandled: never = rule;
      return { ok: false, error: `unhandled-rule-${String(unhandled)}` };
    }
  }
}

/** A section counts only when it carries a reading, not just labels. */
function hasReading(value: unknown, key: string | null, depth: number): boolean {
  if (depth > MAX_DEPTH) return false;
  if (typeof value === "number") return key == null || !ID_KEYS.has(key);
  if (typeof value === "boolean") return key !== "enabled" && key !== "detected";
  if (Array.isArray(value)) return value.some((item) => hasReading(item, null, depth + 1));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([k, v]) => hasReading(v, k, depth + 1));
  }
  return false;
}

export function sectionHasFeature(payload: DemoPayload, section: string): boolean {
  if (section === "mod-everythingConstructable") {
    const page = (payload.companionPages as { pages?: { everythingConstructable?: {
      key?: unknown; detected?: unknown; readState?: unknown; projects?: unknown;
    } } } | undefined)?.pages?.everythingConstructable;
    return page?.key === "everythingConstructable" && page.detected === true
      && (page.readState === "ok" || page.readState === "partial")
      && Array.isArray(page.projects) && hasReading(page.projects, null, 0);
  }
  const key = featureKeyForSection(section) ?? (Object.values(FEATURE_ROUTES).includes(section) ? section : null);
  if (!key) return false;
  const data = section === "pastures" && !payload[key] ? payload.animals : payload[key];
  if (Array.isArray(data) && data.length === 0) return false;
  if (!data || typeof data !== "object") return false;
  if (!Array.isArray(data) && Object.keys(data as object).length === 0) return false;
  return hasReading(data, null, 0);
}

export function publicPayload(
  payload: unknown,
  strict = false,
): { ok: true; payload: DemoPayload } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, error: "bootstrap" };
  const input = payload as Record<string, unknown>;
  if (input.dataSource !== "recorded-demo") return { ok: false, error: "bootstrap" };
  const farmRows = Array.isArray(input.farmInfo) ? input.farmInfo as Array<{ id?: unknown; farmId?: unknown }> : [];
  let selected = input.activeFarmId ?? input.farmId ?? (farmRows.length === 1 ? farmRows[0]?.id ?? farmRows[0]?.farmId : null);
  if (selected == null && farmRows.length === 0) {
    // Legacy043 fleet-only captures have no roster. An unambiguous native
    // owner is sufficient; never infer private-reading ownership from a block.
    const fleet = input.vehicles && typeof input.vehicles === "object" ? Object.values(input.vehicles) : [];
    const owners = new Set(fleet.map((row: unknown) => row && typeof row === "object"
      ? (row as { ownerFarmId?: unknown; farmId?: unknown }).ownerFarmId ?? (row as { farmId?: unknown }).farmId : null)
      .filter((owner): owner is number => typeof owner === "number" && Number.isInteger(owner) && owner > 0));
    if (owners.size === 1) selected = [...owners][0];
    else if (owners.size > 1) return { ok: false, error: "missing-farm" };
  }
  if (selected != null && (typeof selected !== "number" || !Number.isInteger(selected) || selected < 1 || selected > 16)) {
    return { ok: false, error: "invalid-farm" };
  }
  if (farmRows.length > 1 && selected == null) return { ok: false, error: "missing-farm" };
  const walk: Walk = { nodes: 1, strict, farmId: selected as number | null };
  const projected: DemoPayload = { dataSource: "recorded-demo", ...(selected == null ? {} : { activeFarmId: 1 }) };
  for (const key of Object.keys(input)) {
    if (key === "dataSource" || key === "activeFarmId" || input[key] === undefined) continue;
    const rule = PAYLOAD_RULES[key];
    if (!rule) {
      if (PRIVATE_KEY.test(key)) return { ok: false, error: "private-field" };
      if (strict) return { ok: false, error: "unknown-field" };
      continue;
    }
    const row = project(rule, input[key], walk, 1);
    if (!row.ok) return { ok: false, error: row.error };
    if (row.value !== undefined) projected[key] = row.value;
  }
  return { ok: true, payload: JSON.parse(JSON.stringify(projected)) as DemoPayload };
}

const CANDIDATE_KEYS = new Set([
  "id", "demoId", "capturedAt", "gameDate", "mapTitle", "limitations", "section",
  "exportGeneration", "schema", "publicationSequence", "payload", "assets",
]);

function canonicalInstant(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const at = Date.parse(value);
  if (Number.isNaN(at) || new Date(at).toISOString() !== value) return null;
  return value;
}

function labelText(value: unknown, max: number): string | null {
  const out = publicText(value, max);
  if (out == null || !/^[\p{L}\p{N}][\p{L}\p{N} ,.'&()!-]*$/u.test(out)) return null;
  return out;
}

export function publishDemoGeneration(
  library: DemoLibrary,
  candidate: DemoGeneration,
  options?: { strict?: boolean },
): { ok: true; library: DemoLibrary } | { ok: false; library: DemoLibrary; error: string } {
  const strict = options?.strict === true;
  if (!candidate || typeof candidate !== "object") return { ok: false, library, error: "missing-generation" };
  if (!safeGenerationId(candidate.id)) return { ok: false, library, error: "missing-generation" };
  if (library.generations[candidate.id]) return { ok: false, library, error: "duplicate-generation" };
  for (const key of Object.keys(candidate)) {
    if (!CANDIDATE_KEYS.has(key) || (strict && key === "assets")) return { ok: false, library, error: "unknown-field" };
  }
  if (typeof candidate.demoId !== "string" || !isDemoId(candidate.demoId)) {
    return { ok: false, library, error: "unknown-demo" };
  }
  const capturedAt = canonicalInstant(candidate.capturedAt);
  const mapTitle = labelText(candidate.mapTitle, 80);
  if (!capturedAt || !mapTitle) return { ok: false, library, error: "incomplete-label" };
  let gameDate: string | null = null;
  if (candidate.gameDate != null) {
    gameDate = labelText(candidate.gameDate, 40);
    if (!gameDate) return { ok: false, library, error: "invalid-metadata" };
  }
  const rawLimits = candidate.limitations ?? [];
  if (!Array.isArray(rawLimits) || rawLimits.length > MAX_LIMITATIONS) return { ok: false, library, error: "invalid-metadata" };
  const limitations: string[] = [];
  for (const item of rawLimits) {
    const note = publicText(item, 160);
    if (!note) return { ok: false, library, error: "invalid-metadata" };
    limitations.push(note);
  }
  if (typeof candidate.section !== "string" || !featureKeyForSection(candidate.section)) {
    return { ok: false, library, error: "unknown-section" };
  }
  const exportGeneration = positiveInt((candidate as { exportGeneration?: unknown }).exportGeneration);
  if (exportGeneration == null) return { ok: false, library, error: "uncommitted" };
  const schema = (candidate as { schema?: unknown }).schema;
  if (schema != null && (typeof schema !== "string" || !/^[0-9]{1,4}$/.test(schema))) {
    return { ok: false, library, error: "uncommitted" };
  }
  const sequenceRaw = (candidate as { publicationSequence?: unknown }).publicationSequence;
  const publicationSequence = sequenceRaw == null ? null : positiveInt(sequenceRaw);
  if (sequenceRaw != null && publicationSequence == null) return { ok: false, library, error: "uncommitted" };
  const projected = publicPayload(candidate.payload, strict);
  if (!projected.ok) return { ok: false, library, error: projected.error };
  if (!sectionHasFeature(projected.payload, candidate.section)) {
    return { ok: false, library, error: "empty-section" };
  }
  const stored: DemoGeneration = {
    id: candidate.id,
    demoId: candidate.demoId,
    capturedAt,
    gameDate,
    mapTitle,
    limitations,
    section: candidate.section,
    exportGeneration,
    schema: (schema as string | null | undefined) ?? null,
    publicationSequence,
    payload: projected.payload,
  };
  return {
    ok: true,
    library: {
      pointer: stored.id,
      pointers: { ...(library.pointers || {}), [stored.demoId]: stored.id },
      generations: { ...library.generations, [stored.id]: stored },
    },
  };
}

function generationForDemo(library: DemoLibrary, demoId: DemoId): DemoGeneration | undefined {
  const pinned = library.pointers?.[demoId];
  if (!pinned) return undefined;
  const row = library.generations[pinned];
  if (!row || row.demoId !== demoId || row.exportGeneration < 1) return undefined;
  return row;
}

export function selectRecordedDemo(
  visitors: DemoVisitors,
  visitorId: string,
  demoId: string,
  library: DemoLibrary,
): { ok: true; visitors: DemoVisitors; generation: DemoGeneration } | { ok: false; visitors: DemoVisitors; error: string } {
  if (!isDemoId(demoId)) {
    return { ok: false, visitors, error: "unknown-demo" };
  }
  const generation = generationForDemo(library, demoId);
  if (!generation) return { ok: false, visitors, error: "missing-generation" };
  return {
    ok: true,
    visitors: {
      ...visitors,
      [visitorId]: { id: visitorId, demoId, generationId: generation.id },
    },
    generation,
  };
}

export function loadRecordedDemo(input: {
  visitors: DemoVisitors;
  visitorId: string;
  demoId: string;
  library: DemoLibrary;
  apply: (payload: DemoPayload, section: string, capturedAt: string) => void;
}): { ok: true; visitors: DemoVisitors } | { ok: false; visitors: DemoVisitors; error: string } {
  const selected = selectRecordedDemo(input.visitors, input.visitorId, input.demoId, input.library);
  if (!selected.ok) return selected;
  setDemoWritesLocked(true);
  input.apply(selected.generation.payload, selected.generation.section, selected.generation.capturedAt);
  return { ok: true, visitors: selected.visitors };
}

export function denyDemoMutation(action: string): { ok: false; error: "demo-read-only"; action: string } {
  return { ok: false, error: "demo-read-only", action };
}
