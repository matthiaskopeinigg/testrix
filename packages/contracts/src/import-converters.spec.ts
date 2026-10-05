import { describe, expect, it } from 'vitest';

import { convertBrunoCollection } from './import-bruno';
import { convertOpenApi } from './import-openapi';
import { convertPostmanCollectionV21, convertPostmanEnvironment } from './import-postman';

describe('import converters', () => {
  it('converts a minimal Postman collection into a request tree', () => {
    const raw = {
      info: {
        name: 'Sample API',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: [
        {
          name: 'List items',
          request: {
            method: 'GET',
            url: 'https://example.com/items',
          },
        },
      ],
    };
    const result = convertPostmanCollectionV21(raw);
    expect(result.name).toBe('Sample API');
    expect(result.tree).toHaveLength(1);
    expect(result.tree[0]?.kind).toBe('http');
    if (result.tree[0]?.kind !== 'http')
      return;
    expect(result.tree[0].method).toBe('GET');
    expect(result.tree[0].config.url).toBe('https://example.com/items');
  });

  it('converts a Postman environment export into variables', () => {
    const raw = {
      name: 'Local',
      values: [
        { key: 'baseUrl', value: 'http://127.0.0.1:8080', enabled: true, type: 'default' },
        { key: 'token', value: 'secret', enabled: true, type: 'secret' },
      ],
    };
    const result = convertPostmanEnvironment(raw);
    expect(result.environment.name).toBe('Local');
    expect(result.environment.variables).toHaveLength(2);
    expect(result.environment.variables[1]?.secret).toBe(true);
  });

  it('converts Bruno .bru content into a collection tree', () => {
    const bru = `meta {
  name: Health
}

get {
  url: https://example.com/health
}
`;
    const result = convertBrunoCollection(bru);
    expect(result.tree).toHaveLength(1);
    expect(result.tree[0]?.kind).toBe('http');
    if (result.tree[0]?.kind !== 'http')
      return;
    expect(result.tree[0].name).toBe('Health');
    expect(result.tree[0].method).toBe('GET');
  });

  it('converts a minimal OpenAPI document into HTTP nodes', () => {
    const raw = {
      openapi: '3.0.3',
      info: { title: 'Pet Store', version: '1.0.0' },
      paths: {
        '/pets': {
          get: { summary: 'List pets' },
          post: { summary: 'Create pet' },
        },
      },
    };
    const result = convertOpenApi(raw);
    expect(result.tree.length).toBeGreaterThan(0);
    const methods: string[] = [];
    const walk = (nodes: typeof result.tree): void => {
      for (const node of nodes) {
        if (node.kind === 'http') {
          methods.push(node.method);
          continue;
        }
        walk(node.children);
      }
    };
    walk(result.tree);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
  });
});

describe('isImportableDropName', () => {
  it('accepts known import extensions and folders', async () => {
    const {
      areImportableDropNames,
      assessDropImportability,
      isImportableDropMime,
      isImportableDropName,
    } = await import('./import-detect');
    expect(isImportableDropName('pack.testrix')).toBe(true);
    expect(isImportableDropName('api.json')).toBe(true);
    expect(isImportableDropName('spec.yaml')).toBe(true);
    expect(isImportableDropName('request.bru')).toBe(true);
    expect(isImportableDropName('BrunoCollection')).toBe(true);
    expect(isImportableDropName('notes.txt')).toBe(false);
    expect(isImportableDropName('photo.png')).toBe(false);
    expect(isImportableDropName('clip.mp4')).toBe(false);
    expect(areImportableDropNames(['a.json', 'b.yml'])).toBe(true);
    expect(areImportableDropNames(['a.json', 'b.png'])).toBe(false);
    expect(areImportableDropNames([])).toBe(true);
    expect(isImportableDropMime('video/mp4')).toBe(false);
    expect(isImportableDropMime('image/png')).toBe(false);
    expect(isImportableDropMime('application/json')).toBeNull();
    expect(assessDropImportability({ mimes: ['video/mp4'] }).valid).toBe(false);
    expect(assessDropImportability({ names: ['demo.mp4'] }).valid).toBe(false);
    expect(assessDropImportability({ names: ['api.json'] }).valid).toBe(true);
    expect(assessDropImportability({}).valid).toBeNull();
  });
});
