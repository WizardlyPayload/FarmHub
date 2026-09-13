export interface MoistureStockLocation {
  liters?: number;
  moisturePct?: number;
  grade?: string | number;
}

export interface GradeVolumeShare {
  grade: string | number;
  liters: number;
  percent: number;
}

export interface StockMoistureSummary {
  moisturePct: number | null;
  moistureLiters: number;
  grades: GradeVolumeShare[];
  gradeLiters: number;
}

function finiteNonNegative(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizedGrade(value: unknown): string | number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value).trim();
  return text ? text.toUpperCase() : null;
}

/**
 * Summarizes only locations carrying Moisture System data.
 * Liters are the batch weight, so separate silos/grades are not averaged equally.
 */
export function summarizeStockMoisture(
  locations: MoistureStockLocation[] | null | undefined,
): StockMoistureSummary | null {
  if (!Array.isArray(locations) || locations.length === 0) return null;

  let moistureWeighted = 0;
  let moistureLiters = 0;
  let gradeLiters = 0;
  const gradeVolumes = new Map<string, { grade: string | number; liters: number }>();

  for (const location of locations) {
    const liters = finiteNonNegative(location?.liters);
    if (liters == null || liters <= 0) continue;

    const moisture = finiteNonNegative(location?.moisturePct);
    if (moisture != null) {
      moistureWeighted += moisture * liters;
      moistureLiters += liters;
    }

    const grade = normalizedGrade(location?.grade);
    if (grade != null) {
      const key = String(grade).toUpperCase();
      const current = gradeVolumes.get(key);
      if (current) current.liters += liters;
      else gradeVolumes.set(key, { grade, liters });
      gradeLiters += liters;
    }
  }

  if (moistureLiters <= 0 && gradeLiters <= 0) return null;

  const grades = [...gradeVolumes.values()]
    .sort((a, b) => b.liters - a.liters || String(a.grade).localeCompare(String(b.grade)))
    .map(({ grade, liters }) => ({
      grade,
      liters,
      percent: gradeLiters > 0 ? (liters / gradeLiters) * 100 : 0,
    }));

  return {
    moisturePct: moistureLiters > 0 ? moistureWeighted / moistureLiters : null,
    moistureLiters,
    grades,
    gradeLiters,
  };
}
