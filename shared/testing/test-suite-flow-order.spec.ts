import { describe, expect, it } from 'vitest';

import { createFlowFolder, createFlowStep, normalizeFlowStepNodes } from '@shared/testing';

describe('normalizeFlowStepNodes', () => {
  it('hoists steps from nested folders to a flat root list', () => {
    const inner = createFlowStep('WAIT', 'Wait');
    inner.id = 'step-inner';
    const folder = {
      ...createFlowFolder('Group'),
      id: 'fld-1',
      children: [inner] as const,
    };
    const root = createFlowStep('REQUEST', 'Request');
    root.id = 'step-root';

    const normalized = normalizeFlowStepNodes([root, folder]);

    expect(normalized.map((s) => s.id)).toEqual(['step-root', 'step-inner']);
    expect(normalized.every((s) => s.parentId === null)).toBe(true);
  });
});
