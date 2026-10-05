import { describe, expect, it } from 'vitest';

import { docsModeSlideDir } from './docs-mode-slide';

describe('docsModeSlideDir', () => {
  it('slides right when moving toward Preview', () => {
    expect(docsModeSlideDir('write', 'split')).toBe('right');
    expect(docsModeSlideDir('write', 'preview')).toBe('right');
    expect(docsModeSlideDir('split', 'preview')).toBe('right');
  });

  it('slides left when moving toward Write', () => {
    expect(docsModeSlideDir('preview', 'write')).toBe('left');
    expect(docsModeSlideDir('split', 'write')).toBe('left');
    expect(docsModeSlideDir('preview', 'split')).toBe('left');
  });
});
