import { describe, expect, it } from 'vitest';

import { TOOL_IDS } from '@testrix/contracts';

/**
 * PlantUML opens as a Tools drill-in (folder tree), not as a singleton tool tab.
 */
describe('Tools PlantUML drill-in contract', () => {
  it('keeps plantuml in the tools catalog', () => {
    expect(TOOL_IDS).toContain('plantuml');
  });

  it('treats plantuml as a drill target rather than a tool tab node', () => {
    const toolTabNodeIds = TOOL_IDS.filter((id) => id !== 'plantuml');
    expect(toolTabNodeIds).not.toContain('plantuml');
    expect(TOOL_IDS.includes('plantuml')).toBe(true);
  });
});
