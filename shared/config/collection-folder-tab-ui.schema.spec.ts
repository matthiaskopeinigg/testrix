import { describe, expect, it } from 'vitest';

import {
  collectionFolderTabUiSchema,
  resolveCollectionFolderTabUi,
} from './collection-folder-tab-ui.schema';

describe('collectionFolderTabUiSchema', () => {
  it('defaults section and script pane', () => {
    const ui = collectionFolderTabUiSchema.parse({});
    expect(ui.activeSection).toBe('overview');
    expect(ui.activeScriptPane).toBe('pre');
  });
});

describe('resolveCollectionFolderTabUi', () => {
  it('returns stored UI for a folder id', () => {
    const ui = resolveCollectionFolderTabUi(
      { 'folder-a': { activeSection: 'script', activeScriptPane: 'post' } },
      'folder-a',
    );
    expect(ui.activeSection).toBe('script');
    expect(ui.activeScriptPane).toBe('post');
  });

  it('falls back to defaults for unknown ids', () => {
    const ui = resolveCollectionFolderTabUi({}, 'missing');
    expect(ui.activeSection).toBe('overview');
    expect(ui.activeScriptPane).toBe('pre');
  });
});
