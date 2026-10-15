import { Badge, Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModAbout,
  ModBar,
  ModEmpty,
  ModKeyValues,
  ModPage,
  ModStatTiles,
  ModTable,
  asList,
  formatNumber,
  formatPercent,
  num,
  useCompanionPage,
  yesNo,
  type CompanionPageProps,
  type ModStatTile,
} from "@/sections/mods/shared";

type SlotRow = {
  index?: number;
  fillType?: string;
  title?: string;
  fillLevel?: number;
  capacity?: number;
  isActive?: boolean;
  isExtension?: boolean;
  moisture?: number;
  quality?: number;
};

type SiloRow = {
  farmId?: number;
  id?: string;
  name?: string;
  placeableName?: string;
  configured?: boolean;
  hasDryer?: boolean;
  compartments?: number;
  capacityPerCompartment?: number;
  activeSlot?: number;
  transfer?: { fromSlot?: number; toSlot?: number; rate?: number } | null;
  dryingTransfer?: boolean;
  fill?: number;
  capacity?: number;
  slotsTruncated?: boolean;
  slots?: SlotRow[];
};

type FillTypeRow = { fillType?: string; title?: string; liters?: number; compartments?: number };

function liters(value: unknown): string {
  return tOr("companionPage.realSilo.liters", "{{value}} L", { value: formatNumber(value, 0) });
}

function ratio(fill: unknown, capacity: unknown): number | null {
  const f = num(fill);
  const c = num(capacity);
  return f == null || c == null || c <= 0 ? null : f / c;
}

/** RealSilo's own grade letters (realSiloMoistureCompat): A ≥ 90, B ≥ 70, C ≥ 50, else D. */
function grade(quality: unknown): string {
  const q = num(quality);
  if (q == null) return "—";
  return q >= 90 ? "A" : q >= 70 ? "B" : q >= 50 ? "C" : "D";
}

