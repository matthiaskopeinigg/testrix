import {
  createDefaultEnvironments,
  createDefaultEnvironmentsFile,
  environmentVariableMap,
  findEnabledEnvironmentVariableByKey,
  insertEnvironmentNode,
  isEnvironmentDescendant,
  isEnvironmentFolder,
  moveEnvironmentNode,
  parseEnvironmentsFile,
  type EnvironmentNode,
} from '@testrix/contracts';
import { describe, expect, it } from 'vitest';

import { moveByInsertIndex, moveManyByInsertIndex } from './environments-drop-model';

function variable(id: string, key: string, value: string, enabled = true): EnvironmentNode {
  return { kind: 'variable', id, key, value, enabled, secret: false, description: '' };
}

function folder(id: string, name: string, children: EnvironmentNode[] = []): EnvironmentNode {
  return { kind: 'folder', id, name, children, description: '', collapsed: false };
}

describe('EnvironmentsSidebarComponent (list)', () => {
  it('starts with no environments', () => {
    expect(createDefaultEnvironments()).toEqual([]);
    const file = createDefaultEnvironmentsFile();
    expect(file.items).toEqual([]);
    expect(file.activeId).toBeNull();
  });

  it('reorders the environment list by insert index', () => {
    const rows = [{ id: 'env-a' }, { id: 'env-b' }, { id: 'env-c' }];
    expect(moveByInsertIndex(rows, 'env-c', 0)?.map((row) => row.id)).toEqual(['env-c', 'env-a', 'env-b']);
    expect(moveManyByInsertIndex(rows, ['env-a', 'env-b'], 3)?.map((row) => row.id)).toEqual([
      'env-c',
      'env-a',
      'env-b',
    ]);
  });
});

describe('EnvironmentEditorComponent (variable tree)', () => {
  it('maps enabled variables and skips disabled ones', () => {
    const nodes: EnvironmentNode[] = [
      variable('v1', 'host', 'api.local'),
      variable('v2', 'token', 'secret', false),
      folder('f1', 'Shared', [variable('v3', 'region', 'eu')]),
    ];
    expect(environmentVariableMap(nodes)).toEqual({ host: 'api.local', region: 'eu' });
    expect(findEnabledEnvironmentVariableByKey(nodes, 'host')?.value).toBe('api.local');
    expect(findEnabledEnvironmentVariableByKey(nodes, 'token')).toBeNull();
  });

  it('last enabled duplicate key wins in the overlay map', () => {
    const nodes: EnvironmentNode[] = [
      variable('v1', 'host', 'first'),
      folder('f1', 'Overrides', [variable('v2', 'host', 'second')]),
    ];
    expect(environmentVariableMap(nodes)['host']).toBe('second');
  });

  it('blocks nesting a folder under its own descendant', () => {
    const nodes: EnvironmentNode[] = [
      folder('root', 'Root', [folder('child', 'Child', [variable('v1', 'a', '1')])]),
    ];
    expect(isEnvironmentDescendant(nodes, 'root', 'child')).toBe(true);
    expect(isEnvironmentDescendant(nodes, 'child', 'root')).toBe(false);
  });

  it('inserts and moves variables under folders', () => {
    const root = folder('root', 'Root');
    const withVar = insertEnvironmentNode([root], 'root', variable('v1', 'apiUrl', 'https://x.test'));
    expect(withVar[0] && isEnvironmentFolder(withVar[0]) && withVar[0].children).toHaveLength(1);
    const moved = moveEnvironmentNode(withVar, 'v1', null, 0);
    expect(moved?.some((node) => node.kind === 'variable' && node.id === 'v1')).toBe(true);
  });

  it('parses environments.json and keeps an explicit empty list', () => {
    const empty = parseEnvironmentsFile({ schemaVersion: 1, items: [], activeId: null, orderIds: [] });
    expect(empty.items).toEqual([]);
    expect(createDefaultEnvironmentsFile().items).toEqual([]);
  });
});
