/** Shared pasture domain types for NEW APP pastures section */

export interface PastureAnimal {
  id?: string | number;
  name?: string;
  gender?: string;
  age?: number;
  health?: number;
  weight?: number;
  subType?: string;
  type?: string;
  isPregnant?: boolean;
  isLactating?: boolean | string;
  isParent?: boolean;
  reproduction?: number;
  genetics?: { productivity?: number };
  husbandryId?: string | number;
  husbandryName?: string;
  location?: string;
  locationType?: string;
  ownerFarmId?: number;
  farmId?: number;
  clusterCount?: number;
  __emptyPen?: boolean;
  __lodClusterAggregate?: boolean;
  __lodSynth?: boolean;
  __lodSynthEstimate?: boolean;
  __detailHydrated?: boolean;
  fillSummary?: string;
  [key: string]: unknown;
}

export interface ConditionReport {
  productivity: number | string;
  milk: number;
  straw: number;
  manure: number;
  slurry: number;
  pallets: number;
  eggs: number;
  wool: number;
  water: number;
  food: number;
  hasRealData: boolean;
}

export interface MilkProductionData {
  lactatingCows: number;
  hourlyProduction: number;
  estimatedStorage: number;
  avgProductivity: number;
}

export interface FoodReport {
  totalCapacity: number;
  availableFood?: number;
  totalMixedRation: number;
  hay: number;
  silage: number;
  grass: number;
  forage?: number;
  food: number;
  water: number;
  waterCapacity?: number;
  straw?: number;
  strawCapacity?: number;
  liquidManure?: number;
  liquidManureCapacity?: number;
  milk?: number;
  manure?: number;
  MANURE?: number;
  SLURRY?: number;
  LIQUIDMANURE?: number;
  meadow?: number;
  milkRate?: number;
  liquidManureRate?: number;
  hasRealData: boolean;
  hasAggregatedData?: boolean;
  aggregatedInfo?: unknown;
  durationDays?: { food: number | null; water: number | null; straw: number | null };
  durationEstimated?: boolean;
  consumptionPerDay?: { food: number; water: number; straw: number };
}

export interface PastureWarning {
  type: string;
  subtype?: string;
  severity: "info" | "warning" | "danger";
  message: string;
  icon: string;
  affectedAnimals?: PastureAnimal[];
  details?: Record<string, unknown>;
}

export interface HusbandryRow {
  id?: string | number;
  buildingId?: string | number;
  name?: string;
  buildingName?: string;
  ownerFarmId?: number;
  farmId?: number;
  animalCount?: number;
  numAnimals?: number;
  numOfAnimalsReported?: number;
  health?: number;
  capacity?: number;
  maxAnimals?: number;
  productivity?: number;
  productionData?: Record<string, number>;
  consumptionData?: Record<string, number | boolean>;
  storageData?: Record<string, number>;
  fillLevels?: Record<string, number | string>;
  foodData?: Record<string, number>;
  clusters?: Array<{ count?: number }>;
  animals?: PastureAnimal[];
  livestock?: PastureAnimal[];
  animalList?: PastureAnimal[];
  aggregatedStorage?: { totalMilk?: number };
  __detailHydrated?: boolean;
  calculatedMilkProduction?: number;
  [key: string]: unknown;
}

export interface Pasture {
  id: string | number;
  name: string;
  animals: PastureAnimal[];
  animalCount: number;
  maleCount: number;
  femaleCount: number;
  unknownSexCount?: number;
  avgHealth: number;
  /** False when no measured heads contributed (missing is not 0%). */
  avgHealthKnown?: boolean;
  conditionReport: ConditionReport;
  foodReport: FoodReport;
  milkProductionData: MilkProductionData;
  allWarnings: PastureWarning[];
  farmId: string | number;
  capacity: number;
  husbandryData?: HusbandryRow | null;
  isEmptyPasture?: boolean;
  filename?: string;
  milkValue?: number;
}
