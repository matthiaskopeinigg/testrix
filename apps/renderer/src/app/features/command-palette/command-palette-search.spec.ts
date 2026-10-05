import { describe, expect, it } from 'vitest';

import {
  buildPaletteHomeRows,
  rankPaletteCommands,
  scorePaletteMatch,
} from './command-palette-search';

describe('scorePaletteMatch', () => {
  it('ranks exact and prefix label matches highest', () => {
    const jwt = { id: 'jwt', label: 'JWT Toolkit', hint: 'Tools', keywords: 'token hs256' };
    expect(scorePaletteMatch('jwt toolkit', jwt)).toBeGreaterThan(scorePaletteMatch('jwt', jwt));
    expect(scorePaletteMatch('jwt', jwt)).toBeGreaterThan(scorePaletteMatch('token', jwt));
  });

  it('matches keywords and multi-word queries', () => {
    const item = {
      id: 'headers',
      label: 'Default headers',
      hint: 'Settings → HTTP',
      keywords: 'user-agent accept',
    };
    expect(scorePaletteMatch('user-agent', item)).toBeGreaterThan(0);
    expect(scorePaletteMatch('default http', item)).toBeGreaterThan(0);
  });

  it('supports fuzzy subsequence matches', () => {
    const item = { id: 'uuid', label: 'UUID Generator', hint: 'Tools', keywords: '' };
    expect(scorePaletteMatch('udgn', item)).toBeGreaterThan(0);
  });
});

describe('buildPaletteHomeRows', () => {
  it('groups commands under home section headers', () => {
    const rows = buildPaletteHomeRows([
      { id: 'a', label: 'Run query', hint: 'Tab', homeSection: 'this-tab' },
      { id: 'b', label: 'Import', hint: 'Workspace', homeSection: 'workspace' },
      { id: 'c', label: 'Open Tools', hint: 'Go', homeSection: 'go-to' },
    ]);
    expect(rows.filter((row) => row.kind === 'header').map((row) => row.label)).toEqual([
      'This tab',
      'Workspace',
      'Go to',
    ]);
  });

  it('places pinned section first when present', () => {
    const rows = buildPaletteHomeRows([
      { id: 'p', label: 'Pinned req', hint: 'Pin', homeSection: 'pinned' },
      { id: 'a', label: 'Run query', hint: 'Tab', homeSection: 'this-tab' },
    ]);
    expect(rows.filter((row) => row.kind === 'header').map((row) => row.label)).toEqual([
      'Pinned',
      'This tab',
    ]);
  });
});

describe('rankPaletteCommands', () => {
  it('returns all items when the query is empty', () => {
    const items = [
      { id: 'a', label: 'Open help', hint: 'Tips' },
      { id: 'b', label: 'JWT Toolkit', hint: 'Tools' },
    ];
    expect(rankPaletteCommands(items, '  ')).toEqual(items);
  });

  it('orders stronger matches first', () => {
    const items = [
      { id: 'a', label: 'Open Collections', hint: 'Sidebar' },
      { id: 'b', label: 'JWT Toolkit', hint: 'Tools · decode tokens' },
      { id: 'c', label: 'Open settings', hint: 'Preferences' },
    ];
    const ranked = rankPaletteCommands(items, 'jwt');
    expect(ranked.map((item) => item.id)).toEqual(['b']);
  });
});
