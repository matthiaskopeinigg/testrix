import { describe, expect, it } from 'vitest';

import { TEST_SUITE_STEP_TYPES } from '@shared/testing';

import { FLOW_STEP_ADD_GROUPS, FLOW_STEP_ADD_TILES } from './flow-step-editor-options';

describe('FLOW_STEP_ADD_GROUPS', () => {
  it('puts E2E, request, validation, and cache first', () => {
    expect(FLOW_STEP_ADD_GROUPS[0]?.id).toBe('common');
    expect(FLOW_STEP_ADD_GROUPS[0]?.tiles.map((tile) => tile.type)).toEqual([
      'E2E',
      'REQUEST',
      'VALIDATION',
      'CACHE',
    ]);
  });

  it('covers every step type once', () => {
    const types = FLOW_STEP_ADD_TILES.map((tile) => tile.type);
    expect(types).toHaveLength(TEST_SUITE_STEP_TYPES.length);
    expect(new Set(types).size).toBe(TEST_SUITE_STEP_TYPES.length);
    expect(types.sort()).toEqual([...TEST_SUITE_STEP_TYPES].sort());
  });
});
