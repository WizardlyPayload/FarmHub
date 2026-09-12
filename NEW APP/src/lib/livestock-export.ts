import type { LivestockAnimal } from "./livestock-types";
import {
  displayAnimalHealth,
  formatAnimalType,
  resolveAnimalLocationLabel,
  resolveAnimalSubTypeRaw,
  roundAgeMonths,
} from "./livestock-format";
import { calculateAnimalValue } from "./livestock-value";

export interface ExportRow {
  id: string;
  type: string;
  ageMonths: number;
  gender: string;
  health: number;
  weight: number;
  value: number;
  status: string;
  location: string;
  lactating: boolean;
  pregnant: boolean;
  heads: number;
}

function statusText(animal: LivestockAnimal): string {
  const parts: string[] = [];
  if (animal.__emptyPen) parts.push("Empty pen");
  if (animal.isPregnant) parts.push("Pregnant");
  if (animal.isLactating) parts.push("Lactating");
  if (animal.isParent) parts.push("Parent");
  if (animal.__lodClusterAggregate && Number(animal.clusterCount) > 0) {
    parts.push(`×${Number(animal.clusterCount)}`);
  }
  return parts.join("; ") || "Normal";
}

export function buildExportRows(animals: LivestockAnimal[]): ExportRow[] {
  return animals.map((animal) => {
    const heads =
      animal.__lodClusterAggregate && Number(animal.clusterCount) > 0
        ? Math.max(1, Math.floor(Number(animal.clusterCount)))
        : animal.__emptyPen
          ? 0
          : 1;
    return {
      id: animal.__emptyPen
        ? String(animal.husbandryId ?? animal.id ?? "")
        : String(animal.id ?? ""),
      type: animal.__emptyPen
        ? animal.fillSummary || "Empty pen"
        : formatAnimalType(resolveAnimalSubTypeRaw(animal) || "Unknown"),
      ageMonths: animal.__emptyPen ? 0 : roundAgeMonths(animal.age || 0),
      gender: animal.__emptyPen ? "" : String(animal.gender || ""),
      health: animal.__emptyPen ? 0 : Math.round(displayAnimalHealth(animal)),
      weight: animal.__emptyPen ? 0 : Number(animal.weight) || 0,
      value: calculateAnimalValue(animal).value,
      status: statusText(animal),
      location: resolveAnimalLocationLabel(animal),
      lactating: !!animal.isLactating,
      pregnant: !!animal.isPregnant,
      heads,
    };
  });
}

function csvEscape(value: string | number | boolean): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportRowsToCsv(rows: ExportRow[]): string {
  const headers = [
    "ID",
    "Type",
    "Age (months)",
    "Gender",
    "Health %",
    "Weight kg",
    "Value",
    "Status",
    "Location",
    "Lactating",
    "Pregnant",
    "Heads",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.type,
        r.ageMonths,
        r.gender,
        r.health,
        r.weight,
        r.value,
        r.status,
        r.location,
        r.lactating,
        r.pregnant,
        r.heads,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Lightweight Excel-compatible HTML workbook (opens in Excel without xlsx deps). */
export function exportRowsToExcelHtml(rows: ExportRow[]): string {
  const headers = [
    "ID",
    "Type",
    "Age (months)",
    "Gender",
    "Health %",
    "Weight kg",
    "Value",
    "Status",
    "Location",
    "Lactating",
    "Pregnant",
    "Heads",
  ];
  const th = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((r) => {
      const cells = [
        r.id,
        r.type,
        r.ageMonths,
        r.gender,
        r.health,
        r.weight,
        r.value,
        r.status,
        r.location,
        r.lactating,
        r.pregnant,
        r.heads,
      ]
        .map((c) => `<td>${escapeHtml(String(c))}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Livestock Export</title></head><body><table border="1"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function openPrintableReport(rows: ExportRow[], title: string): void {
  const html = exportRowsToExcelHtml(rows);
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.write(html.replace("<title>Livestock Export</title>", `<title>${escapeHtml(title)}</title>`));
  w.document.close();
  w.focus();
  try {
    w.print();
  } catch {
    /* ignore */
  }
}
