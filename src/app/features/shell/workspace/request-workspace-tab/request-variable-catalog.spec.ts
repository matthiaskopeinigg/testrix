import { describe, expect, it } from 'vitest';

import { highlightTemplateVariables } from '@shared/dynamic-variables';

import { buildCollectionVariableCatalog } from './request-variable-catalog';

describe('buildCollectionVariableCatalog', () => {
  it('treats ancestor folder keys as known {{placeholders}}', () => {
    const catalog = buildCollectionVariableCatalog(null, undefined, ['scriptKey'], ['test']);
    const folderItem = catalog.find((entry) => entry.insert === '{{test}}');
    const sessionItem = catalog.find((entry) => entry.insert === '{{scriptKey}}');

    expect(folderItem?.detail).toBe('Folder variable');
    expect(sessionItem?.detail).toBe('Session (from scripts)');
    expect(highlightTemplateVariables('https://shop.example/{{test}}', catalog)).not.toContain(
      'tx-var-token--unknown',
    );
  });

  it('keeps environment keys over folder keys with the same name', () => {
    const environment = {
      id: 'env-1',
      name: 'Dev',
      nodes: [{ kind: 'variable' as const, id: 'v1', key: 'test', value: 'from-env' }],
    };
    const catalog = buildCollectionVariableCatalog(environment, undefined, [], ['test']);
    const item = catalog.find((entry) => entry.insert === '{{test}}');
    expect(item?.id).toBe('env:test');
    expect(item?.detail).toBe('Dev');
  });
});
