import { describe, expect, it } from 'vitest';

import { createDefaultCollectionRequestSettings } from '@shared/config';

import { COLLECTION_TREE_MOCK } from './collection-tree.mock';
import {
  collectCollectionNodeIdsForDeletion,
  createCollectionNode,
  deleteCollectionNode,
  duplicateCollectionNode,
  renameCollectionNode,
  setCollectionFolderDescription,
  setCollectionRequestDescription,
  updateCollectionFolderSettings,
  updateCollectionRequestLine,
  updateCollectionRequestSettings,
} from './collection-tree.mutations';

import type { CollectionTreeNode } from './collection-tree.types';

describe('collection-tree.mutations', () => {
  it('creates a folder at root', () => {
    const result = createCollectionNode(COLLECTION_TREE_MOCK, null, 'folder', 'Root folder');
    expect(result?.nodeId).toBeTruthy();
    expect(result?.nodes.some((n) => n.label === 'Root folder')).toBe(true);
  });

  it('renames a node', () => {
    const next = renameCollectionNode(COLLECTION_TREE_MOCK, 'req-login', 'POST /sign-in');
    expect(collectLabels(next ?? [])).toContain('POST /sign-in');
  });

  it('deletes a node', () => {
    const next = deleteCollectionNode(COLLECTION_TREE_MOCK, 'req-login');
    expect(collectLabels(next ?? [])).not.toContain('POST /login');
  });

  it('collects descendant ids for tab cleanup when deleting a folder', () => {
    const ids = collectCollectionNodeIdsForDeletion(COLLECTION_TREE_MOCK, 'folder-auth');
    expect(ids).toContain('folder-auth');
    expect(ids).toContain('req-login');
  });

  it('duplicates a request with copy suffix', () => {
    const result = duplicateCollectionNode(COLLECTION_TREE_MOCK, 'req-login');
    expect(collectLabels(result?.nodes ?? []).filter((l) => l.includes('(copy)')).length).toBe(1);
  });

  it('patches folder settings', () => {
    const next = updateCollectionFolderSettings(COLLECTION_TREE_MOCK, 'folder-auth', {
      auth: { type: 'bearer', token: 'tok' },
    });
    const folder = findFolder(next ?? [], 'folder-auth');
    expect(folder?.data?.settings?.auth).toEqual({ type: 'bearer', token: 'tok' });
  });

  it('syncs folder tags on settings patch', () => {
    const next = updateCollectionFolderSettings(COLLECTION_TREE_MOCK, 'folder-auth', {
      tags: ['shared'],
    });
    const folder = findFolder(next ?? [], 'folder-auth');
    expect(folder?.tags).toEqual(['shared']);
  });

  it('sets folder description', () => {
    const next = setCollectionFolderDescription(COLLECTION_TREE_MOCK, 'folder-auth', 'Auth flows');
    const folder = findFolder(next ?? [], 'folder-auth');
    expect(folder?.data?.description).toBe('Auth flows');
    expect(folder?.subtitle).toBe('Auth flows');
  });

  it('patches request settings', () => {
    const next = updateCollectionRequestSettings(COLLECTION_TREE_MOCK, 'req-login', {
      body: { mode: 'json', raw: '{}' },
    });
    const req = findRequest(next ?? [], 'req-login');
    expect(req?.data?.requestSettings?.body).toEqual({ mode: 'json', raw: '{}' });
  });

  it('syncs request tags on settings patch', () => {
    const next = updateCollectionRequestSettings(COLLECTION_TREE_MOCK, 'req-login', {
      tags: ['auth'],
    });
    const req = findRequest(next ?? [], 'req-login');
    expect(req?.tags).toEqual(['auth']);
  });

  it('updates request line and description', () => {
    const line = updateCollectionRequestLine(COLLECTION_TREE_MOCK, 'req-login', {
      method: 'PUT',
      url: '/sign-in',
    });
    const withDesc = setCollectionRequestDescription(line ?? [], 'req-login', 'Sign in');
    const req = findRequest(withDesc ?? [], 'req-login');
    expect(req?.data?.method).toBe('PUT');
    expect(req?.data?.url).toBe('/sign-in');
    expect(req?.data?.description).toBe('Sign in');
    expect(req?.subtitle).toBe('Sign in');
  });

  it('seeds default settings on new request', () => {
    const result = createCollectionNode(COLLECTION_TREE_MOCK, 'folder-auth', 'request', 'GET /x');
    const req = findRequest(result?.nodes ?? [], result?.nodeId ?? '');
    expect(req?.data?.requestSettings).toEqual(createDefaultCollectionRequestSettings());
  });

  it('clears folder description when empty', () => {
    const withDesc = setCollectionFolderDescription(COLLECTION_TREE_MOCK, 'folder-auth', 'Note');
    const next = setCollectionFolderDescription(withDesc ?? [], 'folder-auth', '   ');
    const folder = findFolder(next ?? [], 'folder-auth');
    expect(folder?.data?.description).toBeUndefined();
    expect(folder?.subtitle).toBeUndefined();
  });
});

function findRequest(nodes: readonly CollectionTreeNode[], id: string): CollectionTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children?.length) {
      const found = findRequest(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function findFolder(nodes: readonly CollectionTreeNode[], id: string): CollectionTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children?.length) {
      const found = findFolder(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function collectLabels(nodes: readonly CollectionTreeNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    out.push(node.label);
    if (node.children?.length) {
      out.push(...collectLabels(node.children));
    }
  }
  return out;
}
