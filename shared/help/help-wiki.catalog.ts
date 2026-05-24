import { HELP_WIKI_GROUPS } from './help-wiki.groups';
import { helpWikiCatalogSchema, type HelpWikiCatalog, type HelpWikiSection } from './help-wiki.schema';
import { HELP_WIKI_COLLECTIONS_SECTIONS } from './help-wiki.content/collections.content';
import { HELP_WIKI_DEVELOPMENT_SECTIONS } from './help-wiki.content/development.content';
import { HELP_WIKI_ENVIRONMENTS_SECTIONS } from './help-wiki.content/environments.content';
import { HELP_WIKI_HISTORY_SECTIONS } from './help-wiki.content/history.content';
import { HELP_WIKI_OVERVIEW_SECTIONS } from './help-wiki.content/overview.content';
import { HELP_WIKI_REFERENCE_SECTIONS } from './help-wiki.content/reference.content';
import { HELP_WIKI_SETTINGS_SECTIONS } from './help-wiki.content/settings.content';
import { HELP_WIKI_TESTING_SECTIONS } from './help-wiki.content/testing.content';

export const HELP_WIKI_SECTIONS: readonly HelpWikiSection[] = [
  ...HELP_WIKI_OVERVIEW_SECTIONS,
  ...HELP_WIKI_COLLECTIONS_SECTIONS,
  ...HELP_WIKI_ENVIRONMENTS_SECTIONS,
  ...HELP_WIKI_TESTING_SECTIONS,
  ...HELP_WIKI_DEVELOPMENT_SECTIONS,
  ...HELP_WIKI_HISTORY_SECTIONS,
  ...HELP_WIKI_SETTINGS_SECTIONS,
  ...HELP_WIKI_REFERENCE_SECTIONS,
];

export const HELP_WIKI_CATALOG: HelpWikiCatalog = helpWikiCatalogSchema.parse({
  groups: [...HELP_WIKI_GROUPS],
  sections: [...HELP_WIKI_SECTIONS],
});

/** Returns a section by id, if present. */
export function findHelpWikiSection(id: string): HelpWikiSection | null {
  return HELP_WIKI_SECTIONS.find((section) => section.id === id) ?? null;
}

export interface HelpWikiSidebarGroup {
  readonly title: string;
  readonly items: readonly HelpWikiSection[];
}

/** Sidebar groups with their sections in catalog order. */
export function helpWikiSidebarGroups(): readonly HelpWikiSidebarGroup[] {
  const sortedGroups = [...HELP_WIKI_GROUPS].sort((a, b) => a.order - b.order);
  return sortedGroups.map((group) => ({
    title: group.label,
    items: HELP_WIKI_SECTIONS.filter((section) => section.groupId === group.id),
  }));
}
