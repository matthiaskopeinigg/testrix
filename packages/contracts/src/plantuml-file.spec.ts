import { describe, expect, it } from 'vitest';

import {
  collectPlantumlArtifactIds,
  emptyPlantumlArtifact,
  parsePlantumlFile,
} from './plantuml-file';

describe('parsePlantumlFile', () => {
  it('returns empty items for junk', () => {
    expect(parsePlantumlFile(null).items).toEqual([]);
  });

  it('keeps artifact fields', () => {
    const file = parsePlantumlFile({
      items: [
        {
          kind: 'artifact',
          id: 'd1',
          name: 'Demo',
          updatedAt: '2026-01-01T00:00:00.000Z',
          diagramKind: 'sequence',
          source: '@startuml\nA -> B\n@enduml',
          builderJson: null,
        },
      ],
    });
    expect(file.items).toHaveLength(1);
    const item = file.items[0];
    expect(item?.kind).toBe('artifact');
    if (item?.kind === 'artifact') {
      expect(item.source).toContain('A -> B');
      expect(item.diagramKind).toBe('sequence');
    }
  });
});

describe('emptyPlantumlArtifact', () => {
  it('creates a sequence artifact', () => {
    const node = emptyPlantumlArtifact('X');
    expect(node.kind).toBe('artifact');
    expect(node.name).toBe('X');
    expect(node.diagramKind).toBe('sequence');
    expect(node.source).toContain('@startuml');
  });
});

describe('collectPlantumlArtifactIds', () => {
  it('walks folders', () => {
    const ids = collectPlantumlArtifactIds([
      {
        kind: 'folder',
        id: 'f1',
        name: 'Folder',
        updatedAt: '2026-01-01T00:00:00.000Z',
        children: [emptyPlantumlArtifact('Inner')],
      },
    ]);
    expect(ids.size).toBe(1);
  });
});
