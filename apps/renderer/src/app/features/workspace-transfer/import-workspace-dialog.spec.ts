import { describe, expect, it } from 'vitest';

import { summarizeImportWarnings } from './import-workspace-warnings';

describe('summarizeImportWarnings', () => {
  it('collapses repeated Postman script warnings', () => {
    const groups = summarizeImportWarnings([
      'Postman scripts on "Create a collection" were not imported.',
      'Postman scripts on "Get a collection" were not imported.',
      'Postman scripts on "Delete a collection" were not imported.',
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.summary).toBe('Postman scripts on 3 requests were not imported.');
    expect(groups[0]?.details).toEqual([
      'Create a collection',
      'Get a collection',
      'Delete a collection',
    ]);
  });

  it('keeps unrelated warnings separate', () => {
    const groups = summarizeImportWarnings([
      'Postman scripts on "Health" were not imported.',
      'Unsupported Postman auth type "oauth2" on a request; auth was not imported.',
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.summary).toContain('Health');
    expect(groups[0]?.details).toEqual([]);
    expect(groups[1]?.summary).toContain('oauth2');
  });
});
