import { helpWikiSectionSchema, type HelpWikiBlock, type HelpWikiSection } from './help-wiki.schema';

/**
 * Builds a validated wiki section document.
 */
export function wikiSection(input: {
  readonly id: string;
  readonly groupId: string;
  readonly label: string;
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly blocks: readonly HelpWikiBlock[];
}): HelpWikiSection {
  return helpWikiSectionSchema.parse(input);
}
