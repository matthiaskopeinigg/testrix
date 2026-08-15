import { describe, expect, it } from 'vitest';

import { WELCOME_COLLECTION_TEMPLATES } from './welcome-collection-templates';

describe('WELCOME_COLLECTION_TEMPLATES', () => {
  it('includes REST, OAuth, GraphQL, and webhook starters', () => {
    expect(WELCOME_COLLECTION_TEMPLATES.map((t) => t.id)).toEqual([
      'rest-crud',
      'oauth-api',
      'graphql',
      'webhook-listener',
    ]);
    expect(WELCOME_COLLECTION_TEMPLATES.every((t) => t.requests.length > 0)).toBe(true);
  });
});
