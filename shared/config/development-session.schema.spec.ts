import { describe, expect, it } from 'vitest';

import {
  createDefaultWorkspaceDevelopment,
  mergeWorkspaceDevelopment,
  workspaceDevelopmentSchema,
} from './development-session.schema';

describe('development-session.schema', () => {
  it('creates defaults for all tools', () => {
    const state = createDefaultWorkspaceDevelopment();
    expect(Object.keys(state.tools)).toHaveLength(9);
    expect(workspaceDevelopmentSchema.safeParse(state).success).toBe(true);
  });

  it('mergeWorkspaceDevelopment fills missing tool keys', () => {
    const defaults = createDefaultWorkspaceDevelopment();
    const merged = mergeWorkspaceDevelopment(undefined, {
      tools: { base64: { input: 'x' } },
    });
    expect(merged.tools.base64.input).toBe('x');
    expect(merged.tools.regex.sample).toBe(defaults.tools.regex.sample);
  });
});
