import { describe, expect, it } from 'vitest';

import { createDefaultCollectionRequestSettings } from '../config/collection-request-settings.schema';
import {
  buildRequestCodeSnippetInput,
  generateRequestCodeSnippet,
} from './request-code-snippets';

describe('request-code-snippets', () => {
  it('builds curl for GET with bearer auth', () => {
    const input = buildRequestCodeSnippetInput({
      method: 'GET',
      urlPath: '/users',
      queryParams: [],
      resolvedHeaders: [],
      body: { mode: 'none' },
      auth: { type: 'bearer', token: 'secret' },
      contentTypeHint: null,
    });

    const curl = generateRequestCodeSnippet(input, 'curl');
    expect(curl).toContain("curl");
    expect(curl).toContain("'/users'");
    expect(curl).toContain('Authorization: Bearer secret');
  });

  it('includes JSON body in python snippet', () => {
    const defaults = createDefaultCollectionRequestSettings();
    const input = buildRequestCodeSnippetInput({
      method: 'POST',
      urlPath: 'https://api.example.com/items',
      queryParams: [],
      resolvedHeaders: [],
      body: { mode: 'json', raw: '{"name":"test"}' },
      auth: defaults.auth,
      contentTypeHint: 'application/json',
    });

    const python = generateRequestCodeSnippet(input, 'python');
    expect(python).toContain('requests.post');
    expect(python).toContain('\\"name\\":\\"test\\"');
    expect(python).toContain('Content-Type');
  });
});
