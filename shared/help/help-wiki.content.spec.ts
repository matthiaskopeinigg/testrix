import { describe, expect, it } from 'vitest';

import { HELP_WIKI_CATALOG, HELP_WIKI_SECTIONS } from './help-wiki.catalog';
import { HELP_WIKI_SECTION_IDS } from './help-wiki.manifest';
import { helpWikiSectionSchema } from './help-wiki.schema';

describe('help wiki catalog', () => {
  it('includes every manifest section id exactly once', () => {
    const ids = HELP_WIKI_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const requiredId of HELP_WIKI_SECTION_IDS) {
      expect(ids).toContain(requiredId);
    }
    expect(ids.length).toBe(HELP_WIKI_SECTION_IDS.length);
  });

  it('parses the full catalog', () => {
    expect(HELP_WIKI_CATALOG.sections.length).toBeGreaterThan(0);
    expect(HELP_WIKI_CATALOG.groups.length).toBe(8);
  });

  it('validates each section against the schema', () => {
    for (const section of HELP_WIKI_SECTIONS) {
      expect(helpWikiSectionSchema.safeParse(section).success).toBe(true);
    }
  });
});
