import type { CompanionCategory } from "@/lib/companionMods";
import { CompanionPanelsEmbed } from "./CompanionPanels";
import { LiveStats } from "./LiveStats";
import "@/sections/economy/economy.css";
import "./companions.css";

export { LiveStats };

/** Compact strip for embedding on Economy / Fields / etc. */
export function CompanionModsEmbed(props: {
  categories: CompanionCategory[];
  ids?: readonly string[];
  title?: string;
  exclude?: readonly string[];
}) {
  return <CompanionPanelsEmbed {...props} />;
}
