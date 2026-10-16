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
  useMoney,
  type CompanionPageProps,
  type ModStatTile,
} from "@/sections/mods/shared";

type Material = {
  fillType?: string;
  required?: number;
  delivered?: number;
  remaining?: number;
};

type Project = {
  id?: number;
  farmId?: number;
  name?: string;
  mode?: string;
  phase?: number;
  phaseCount?: number;
  progress?: number;
  totalPrice?: number;
  totalPaid?: number;
  remainingCost?: number;
  x?: number;
  z?: number;
  materials?: Material[];
};

function litres(value: unknown): string {
  return tOr("companionPage.everythingConstructable.litres", "{{value}} L", { value: formatNumber(value) });
}

function materialName(fillType: unknown): string {
  if (typeof fillType !== "string" || !fillType) {
    return tOr("companionPage.everythingConstructable.unknownMaterial", "Unknown material");
  }
  return fillType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ProjectCard({ project }: { project: Project }) {
  const money = useMoney();
  const materials = asList<Material>(project.materials);
  const progress = num(project.progress);
  const mode = typeof project.mode === "string" ? project.mode.toLowerCase() : "";
  const modeLabel = mode === "paused"
    ? tOr("companionPage.everythingConstructable.paused", "Paused")
    : mode === "automatic" || mode === "auto"
      ? tOr("companionPage.everythingConstructable.automatic", "Automatic")
      : tOr("companionPage.everythingConstructable.unknownMode", "Unknown");
  const location = num(project.x) != null && num(project.z) != null
    ? tOr("companionPage.everythingConstructable.coordinates", "X {{x}}, Z {{z}}", {
        x: formatNumber(project.x), z: formatNumber(project.z),
      })
    : "—";

  return (
    <Card title={project.name || tOr("companionPage.everythingConstructable.unnamed", "Construction site #{{id}}", { id: formatNumber(project.id) })}>
      <ModKeyValues rows={[
        {
          key: "phase",
          label: tOr("companionPage.everythingConstructable.phase", "Current phase"),
          value: tOr("companionPage.everythingConstructable.phaseOf", "{{current}} of {{total}}", {
            current: formatNumber(project.phase), total: formatNumber(project.phaseCount),
          }),
        },
        { key: "mode", label: tOr("companionPage.everythingConstructable.mode", "Build mode"), value: <Badge tone={mode === "paused" ? "warn" : "accent"}>{modeLabel}</Badge> },
        { key: "location", label: tOr("companionPage.everythingConstructable.location", "Map location"), value: location },
        { key: "remainingCost", label: tOr("companionPage.everythingConstructable.remainingCost", "Estimated remaining cost"), value: money(project.remainingCost) },
        { key: "paid", label: tOr("companionPage.everythingConstructable.paid", "Paid so far"), value: money(project.totalPaid) },
      ]} />
      {progress != null ? <ModBar ratio={progress} label={formatPercent(progress, { ratio: true, dp: 0 })} /> : null}
      <h4 class="fd-mod-page__subhead">{tOr("companionPage.everythingConstructable.materials", "Materials to deliver")}</h4>
      <ModTable
        columns={[
          { key: "material", label: tOr("companionPage.everythingConstructable.material", "Material") },
          { key: "delivered", label: tOr("companionPage.everythingConstructable.delivered", "Delivered"), align: "end" },
          { key: "required", label: tOr("companionPage.everythingConstructable.required", "Required"), align: "end" },
          { key: "remaining", label: tOr("companionPage.everythingConstructable.remaining", "Still needed"), align: "end" },
          { key: "status", label: tOr("companionPage.everythingConstructable.status", "Status") },
        ]}
        rows={materials.map((material, index) => {
          const remaining = num(material.remaining);
          const complete = remaining != null && remaining <= 0;
          return {
            key: `${material.fillType ?? "material"}-${index}`,
            tone: complete ? "ok" as const : undefined,
            cells: {
              material: materialName(material.fillType),
              delivered: litres(material.delivered),
              required: litres(material.required),
              remaining: litres(material.remaining),
              status: complete
                ? <Badge tone="accent">{tOr("companionPage.everythingConstructable.complete", "Delivered")}</Badge>
                : <Badge tone="warn">{tOr("companionPage.everythingConstructable.todo", "To deliver")}</Badge>,
            },
          };
        })}
        empty={tOr("companionPage.everythingConstructable.noMaterials", "No materials are currently requested for this site.")}
      />
    </Card>
  );
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const projects = asList<Project>(page?.projects).filter((project) => num(project.farmId) === farmId);
  const money = useMoney();
  const tiles: ModStatTile[] = farmData ? [
    { key: "sites", label: tOr("companionPage.everythingConstructable.statSites", "Active sites"), value: formatNumber(farmData.siteCount) },
    { key: "paused", label: tOr("companionPage.everythingConstructable.statPaused", "Paused"), value: formatNumber(farmData.pausedCount) },
    { key: "materials", label: tOr("companionPage.everythingConstructable.statMaterials", "Materials still needed"), value: formatNumber(farmData.pendingMaterials) },
    { key: "cost", label: tOr("companionPage.everythingConstructable.statCost", "Estimated cost left"), value: money(farmData.remainingCost) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr("companionPage.everythingConstructable.lead", "Follow your building sites and see what still needs delivering. This page only reads Everything Constructable; deliveries and build modes are changed in game.")}>
      <ModStatTiles tiles={tiles} />
      {projects.length > 0 ? (
        <div class="fd-mod-page__grid">
          {projects.map((project, index) => <ProjectCard key={project.id ?? index} project={project} />)}
        </div>
      ) : (
        <Card title={tOr("companionPage.everythingConstructable.sites", "Construction sites")}>
          <ModEmpty>
            {!page
              ? tOr("companionPage.everythingConstructable.waiting", "Sites appear after the next in-game export.")
              : page.reason === "manager-unavailable" || page.reason === "farm-unavailable"
                ? tOr("companionPage.everythingConstructable.unavailable", "Site data is not available from this save yet.")
                : tOr("companionPage.everythingConstructable.noSites", "This farm has no active construction projects.")}
          </ModEmpty>
        </Card>
      )}
      {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.everythingConstructable.truncated", "Only the first construction sites or materials are listed.")}</ModEmpty> : null}
      <ModAbout entry={entry} lookFor={[
        tOr("companionPage.everythingConstructable.look1", "Deliver materials to the site fence in game; this checklist updates from the next live export."),
        tOr("companionPage.everythingConstructable.look2", "Pause a project in game if you want to supply materials before automatic monthly progress continues."),
      ]} />
    </ModPage>
  );
}
