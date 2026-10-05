import { describe, expect, it, vi } from 'vitest';

import { parseCollectionsFile, workspaceFootprintSchema } from './config-files';

const AT = '2026-01-01T00:00:00.000Z';

function folder(id: string, children: unknown[]): Record<string, unknown> {
  return { kind: 'folder', id, name: id, modifiedAt: AT, children };
}

function request(id: string): Record<string, unknown> {
  return { kind: 'http', id, name: id, method: 'GET', status: null, modifiedAt: AT };
}

describe('parseCollectionsFile', () => {
  it('parses a valid tree without reporting drops', () => {
    // Arrange
    const onDropped = vi.fn();

    // Act
    const file = parseCollectionsFile({ collections: [folder('root', [request('r1')])] }, onDropped);

    // Assert
    expect(file.collections).toHaveLength(1);
    expect(onDropped).not.toHaveBeenCalled();
  });

  it('keeps a folder and its valid children when one nested node is invalid', () => {
    // Arrange
    const onDropped = vi.fn();
    const broken = { kind: 'http', id: 'bad', name: 42 };

    // Act
    const file = parseCollectionsFile(
      { collections: [folder('root', [request('r1'), broken, folder('sub', [request('r2')])])] },
      onDropped,
    );

    // Assert
    const root = file.collections[0] as { id: string; children: { id: string }[] };
    expect(root.id).toBe('root');
    expect(root.children.map((child) => child.id)).toEqual(['r1', 'sub']);
    expect(onDropped).toHaveBeenCalledWith([expect.objectContaining({ id: 'bad' })]);
  });

  it('moves valid children up when their folder itself is invalid', () => {
    // Arrange
    const onDropped = vi.fn();
    const brokenFolder = { kind: 'folder', id: 'broken', children: [request('orphan')] };

    // Act
    const file = parseCollectionsFile({ collections: [brokenFolder, request('r1')] }, onDropped);

    // Assert
    expect(file.collections.map((node) => node.id)).toEqual(['orphan', 'r1']);
    expect(onDropped).toHaveBeenCalledWith([expect.objectContaining({ id: 'broken' })]);
  });

  it('returns an empty tree for non-object input', () => {
    expect(parseCollectionsFile(null).collections).toEqual([]);
    expect(parseCollectionsFile('nope').collections).toEqual([]);
  });
});

describe('workspaceFootprintSchema', () => {
  it('accepts a footprint DTO', () => {
    expect(
      workspaceFootprintSchema.parse({
        totalBytes: 12,
        historyEntries: 3,
        tabCount: 1,
        byCategory: { 'history.json': 12 },
      }),
    ).toEqual({
      totalBytes: 12,
      historyEntries: 3,
      tabCount: 1,
      byCategory: { 'history.json': 12 },
    });
  });
});
