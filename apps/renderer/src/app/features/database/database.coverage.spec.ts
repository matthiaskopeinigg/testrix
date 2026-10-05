import { describe, expect, it } from 'vitest';

import {
  DATABASE_TYPE_IDS,
  databaseSidebarFilterSchema,
} from '@testrix/contracts';

import { articlesForSection, filterHelpHits } from '../help/help-registry';

const DATABASE_ARTICLE_IDS = [
  'database-sidebar',
  'database-connections',
  'database-queries',
  'database-table',
  'database-settings',
] as const;

/**
 * Documentation / product coverage for Database rail and editors.
 */
describe('Database coverage', () => {
  it('covers every database help article', () => {
    const articles = articlesForSection('database');
    for (const id of DATABASE_ARTICLE_IDS)
      expect(articles.some((item) => item.id === id)).toBe(true);
  });

  it('covers sidebar search, filter, drag, and workspace files', () => {
    expect(filterHelpHits('Catalog rows under a connection are not draggable').some((item) => item.id === 'database-sidebar')).toBe(
      true,
    );
    expect(filterHelpHits('database.json').some((item) => item.id === 'database-sidebar')).toBe(true);
    expect(databaseSidebarFilterSchema.options).toContain('queries');
  });

  it('covers connections, Load more, and engines', () => {
    expect(filterHelpHits('Load more').some((item) => item.id === 'database-connections')).toBe(true);
    expect(filterHelpHits('Paste a connection string').some((item) => item.id === 'database-connections')).toBe(true);
    expect(DATABASE_TYPE_IDS).toContain('postgresql');
  });

  it('covers query Ctrl+Enter, Commit/Push, and table Submit', () => {
    expect(filterHelpHits('Ctrl+Enter').some((item) => item.id === 'database-queries')).toBe(true);
    expect(filterHelpHits('Commit or Push').some((item) => item.id === 'database-queries')).toBe(true);
    expect(filterHelpHits('Submit starts a held transaction').some((item) => item.id === 'database-table')).toBe(true);
  });

  it('covers idle disconnect and rollback uncommitted settings', () => {
    expect(filterHelpHits('Idle disconnect').some((item) => item.id === 'database-settings')).toBe(true);
    expect(filterHelpHits('Rollback uncommitted').some((item) => item.id === 'database-settings')).toBe(true);
  });
});
