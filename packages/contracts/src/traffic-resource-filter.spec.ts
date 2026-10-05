import { describe, expect, it } from 'vitest';

import { classifyTrafficResource } from './traffic-resource-filter';

describe('classifyTrafficResource', () => {
  it('maps CDP types onto Chrome Network filters', () => {
    expect(classifyTrafficResource(entry({ resourceType: 'XHR' }))).toBe('fetch');
    expect(classifyTrafficResource(entry({ resourceType: 'Fetch' }))).toBe('fetch');
    expect(classifyTrafficResource(entry({ resourceType: 'Document' }))).toBe('doc');
    expect(classifyTrafficResource(entry({ resourceType: 'Stylesheet' }))).toBe('css');
    expect(classifyTrafficResource(entry({ resourceType: 'Script' }))).toBe('js');
    expect(classifyTrafficResource(entry({ resourceType: 'Font' }))).toBe('font');
    expect(classifyTrafficResource(entry({ resourceType: 'Image' }))).toBe('img');
    expect(classifyTrafficResource(entry({ resourceType: 'Media' }))).toBe('media');
    expect(classifyTrafficResource(entry({ resourceType: 'Manifest' }))).toBe('manifest');
    expect(classifyTrafficResource(entry({ resourceType: 'WebSocket' }))).toBe('ws');
    expect(classifyTrafficResource(entry({ resourceType: 'Other' }))).toBe('other');
  });

  it('infers wasm and fetch from mime or URL when CDP type is missing', () => {
    expect(classifyTrafficResource(entry({ url: 'https://app.example/app.wasm' }))).toBe('wasm');
    expect(
      classifyTrafficResource(
        entry({
          responseHeaders: [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }],
        }),
      ),
    ).toBe('fetch');
    expect(classifyTrafficResource(entry({ method: 'OPTIONS', url: 'https://api.example/x' }))).toBe('fetch');
  });
});

function entry(partial: {
  readonly method?: string;
  readonly url?: string;
  readonly resourceType?: string;
  readonly responseHeaders?: readonly { readonly key: string; readonly value: string }[];
}) {
  return {
    method: partial.method ?? 'GET',
    url: partial.url ?? 'https://example.com/',
    resourceType: partial.resourceType,
    responseHeaders: partial.responseHeaders ?? [],
  };
}
