import { describe, expect, it } from 'vitest';

import { DEVELOPMENT_TOOL_IDS } from './development-tool.schema';
import {
  createDefaultWorkspaceDevelopment,
  mergeWorkspaceDevelopment,
  workspaceDevelopmentSchema,
} from './development-session.schema';

describe('development-session.schema', () => {
  it('creates defaults for all tools', () => {
    const state = createDefaultWorkspaceDevelopment();
    expect(Object.keys(state.tools)).toHaveLength(DEVELOPMENT_TOOL_IDS.length);
    expect(workspaceDevelopmentSchema.safeParse(state).success).toBe(true);
    expect(state.tools.jwt.profiles.length).toBeGreaterThan(0);
    expect(state.tools.jwt.mode).toBe('decode');
  });

  it('mergeWorkspaceDevelopment fills missing tool keys', () => {
    const defaults = createDefaultWorkspaceDevelopment();
    const merged = mergeWorkspaceDevelopment(undefined, {
      tools: { base64: { input: 'x' } },
    });
    expect(merged.tools.base64.input).toBe('x');
    expect(merged.tools.regex.sample).toBe(defaults.tools.regex.sample);
  });

  it('migrates legacy jwt encode/verify modes', () => {
    const parsed = workspaceDevelopmentSchema.parse({
      tools: {
        ...createDefaultWorkspaceDevelopment().tools,
        jwt: { mode: 'encode', token: 'abc' },
      },
    });
    expect(parsed.tools.jwt.mode).toBe('generate');

    const verified = workspaceDevelopmentSchema.parse({
      tools: {
        ...createDefaultWorkspaceDevelopment().tools,
        jwt: { mode: 'verify' },
      },
    });
    expect(verified.tools.jwt.mode).toBe('validate');
  });
});
