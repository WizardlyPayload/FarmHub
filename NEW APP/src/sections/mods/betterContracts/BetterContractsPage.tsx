import { Card } from "@/components/ui";
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
  yesNo,
  type CompanionPageProps,
  type ModKeyValue,
  type ModStatTile,
} from "@/sections/mods/shared";

type MissionRow = {
  type?: string;
  title?: string;
  location?: string;
  npc?: string;
  reward?: number;
  vehicleCosts?: number;
  leased?: boolean;
  completion?: number;
};
type TypeCount = { type?: string; count?: number };
type NpcRow = { npc?: string; jobs?: number; discountPercent?: number; maxedOut?: boolean; canLease?: boolean };

/** "harvestMission" -> "Harvest", "plowMission" -> "Plow". */
function missionTypeLabel(value: unknown): string {
  if (typeof value !== "string" || value === "") return "—";
  const words = value
    .replace(/Mission$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData } = useCompanionPage(entry.key);
  const money = useMoney();
  const settings = (page?.settings && typeof page.settings === "object" ? page.settings : null) as Record<string, unknown> | null;
  const offers = (page?.offers && typeof page.offers === "object" ? page.offers : null) as Record<string, unknown> | null;
  const best = asList<MissionRow>(offers?.best);
  const byType = asList<TypeCount>(offers?.byType);
  const active = asList<MissionRow>(farmData?.active);
  const npcJobs = asList<NpcRow>(farmData?.npcJobs);
  const hardMode = settings?.hardMode === true;

  const tiles: ModStatTile[] = [];
  if (farmData) {
    tiles.push(
      {
        key: "active",
        label: tOr("companionPage.betterContracts.statActive", "Active contracts"),
        value: formatNumber(farmData.activeCount, 0),
        hint:
          num(farmData.slotsFree) == null
            ? null
            : tOr("companionPage.betterContracts.statSlots", "{{count}} more allowed", { count: formatNumber(farmData.slotsFree, 0) }),
        tone: num(farmData.slotsFree) === 0 ? "warn" : undefined,
      },
      { key: "activeReward", label: tOr("companionPage.betterContracts.statActiveReward", "Reward on completion"), value: money(farmData.activeReward) },
      {
        key: "finished",
        label: tOr("companionPage.betterContracts.statFinished", "Finished, not yet dismissed"),
        value: formatNumber(farmData.finishedCount, 0),
        hint: tOr("companionPage.betterContracts.statFinishedHint", "{{ok}} succeeded, {{failed}} failed · {{amount}}", {
          ok: formatNumber(farmData.succeeded, 0),
          failed: formatNumber(farmData.failed, 0),
          amount: money(farmData.finishedReward),
        }),
        tone: (num(farmData.failed) ?? 0) > 0 ? "warn" : undefined,
      },
    );
    if (hardMode && num(farmData.jobsLeft) != null) {
      tiles.push({
        key: "jobsLeft",
        label: tOr("companionPage.betterContracts.statJobsLeft", "Contracts left this month"),
        value: formatNumber(farmData.jobsLeft, 0),
        tone: num(farmData.jobsLeft) === 0 ? "danger" : undefined,
      });
    }
  }
  if (offers) {
    tiles.push({
      key: "offers",
      label: tOr("companionPage.betterContracts.statOffers", "Contracts on offer"),
      value: formatNumber(offers.count, 0),
      hint: tOr("companionPage.betterContracts.statOffersHint", "{{amount}} in rewards", { amount: money(offers.totalReward) }),
    });
  }

  const settingRows: ModKeyValue[] = settings
    ? [
        { key: "maxActive", label: tOr("companionPage.betterContracts.setMaxActive", "Active contracts allowed"), value: formatNumber(settings.maxActive, 0) },
        { key: "reward", label: tOr("companionPage.betterContracts.setReward", "Reward multiplier"), value: `×${formatNumber(settings.rewardMultiplier, 2)}` },
        { key: "rewardMow", label: tOr("companionPage.betterContracts.setRewardMow", "Mowing / baling reward multiplier"), value: `×${formatNumber(settings.rewardMultiplierMow, 2)}` },
        { key: "lease", label: tOr("companionPage.betterContracts.setLease", "Lease cost multiplier"), value: `×${formatNumber(settings.leaseMultiplier, 2)}` },
        { key: "toDeliver", label: tOr("companionPage.betterContracts.setDeliver", "Harvest delivery needed"), value: formatPercent(settings.toDeliver, { ratio: true, dp: 0 }) },
        { key: "toDeliverBale", label: tOr("companionPage.betterContracts.setDeliverBale", "Bale delivery needed"), value: formatPercent(settings.toDeliverBale, { ratio: true, dp: 0 }) },
        { key: "fieldCompletion", label: tOr("companionPage.betterContracts.setCompletion", "Field work needed"), value: formatPercent(settings.fieldCompletion, { ratio: true, dp: 0 }) },
        { key: "lazyNPC", label: tOr("companionPage.betterContracts.setLazy", "Lazy NPCs leave field work"), value: yesNo(settings.lazyNPC) },
        {
          key: "discount",
          label: tOr("companionPage.betterContracts.setDiscount", "Loyalty discount"),
          value:
            settings.discountMode === true
              ? tOr("companionPage.betterContracts.discountRule", "{{pct}} per job, up to {{jobs}} jobs", {
                  pct: formatPercent(settings.discPerJob, { ratio: true, dp: 0 }),
                  jobs: formatNumber(settings.discMaxJobs, 0),
                })
              : yesNo(false),
        },
        {
          key: "hard",
          label: tOr("companionPage.betterContracts.setHard", "Hard mode"),
          value: hardMode
            ? tOr("companionPage.betterContracts.hardRule", "{{penalty}} penalty on cancel, lease after {{lease}} jobs, {{limit}} per month", {
                penalty: formatPercent(settings.hardPenalty, { ratio: true, dp: 0 }),
                lease: formatNumber(settings.hardLease, 0),
                limit: (num(settings.hardLimit) ?? -1) < 0 ? tOr("companionPage.betterContracts.unlimited", "unlimited") : formatNumber(settings.hardLimit, 0),
              })
            : yesNo(false),
        },
        { key: "addons", label: tOr("companionPage.betterContracts.setAddons", "Mod features switched on"), value: yesNo(settings.addonsOn) },
      ]
    : [];

  return (
    <ModPage
      entry={entry}
      lead={tOr(
        "companionPage.betterContracts.lead",
        "Better Contracts adds more contracts, reward and lease multipliers, NPC loyalty discounts and an optional hard mode. This page shows your running contracts, the best offers on the board and your standing with each NPC.",
      )}
    >
      <ModStatTiles tiles={tiles} />
      <Card title={tOr("companionPage.betterContracts.activeTitle", "Your running contracts")}>
        <ModTable
          columns={[
            { key: "type", label: tOr("companionPage.betterContracts.colType", "Contract") },
            { key: "where", label: tOr("companionPage.betterContracts.colWhere", "Where") },
            { key: "npc", label: tOr("companionPage.betterContracts.colNpc", "For") },
            { key: "progress", label: tOr("companionPage.betterContracts.colProgress", "Progress") },
            { key: "reward", label: tOr("companionPage.betterContracts.colReward", "Reward"), align: "end" },
            { key: "lease", label: tOr("companionPage.betterContracts.colLease", "Lease cost"), align: "end" },
          ]}
          rows={active.map((m, i) => ({
            key: `active-${i}`,
            cells: {
              type: m.title ?? missionTypeLabel(m.type),
              where: m.location ?? "—",
              npc: m.npc ?? "—",
              progress:
                num(m.completion) == null ? (
                  "—"
                ) : (
                  <>
                    <ModBar ratio={m.completion} />
                    <small class="fd-economy__muted">{formatPercent(m.completion, { ratio: true, dp: 0 })}</small>
                  </>
                ),
              reward: money(m.reward),
              lease: m.leased ? money(m.vehicleCosts) : tOr("companionPage.betterContracts.ownVehicles", "Own vehicles"),
            },
          }))}
          empty={
            farmData
              ? tOr("companionPage.betterContracts.noActive", "No contracts running for this farm.")
              : tOr("companionPage.betterContracts.waitingActive", "Contracts appear after the next export.")
          }
        />
      </Card>
      <div class="fd-mod-page__grid">
        <Card title={tOr("companionPage.betterContracts.bestTitle", "Best-paying offers")}>
          <ModTable
            columns={[
              { key: "type", label: tOr("companionPage.betterContracts.colType", "Contract") },
              { key: "where", label: tOr("companionPage.betterContracts.colWhere", "Where") },
              { key: "npc", label: tOr("companionPage.betterContracts.colNpc", "For") },
              { key: "reward", label: tOr("companionPage.betterContracts.colReward", "Reward"), align: "end" },
            ]}
            rows={best.map((m, i) => ({
              key: `offer-${i}`,
              cells: {
                type: m.title ?? missionTypeLabel(m.type),
                where: m.location ?? "—",
                npc: m.npc ?? "—",
                reward: money(m.reward),
              },
            }))}
            empty={tOr("companionPage.betterContracts.noOffers", "No contracts on offer right now.")}
          />
        </Card>
        <Card title={tOr("companionPage.betterContracts.byTypeTitle", "Offers by type")}>
          <ModTable
            columns={[
              { key: "type", label: tOr("companionPage.betterContracts.colType", "Contract") },
              { key: "count", label: tOr("companionPage.betterContracts.colCount", "On offer"), align: "end" },
            ]}
            rows={byType.map((t, i) => ({
              key: t.type ?? String(i),
              cells: { type: missionTypeLabel(t.type), count: formatNumber(t.count, 0) },
            }))}
            empty={tOr("companionPage.betterContracts.noOffers", "No contracts on offer right now.")}
          />
        </Card>
        {settings ? (
          <Card title={tOr("companionPage.betterContracts.npcTitle", "Standing with NPCs")}>
            <ModTable
              columns={[
                { key: "npc", label: tOr("companionPage.betterContracts.colNpc", "For") },
                { key: "jobs", label: tOr("companionPage.betterContracts.colJobs", "Jobs done"), align: "end" },
                { key: "discount", label: tOr("companionPage.betterContracts.colDiscount", "Discount"), align: "end" },
                ...(hardMode ? [{ key: "lease", label: tOr("companionPage.betterContracts.colCanLease", "May lease"), align: "center" as const }] : []),
              ]}
              rows={npcJobs.map((n, i) => ({
                key: n.npc ?? String(i),
                tone: n.maxedOut ? "ok" : undefined,
                cells: {
                  npc: n.npc ?? "—",
                  jobs: formatNumber(n.jobs, 0),
                  discount:
                    num(n.discountPercent) == null
                      ? "—"
                      : n.maxedOut
                        ? tOr("companionPage.betterContracts.discountMax", "{{pct}} (max)", { pct: formatPercent(n.discountPercent, { dp: 0 }) })
                        : formatPercent(n.discountPercent, { dp: 0 }),
                  lease: yesNo(n.canLease === true),
                },
              }))}
              empty={tOr("companionPage.betterContracts.noNpcs", "No contracts finished for any NPC yet.")}
            />
          </Card>
        ) : null}
        <Card title={tOr("companionPage.betterContracts.settingsTitle", "Mod settings")}>
          {settingRows.length > 0 ? (
            <ModKeyValues rows={settingRows} />
          ) : (
            <ModEmpty>
              {tOr("companionPage.betterContracts.noSettings", "The mod's settings were not readable; contracts above come from the game's contract list.")}
            </ModEmpty>
          )}
        </Card>
      </div>
      <ModAbout
        entry={entry}
        lookFor={[
          tOr("companionPage.betterContracts.look1", "The Contracts page in the in-game menu gains filters, sorting and extra details."),
          tOr("companionPage.betterContracts.look2", "Finishing jobs for the same NPC raises their discount on vehicle leases."),
          tOr("companionPage.betterContracts.look3", "Hard mode charges a penalty for cancelled contracts and can limit contracts per month."),
        ]}
      />
    </ModPage>
  );
}
