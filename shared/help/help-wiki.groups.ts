import { helpWikiGroupSchema, type HelpWikiGroup } from './help-wiki.schema';

export const HELP_WIKI_GROUPS: readonly HelpWikiGroup[] = [
  helpWikiGroupSchema.parse({ id: 'overview', label: 'Overview', order: 0 }),
  helpWikiGroupSchema.parse({ id: 'collections', label: 'Collections', order: 1 }),
  helpWikiGroupSchema.parse({ id: 'environments', label: 'Environments', order: 2 }),
  helpWikiGroupSchema.parse({ id: 'testing', label: 'Testing', order: 3 }),
  helpWikiGroupSchema.parse({ id: 'development', label: 'Development', order: 4 }),
  helpWikiGroupSchema.parse({ id: 'history', label: 'History', order: 5 }),
  helpWikiGroupSchema.parse({ id: 'collaboration', label: 'Teams', order: 6 }),
  helpWikiGroupSchema.parse({ id: 'settings', label: 'Settings', order: 7 }),
  helpWikiGroupSchema.parse({ id: 'reference', label: 'Reference', order: 8 }),
] as const;
