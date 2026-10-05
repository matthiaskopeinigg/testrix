import { describe, expect, it } from 'vitest';

import { articlesForSection, filterHelpHits } from './help-registry';

describe('filterHelpHits', () => {
  it('returns nothing for an empty query', () => {
    expect(filterHelpHits('   ')).toEqual([]);
  });

  it('matches proxy topics', () => {
    const hits = filterHelpHits('proxy');
    expect(hits.some((item) => item.section === 'network')).toBe(true);
  });
});

describe('articlesForSection', () => {
  it('returns getting started articles', () => {
    expect(articlesForSection('start').length).toBeGreaterThan(0);
  });

  it('documents request history', () => {
    const hits = filterHelpHits('history rail');
    expect(hits.some((item) => item.id === 'workbench-history')).toBe(true);
    expect(articlesForSection('workbench').some((item) => item.id === 'workbench-history')).toBe(true);
  });

  it('documents body code editor shortcuts', () => {
    const hits = filterHelpHits('Shift+Alt+F');
    expect(hits.some((item) => item.id === 'workbench-editors')).toBe(true);
  });

  it('documents https and www URL completion on send', () => {
    const hits = filterHelpHits('retries with www');
    expect(hits.some((item) => item.id === 'workbench-editors')).toBe(true);
  });

  it('documents the workspace cookie jar', () => {
    const hits = filterHelpHits('cookies.json');
    expect(hits.some((item) => item.id === 'workbench-editors')).toBe(true);
  });

  it('documents pretty syntax highlighting', () => {
    const hits = filterHelpHits('syntax highlight pretty');
    expect(hits.some((item) => item.id === 'workbench-editors')).toBe(true);
  });

  it('documents Shift+click on a variable chip to open its source', () => {
    const hits = filterHelpHits('Shift+click opens');
    expect(hits.some((item) => item.id === 'workbench-editors')).toBe(true);
  });

  it('documents real WebSocket connect from the desktop host', () => {
    const hits = filterHelpHits('real socket from the desktop host');
    expect(hits.some((item) => item.id === 'workbench-editors')).toBe(true);
  });

  it('documents the seeded Testing workspace', () => {
    const hits = filterHelpHits('Testing workspace is created');
    expect(hits.some((item) => item.id === 'workspaces-switch')).toBe(true);
  });

  it('documents workspace export and import', () => {
    expect(filterHelpHits('export workspace pack').some((item) => item.id === 'data-export')).toBe(true);
    expect(filterHelpHits('drag drop import scrim').some((item) => item.id === 'data-import-drag-drop')).toBe(true);
    expect(articlesForSection('workspaces').some((item) => item.id === 'workspaces-export-import')).toBe(true);
  });

  it('documents the settings wizard', () => {
    expect(filterHelpHits('settings wizard steps').some((item) => item.id === 'settings-wizard')).toBe(true);
    expect(articlesForSection('settings').some((item) => item.id === 'settings-wizard')).toBe(true);
  });

  it('documents focus mode and workbench tabs', () => {
    expect(filterHelpHits('focus mode sidebar').some((item) => item.id === 'settings-focus-mode')).toBe(true);
    expect(filterHelpHits('progressive response tabs').some((item) => item.id === 'workbench-response-tabs')).toBe(
      true,
    );
    expect(filterHelpHits('url ingest').some((item) => item.id === 'workbench-url-ingest')).toBe(true);
  });

  it('documents the services catalog', () => {
    const hits = filterHelpHits('slide into that service');
    expect(hits.some((item) => item.id === 'services-catalog')).toBe(true);
    expect(articlesForSection('services').some((item) => item.id === 'services-catalog')).toBe(true);
  });

  it('documents the flow node canvas', () => {
    const hits = filterHelpHits('drag an output port');
    expect(hits.some((item) => item.id === 'services-flows')).toBe(true);
  });

  it('documents regression flow packs', () => {
    const hits = filterHelpHits('Promote any suite run to golden');
    expect(hits.some((item) => item.id === 'services-regression')).toBe(true);
    expect(articlesForSection('services').some((item) => item.id === 'services-regression')).toBe(true);
  });

  it('documents the Basics tutorial flows', () => {
    const hits = filterHelpHits('Node reference');
    expect(hits.some((item) => item.id === 'services-flows')).toBe(true);
  });

  it('documents load dock and collection targets', () => {
    const hits = filterHelpHits('resizable bottom dock');
    expect(hits.some((item) => item.id === 'services-load')).toBe(true);
    expect(articlesForSection('services').some((item) => item.id === 'services-load')).toBe(true);
  });

  it('documents mock endpoints and placeholders', () => {
    const hits = filterHelpHits('mocks.json');
    expect(hits.some((item) => item.id === 'services-mock')).toBe(true);
    expect(articlesForSection('services').some((item) => item.id === 'services-mock')).toBe(true);
  });

  it('documents listener browser and device capture', () => {
    const hits = filterHelpHits('listeners.json');
    expect(hits.some((item) => item.id === 'services-listener')).toBe(true);
  });

  it('documents interceptor MITM rules', () => {
    const hits = filterHelpHits('intercept.json');
    expect(hits.some((item) => item.id === 'services-intercept')).toBe(true);
  });

  it('documents parallel splits and forked browser windows', () => {
    const hits = filterHelpHits('branches run at the same time');
    expect(hits.some((item) => item.id === 'services-flows')).toBe(true);
  });

  it('documents scenarios and data rows', () => {
    const hits = filterHelpHits('named scenarios');
    expect(hits.some((item) => item.id === 'services-flows')).toBe(true);
  });

  it('documents service sidebar empty-click create', () => {
    const hits = filterHelpHits('Right-click empty space to create');
    expect(hits.some((item) => item.id === 'services-catalog')).toBe(true);
  });

  it('documents history filters and clear', () => {
    const hits = filterHelpHits('group by day');
    expect(hits.some((item) => item.id === 'workbench-history')).toBe(true);
  });

  it('documents Android emulator activate', () => {
    const hits = filterHelpHits('Activate emulator');
    expect(hits.some((item) => item.id === 'settings-android')).toBe(true);
  });

  it('documents the Emulator service sidebar', () => {
    expect(filterHelpHits('Play Store').some((item) => item.id === 'services-emulator')).toBe(true);
    expect(filterHelpHits('double-click').some((item) => item.id === 'services-emulator')).toBe(true);
    expect(filterHelpHits('Start Device').some((item) => item.id === 'services-emulator')).toBe(false);
    expect(filterHelpHits('dark caption').some((item) => item.id === 'settings-android')).toBe(true);
  });

  it('documents Device flow nodes and pick on device', () => {
    expect(filterHelpHits('Pick on device').some((item) => item.id === 'services-flows')).toBe(true);
    expect(filterHelpHits('Start Device').some((item) => item.id === 'services-flows')).toBe(true);
  });

  it('documents save mode for collections and flows', () => {
    const hits = filterHelpHits('Save on change');
    expect(hits.some((item) => item.id === 'settings-appearance')).toBe(true);
    expect(hits.some((item) => item.id === 'workbench-editors')).toBe(true);
  });

  it('documents multi-select drag in collection trees', () => {
    const hits = filterHelpHits('whole selection in tree order');
    expect(hits.some((item) => item.id === 'collections-tree')).toBe(true);
  });
});
