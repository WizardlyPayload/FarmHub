import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

type LinkRow = {
  farmId?: number;
  chainId?: string;
  chain?: string;
  targetId?: string;
  target?: string;
  kind?: "tow" | "hook";
};

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const rows = asList<LinkRow>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "chains", label: tOr("companionPage.towingChainHook.chains", "Owned chains"), value: formatNumber(farmData.chainCount, 0) },
    { key: "links", label: tOr("companionPage.towingChainHook.links", "Current links"), value: formatNumber(farmData.linkCount, 0) },
  ] : [];
  return (
    <ModPage entry={entry} lead={tOr("companionPage.towingChainHook.lead", "Current links between this farm's towing chains and its owned vehicles. A link does not measure towing distance, recovered mass or income.")}>
      <ModStatTiles tiles={tiles} />
      {page?.readState === "partial" ? <ModEmpty>{tOr("companionPage.towingChainHook.partial", "Some links could not be verified, so totals are withheld.")}</ModEmpty> : null}
      <Card title={tOr("companionPage.towingChainHook.tableTitle", "Current chain links")}>
        <ModTable
          columns={[
            { key: "chain", label: tOr("companionPage.towingChainHook.chain", "Chain") },
            { key: "kind", label: tOr("companionPage.towingChainHook.connection", "Connection") },
            { key: "target", label: tOr("companionPage.towingChainHook.target", "Connected vehicle") },
          ]}
          rows={rows.map((row, index) => ({
            key: `${row.chainId || index}-${row.kind || "link"}`,
            cells: {
              chain: row.chain || row.chainId || "—",
              kind: row.kind === "hook"
                ? tOr("companionPage.towingChainHook.hook", "Hook mounted")
                : tOr("companionPage.towingChainHook.tow", "Tow attached"),
              target: row.target || row.targetId || "—",
            },
          }))}
          empty={tOr("companionPage.towingChainHook.empty", "No current owned-vehicle chain link is available.")}
        />
        {page?.coverage === "truncated" ? <ModEmpty>{tOr("companionPage.towingChainHook.truncated", "Only the first chain links are listed.")}</ModEmpty> : null}
      </Card>
    </ModPage>
  );
}
