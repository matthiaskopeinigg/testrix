import type { EnvironmentNode } from '@testrix/contracts';
import { isEnvironmentFolder } from '@testrix/contracts';
import { describe, expect, it } from 'vitest';

import { copyEnvironmentSelection, pasteEnvironmentNodes } from './environment-node-clipboard';

function variable(id: string, key: string, value: string): EnvironmentNode {
  return { kind: 'variable', id, key, value, enabled: true, secret: false, description: '' };
}

function folder(id: string, name: string, children: EnvironmentNode[] = [], collapsed = false): EnvironmentNode {
  return { kind: 'folder', id, name, children, description: '', collapsed };
}

describe('copyEnvironmentSelection', () => {
  it('copies selected variables and skips a child when its folder is selected', () => {
    const nodes = [
      variable('host', 'host', 'api.local'),
      folder('shared', 'Shared', [variable('region', 'region', 'eu')]),
    ];
    const copied = copyEnvironmentSelection(nodes, ['host', 'shared', 'region']);
    expect(copied.map((node) => node.id)).toEqual(['host', 'shared']);
    expect(copied[1] && isEnvironmentFolder(copied[1]) ? copied[1].children : []).toEqual([
      variable('region', 'region', 'eu'),
    ]);
  });
});

describe('pasteEnvironmentNodes', () => {
  it('pastes clones into another environment and keeps keys', () => {
    const source = [folder('shared', 'Shared', [variable('url', 'url', '{{baseUrl}}')])];
    const copied = copyEnvironmentSelection(source, ['shared']);
    const destination = [variable('base', 'baseUrl', 'https://api.test')];
    const pasted = pasteEnvironmentNodes(destination, copied, null);
    expect(pasted.ids).toHaveLength(1);
    expect(pasted.ids[0]).not.toBe('shared');
    const folderNode = pasted.nodes[1];
    expect(folderNode && isEnvironmentFolder(folderNode) ? folderNode.name : '').toBe('Shared');
    const child = folderNode && isEnvironmentFolder(folderNode) ? folderNode.children[0] : null;
    expect(child && !isEnvironmentFolder(child) ? child.key : '').toBe('url');
    expect(child && !isEnvironmentFolder(child) ? child.value : '').toBe('{{baseUrl}}');
    expect(child?.id).not.toBe('url');
    expect(destination).toEqual([variable('base', 'baseUrl', 'https://api.test')]);
  });

  it('pastes into a folder and expands it', () => {
    const destination = [folder('dest', 'Dest', [], true)];
    const pasted = pasteEnvironmentNodes(destination, [variable('url', 'url', 'https://api.test')], 'dest');
    const dest = pasted.nodes[0];
    expect(dest && isEnvironmentFolder(dest) ? dest.collapsed : true).toBe(false);
    expect(dest && isEnvironmentFolder(dest) ? dest.children : []).toHaveLength(1);
    expect(pasted.ids).toEqual(dest && isEnvironmentFolder(dest) ? dest.children.map((node) => node.id) : []);
  });
});
