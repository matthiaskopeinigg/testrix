import { describe, expect, it } from 'vitest';

import { DEVELOPMENT_TOOL_IDS } from '@shared/config';

import { DEVELOPMENT_TOOLS, findDevelopmentTool, isDevelopmentToolId } from './development-tool.registry';

describe('development-tool.registry', () => {
  it('lists every canonical tool id once', () => {
    const ids = DEVELOPMENT_TOOLS.map((tool) => tool.id);
    expect(ids).toHaveLength(DEVELOPMENT_TOOL_IDS.length);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of DEVELOPMENT_TOOL_IDS) {
      expect(ids).toContain(id);
    }
  });

  it('findDevelopmentTool returns a definition for known ids', () => {
    const tool = findDevelopmentTool('uuid-generator');
    expect(tool?.label).toBe('UUID Generator');
    expect(isDevelopmentToolId('jwt')).toBe(true);
    expect(isDevelopmentToolId('missing')).toBe(false);
  });
});
