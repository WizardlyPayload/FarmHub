/** Flattened livestock row used by the NEW APP livestock section. */

export interface AnimalGenetics {
  health?: number;
  metabolism?: number;
  fertility?: number;
  quality?: number;
  productivity?: number;
}

export interface LivestockAnimal {
  id: string | number;
  name?: string;
  husbandryName?: string;
  husbandryId?: string | number;
  huId?: string | number;
  ownerFarmId?: number;
  farmId?: number;
  age?: number;
  health?: number;
  weight?: number;
  gender?: string;
  subType?: string;
  type?: string;
  animalTypeName?: string;
  location?: string;
  locationType?: string;
  isLactating?: boolean;
  isPregnant?: boolean;
  isParent?: boolean;
  isCastrated?: boolean;
  genetics?: AnimalGenetics | null;
  productivity?: number | null;
  sellPrice?: number | null;
  uniqueId?: string | number | null;
  breed?: string | null;
  motherId?: string | number | null;
  fatherId?: string | number | null;
  impregnatedBy?: number | null;
  pregnancyDuration?: number | null;
  offspring?: string | number | null;
  monthsSinceLastBirth?: number;
  reproduction?: number;
  numAnimals?: number;
  clusterCount?: number;
  fitness?: number;
  riding?: number;
  dirt?: number;
  fillSummary?: string;
  __emptyPen?: boolean;
  __lodSynth?: boolean;
  __lodSynthEstimate?: boolean;
  __lodClusterAggregate?: boolean;
  __detailHydrated?: boolean;
  [key: string]: unknown;
}

export interface HusbandryPen {
  id?: string | number;
  buildingId?: string | number;
  name?: string;
  buildingName?: string;
  ownerFarmId?: number;
  farmId?: number;
  animalTypeName?: string;
  health?: number;
  animalCount?: number;
  numAnimals?: number;
  /** Engine getNumOfAnimals() — authoritative head count (esp. vs RL scaled clusters). */
  numOfAnimalsReported?: number;
  /** Fill/storage capacity from getCapacity() — often NOT animal slots. */
  capacity?: number;
  /** Engine getMaxNumOfAnimals() — display barn capacity. */
  maxAnimals?: number;
  lod?: string;
  __detailHydrated?: boolean;
  animals?: LivestockAnimal[];
  livestock?: LivestockAnimal[];
  animalList?: LivestockAnimal[];
  clusters?: LodCluster[];
  [key: string]: unknown;
}

export interface LodCluster {
  count?: number;
  subType?: string;
  animalType?: string;
  gender?: string;
  avgHealth?: number;
  avgWeight?: number;
  avgAgeMonths?: number;
  ageMonths?: number;
  ageDecile?: number;
  isLactating?: boolean;
  isPregnant?: boolean;
  avgGenFert?: number;
  avgGenProd?: number;
  avgGenHealth?: number;
  avgGenMetabolism?: number;
  avgGenQuality?: number;
}

export interface LodGlobalState {
  emitted: number;
  trimmed: number;
  capHit: boolean;
  cap: number;
}

export interface LivestockSummary {
  totalCount: number;
  lactatingCount: number;
  pregnantCount: number;
  avgHealth: number;
}

export type SummaryFilter = "all" | "lactating" | "pregnant" | "health";
export type LivestockFilterMode = "none" | "summary" | "advanced";

export interface AdvancedFilters {
  ageMin: number | null;
  ageMax: number | null;
  weightMin: number | null;
  weightMax: number | null;
  healthMin: number;
  healthMax: number;
  metabolismMin: number;
  metabolismMax: number;
  fertilityMin: number;
  fertilityMax: number;
  qualityMin: number;
  qualityMax: number;
  productivityMin: number;
  productivityMax: number;
  animalType: string | null;
}

export const DEFAULT_ADVANCED_FILTERS: AdvancedFilters = {
  ageMin: null,
  ageMax: null,
  weightMin: null,
  weightMax: null,
  healthMin: 0,
  healthMax: 100,
  metabolismMin: 0,
  metabolismMax: 200,
  fertilityMin: 0,
  fertilityMax: 200,
  qualityMin: 0,
  qualityMax: 200,
  productivityMin: 0,
  productivityMax: 200,
  animalType: null,
};

export interface AnimalValueBreakdown {
  baseValue: number;
  ageFactor: number;
  healthFactor: number;
  geneticsFactor: number;
  reproductionFactor: number;
  weightFactor: number;
  animalType: string;
  heads: number;
  perHead: number;
}

export interface AnimalValueInfo {
  value: number;
  breakdown: AnimalValueBreakdown;
}

export interface PenDetailAnimal {
  uniqueId?: string | number;
  id?: string | number;
  tag?: string | number;
  name?: string;
  subType?: string;
  type?: string;
  gender?: string;
  age?: number;
  ageInMonths?: number;
  weight?: number;
  health?: number;
  isPregnant?: boolean;
  isLactating?: boolean;
  isCastrated?: boolean;
  breed?: string;
  genetics?: AnimalGenetics | null;
  motherId?: string | number;
  fatherId?: string | number;
  dirt?: number;
  fitness?: number;
  productivity?: number;
  birthday?: unknown;
}

export interface PenDetailEnvelope {
  detail?: {
    animals?: PenDetailAnimal[];
    mode?: string;
  } | null;
  serverTimeSec?: number;
  animalMode?: string;
  idScheme?: string;
  dirtyAt?: number;
  cachedAt?: number;
  fromCache?: boolean;
}

export type ExportFormat = "csv" | "excel" | "pdf" | "print";