function SiloCard({ silo }: { silo: SiloRow }) {
  const slots = asList<SlotRow>(silo.slots);
  const title = silo.name || silo.placeableName || tOr("companionPage.realSilo.unnamed", "Silo");
  const transfer = silo.transfer && typeof silo.transfer === "object" ? silo.transfer : null;
  return (
    <Card title={title}>
      {silo.configured ? null : (
        <p class="fd-economy__muted">
          {tOr("companionPage.realSilo.unconfiguredNote", "Not set up yet: open the silo in game to choose its compartments.")}
        </p>
      )}
      <ModKeyValues
        rows={[
          { key: "compartments", label: tOr("companionPage.realSilo.kvCompartments", "Compartments"), value: formatNumber(silo.compartments, 0) },
          { key: "perCompartment", label: tOr("companionPage.realSilo.kvPerCompartment", "Per compartment"), value: liters(silo.capacityPerCompartment) },
          {
            key: "fill",
            label: tOr("companionPage.realSilo.kvFill", "Filled"),
            value: tOr("companionPage.realSilo.fillOf", "{{fill}} of {{capacity}}", { fill: liters(silo.fill), capacity: liters(silo.capacity) }),
          },
          { key: "dryer", label: tOr("companionPage.realSilo.kvDryer", "Dryer"), value: yesNo(silo.hasDryer) },
          {
            key: "transfer",
            label: tOr("companionPage.realSilo.kvTransfer", "Transfer"),
            value: transfer
              ? tOr("companionPage.realSilo.transferText", "Compartment {{from}} → {{to}}", {
                  from: formatNumber(transfer.fromSlot, 0),
                  to: formatNumber(transfer.toSlot, 0),
                })
              : tOr("companionPage.realSilo.transferNone", "None running"),
          },
        ]}
      />
      <ModTable
        columns={[
          { key: "index", label: tOr("companionPage.realSilo.colCompartment", "#"), align: "end" },
          { key: "fill", label: tOr("companionPage.realSilo.colContents", "Contents") },
          { key: "level", label: tOr("companionPage.realSilo.colLevel", "Stored"), align: "end" },
          { key: "bar", label: tOr("companionPage.realSilo.colBar", "Fill") },
          { key: "moisture", label: tOr("companionPage.realSilo.colMoisture", "Moisture"), align: "end" },
          { key: "grade", label: tOr("companionPage.realSilo.colGrade", "Grade"), align: "center" },
        ]}
        rows={slots.map((slot, i) => {
          const r = ratio(slot.fillLevel, slot.capacity);
          return {
            key: String(slot.index ?? i + 1),
            tone: r != null && r >= 0.995 ? "warn" : undefined,
            cells: {
              index: formatNumber(slot.index, 0),
              fill: (
                <>
                  {slot.title || slot.fillType || tOr("companionPage.realSilo.empty", "Empty")}
                  {slot.isActive ? <Badge tone="accent">{tOr("companionPage.realSilo.active", "Receiving")}</Badge> : null}
                  {slot.isExtension ? <Badge>{tOr("companionPage.realSilo.extension", "Extension")}</Badge> : null}
                </>
              ),
              level: tOr("companionPage.realSilo.fillOf", "{{fill}} of {{capacity}}", {
                fill: liters(slot.fillLevel),
                capacity: liters(slot.capacity),
              }),
              bar: <ModBar ratio={r ?? 0} tone={r != null && r >= 0.995 ? "warn" : undefined} />,
              moisture: formatPercent(slot.moisture, { ratio: true, dp: 1 }),
              grade: grade(slot.quality),
            },
          };
        })}
        empty={tOr("companionPage.realSilo.noSlots", "No compartment data for this silo yet.")}
      />
      {silo.slotsTruncated ? <ModEmpty>{tOr("companionPage.realSilo.slotsTruncated", "Only the first compartments are listed.")}</ModEmpty> : null}
    </Card>
  );
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const silos = asList<SiloRow>(page?.silos).filter((s) => num(s.farmId) === farmId);
  const byFillType = asList<FillTypeRow>(farmData?.byFillType);
  const defaults = (page?.defaults && typeof page.defaults === "object" ? page.defaults : null) as Record<string, unknown> | null;
  const tiles: ModStatTile[] = farmData
    ? [
        { key: "silos", label: tOr("companionPage.realSilo.statSilos", "Silos"), value: formatNumber(farmData.siloCount, 0) },
        {
          key: "compartments",
          label: tOr("companionPage.realSilo.statCompartments", "Compartments in use"),
          value: tOr("companionPage.realSilo.usedOf", "{{used}} / {{total}}", {
            used: formatNumber(farmData.usedCompartments, 0),
            total: formatNumber(farmData.compartments, 0),
          }),
          hint:
            (num(farmData.extensionCompartments) ?? 0) > 0
              ? tOr("companionPage.realSilo.statExtensionHint", "{{count}} from extensions", { count: formatNumber(farmData.extensionCompartments, 0) })
              : null,
        },
        {
          key: "fill",
          label: tOr("companionPage.realSilo.statFill", "Stored"),
          value: liters(farmData.totalFill),
          hint: tOr("companionPage.realSilo.statFillHint", "of {{capacity}} ({{pct}})", {
            capacity: liters(farmData.totalCapacity),
            pct: formatPercent(ratio(farmData.totalFill, farmData.totalCapacity), { ratio: true, dp: 0 }),
          }),
        },
        { key: "transfers", label: tOr("companionPage.realSilo.statTransfers", "Transfers running"), value: formatNumber(farmData.activeTransfers, 0) },
        { key: "drying", label: tOr("companionPage.realSilo.statDrying", "Drying transfers"), value: formatNumber(farmData.dryingTransfers, 0) },
        {
          key: "unconfigured",
          label: tOr("companionPage.realSilo.statUnconfigured", "Silos not set up"),
          value: formatNumber(farmData.unconfigured, 0),
          tone: (num(farmData.unconfigured) ?? 0) > 0 ? "warn" : undefined,
        },
      ]
    : [];

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.realSilo.lead",
        "RealSilo splits each silo into compartments, so different crops never mix. This page shows what sits in every compartment on your farm.",
      )}
    >
      <ModStatTiles tiles={tiles} />
      {byFillType.length > 0 ? (
        <Card title={tOr("companionPage.realSilo.byFillTitle", "Stored by crop")}>
          <ModTable
            columns={[
              { key: "fill", label: tOr("companionPage.realSilo.colContents", "Contents") },
              { key: "liters", label: tOr("companionPage.realSilo.colLevel", "Stored"), align: "end" },
              { key: "compartments", label: tOr("companionPage.realSilo.colCompartments", "Compartments"), align: "end" },
            ]}
            rows={byFillType.map((row, i) => ({
              key: row.fillType ?? String(i),
              cells: {
                fill: row.title || row.fillType || "—",
                liters: liters(row.liters),
                compartments: formatNumber(row.compartments, 0),
              },
            }))}
          />
        </Card>
      ) : null}
      {silos.length > 0 ? (
        <div class="fd-mod-page__grid">
          {silos.map((silo, i) => (
            <SiloCard key={silo.id ?? String(i)} silo={silo} />
          ))}
        </div>
      ) : (
        <Card title={tOr("companionPage.realSilo.silosTitle", "Silos")}>
          <ModEmpty>
            {page
              ? tOr("companionPage.realSilo.noSilos", "No RealSilo silos owned by this farm.")
              : tOr("companionPage.realSilo.waitingSilos", "Silos appear after the next export.")}
          </ModEmpty>
        </Card>
      )}
      {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.realSilo.truncated", "Only the first silos are listed.")}</ModEmpty> : null}
      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.realSilo.look1", "Open a silo in game to set how many compartments it has and which one receives the next load."),
          tOr("companionPage.realSilo.look2", "Transfers move grain between compartments; a drying transfer dries it as it moves. Running transfers stop when the save is reloaded."),
          tOr("companionPage.realSilo.look3", "Moisture and grade show only when a moisture mod is running alongside RealSilo."),
        ]}
      >
        {defaults ? (
          <p class="fd-economy__muted">
            {tOr("companionPage.realSilo.defaults", "New silos start with {{count}} compartments of {{capacity}}.", {
              count: formatNumber(defaults.compartments, 0),
              capacity: liters(defaults.capacityPerCompartment),
            })}
          </p>
        ) : null}
      </ModAbout>
    </ModPage>
  );
}
