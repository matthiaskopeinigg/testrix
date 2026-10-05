import { describe, expect, it } from 'vitest';

import {
  REQUEST_TAB_SECTIONS,
  WEBSOCKET_TAB_SECTIONS,
  folderTabSectionSchema,
} from '@testrix/contracts';

import { articlesForSection, filterHelpHits } from '../help/help-registry';
import { docsModeSlideDir } from './docs-mode-slide';

/**
 * Documentation / product coverage for Collections surfaces.
 * Keeps help copy and section registries aligned with the shipped UI.
 */
describe('Collections coverage', () => {
  it('covers sidebar help: tree, drag, multi-select, search', () => {
    expect(articlesForSection('collections').some((item) => item.id === 'collections-tree')).toBe(true);
    expect(filterHelpHits('drag a node').some((item) => item.id === 'collections-tree')).toBe(true);
    expect(filterHelpHits('Shift-click').some((item) => item.id === 'collections-tree')).toBe(true);
    expect(filterHelpHits('Search, filter, and sort').some((item) => item.id === 'collections-tree')).toBe(true);
  });

  it('covers folder tab help: open, inherit, Write/Split/Preview docs', () => {
    expect(articlesForSection('collections').some((item) => item.id === 'collection-folder')).toBe(true);
    expect(filterHelpHits('Open a folder from its context menu').some((item) => item.id === 'collection-folder')).toBe(
      true,
    );
    expect(filterHelpHits('Write, Split, and Preview').some((item) => item.id === 'collection-folder')).toBe(true);
    expect(folderTabSectionSchema.options).toContain('docs');
  });

  it('covers request tab help: sections, Send, Docs', () => {
    expect(filterHelpHits('HTTP tabs hold method').some((item) => item.id === 'workbench-editors')).toBe(true);
    expect(filterHelpHits('Settings, and Docs').some((item) => item.id === 'workbench-editors')).toBe(true);
    expect(REQUEST_TAB_SECTIONS).toEqual([
      'overview',
      'params',
      'headers',
      'body',
      'auth',
      'scripts',
      'settings',
      'docs',
    ]);
  });

  it('covers websocket tab help: Connect, Docs, desktop host', () => {
    expect(filterHelpHits('real socket from the desktop host').some((item) => item.id === 'workbench-editors')).toBe(
      true,
    );
    expect(filterHelpHits('Settings, and Docs').some((item) => item.id === 'workbench-editors')).toBe(true);
    expect(WEBSOCKET_TAB_SECTIONS.at(-1)).toBe('docs');
  });

  it('covers shared docs mode animation directions', () => {
    expect(docsModeSlideDir('write', 'split')).toBe('right');
    expect(docsModeSlideDir('preview', 'split')).toBe('left');
  });

  it('covers sidebar delete confirmation and toast undo help', () => {
    expect(filterHelpHits('toast offers Undo').some((item) => item.id === 'shortcuts-sidebar-selection')).toBe(true);
    expect(filterHelpHits('Delete or Backspace removes').some((item) => item.id === 'shortcuts-sidebar-selection')).toBe(
      true,
    );
  });
});
