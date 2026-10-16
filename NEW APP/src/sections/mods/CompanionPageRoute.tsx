import type { ComponentType } from "preact";
import { lazy } from "preact/compat";
import { tOr } from "@/i18n/i18n";
import { companionPageEntry, companionPageKeyFromSection } from "@/sections/mods/registry";
import type { CompanionPageEntry, CompanionPageProps } from "@/sections/mods/types";

const lazyPages = new Map<string, ComponentType<CompanionPageProps>>();

function pageComponent(entry: CompanionPageEntry): ComponentType<CompanionPageProps> {
  const cached = lazyPages.get(entry.key);
  if (cached) return cached;
  const component: ComponentType<CompanionPageProps> = lazy(() =>
    entry.load().then((Page) => ({ default: Page })),
  );
  lazyPages.set(entry.key, component);
  return component;
}

/** Renders the dedicated page for `#mod-<key>`. Suspense comes from SectionRouter. */
export function CompanionPageRoute({ section }: { section: string }) {
  const entry = companionPageEntry(companionPageKeyFromSection(section));
  if (!entry) {
    return (
      <div class="fd-section-placeholder">
        <h2>{tOr("companionPage.shared.unknownTitle", "Mod page not available")}</h2>
        <p>{tOr("companionPage.shared.unknown", "This FarmHub version has no page for that mod.")}</p>
      </div>
    );
  }
  const Page = pageComponent(entry);
  return <Page entry={entry} />;
}
