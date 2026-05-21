import { describe, expect, it } from 'vitest';

import { coerceWorkspaceEditorLayout } from './workspace-editor-layout.schema';

describe('coerceWorkspaceEditorLayout', () => {
  it('keeps titlebar layout', () => {
    expect(coerceWorkspaceEditorLayout('titlebar')).toBe('titlebar');
  });

  it('keeps sidebar layout', () => {
    expect(coerceWorkspaceEditorLayout('sidebar')).toBe('sidebar');
  });

  it('maps legacy popup dropdown layout to sidebar', () => {
    expect(coerceWorkspaceEditorLayout('popup')).toBe('sidebar');
  });

  it('defaults unknown values to sidebar', () => {
    expect(coerceWorkspaceEditorLayout('invalid')).toBe('sidebar');
  });
});
