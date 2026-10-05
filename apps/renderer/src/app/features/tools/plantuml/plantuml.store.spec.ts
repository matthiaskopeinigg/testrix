import { describe, expect, it } from 'vitest';

import {
  collectPlantumlArtifactIds,
  emptyPlantumlArtifact,
  parsePlantumlFile,
  type PlantumlNode,
} from '@testrix/contracts';
import { filterPlantumlTree, sortPlantumlTree } from './plantuml-tree';

import { PLANTUML_TEMPLATES } from '../../workbench/plantuml/plantuml-templates';
import { generatePlantuml } from '../../workbench/plantuml/plantuml-generator';

describe('PlantUML persistence helpers', () => {
  it('parses plantuml.json trees', () => {
    const file = parsePlantumlFile({
      items: [emptyPlantumlArtifact('A')],
    });
    expect(collectPlantumlArtifactIds(file.items).size).toBe(1);
  });
});

describe('PlantUML sidebar tree', () => {
  const sequence = { ...emptyPlantumlArtifact('Zebra', 'sequence'), id: 'z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const activity = { ...emptyPlantumlArtifact('Alpha', 'activity'), id: 'a', updatedAt: '2026-03-01T00:00:00.000Z' };
  const folder: PlantumlNode = {
    kind: 'folder',
    id: 'f',
    name: 'Notes',
    updatedAt: '2026-02-01T00:00:00.000Z',
    children: [sequence],
  };

  it('filters by diagram type and keeps the parent folder', () => {
    const visible = filterPlantumlTree([folder, activity], ['sequence'], '');
    expect(visible.map((node) => node.id)).toEqual(['f']);
    expect(visible[0]?.kind === 'folder' ? visible[0].children.map((node) => node.id) : []).toEqual(['z']);
  });

  it('sorts folders first, then by name', () => {
    const sorted = sortPlantumlTree([activity, folder], 'name-asc');
    expect(sorted.map((node) => node.id)).toEqual(['f', 'a']);
  });

  it('sorts diagrams by most recently modified', () => {
    const sorted = sortPlantumlTree([sequence, activity], 'modified-desc');
    expect(sorted.map((node) => node.id)).toEqual(['a', 'z']);
  });
});

describe('PlantUML scratch templates', () => {
  const bannedProducts = ['ciba', 'oneweb', 't-key', 't-gate', 'oneapp'];

  it('keeps every starter editable in the builder', () => {
    for (const template of PLANTUML_TEMPLATES) {
      const model = template.create();
      expect(model.kind).not.toBe('freeform');
      expect(model.kind).toBe(template.kind);
    }
  });

  it('keeps starter sources free of banned product strings', () => {
    for (const template of PLANTUML_TEMPLATES) {
      const source = generatePlantuml(template.create()).toLowerCase();
      for (const term of bannedProducts)
        expect(source).not.toContain(term);
    }
  });

  it('registers device-approval and checkout starters', () => {
    expect(PLANTUML_TEMPLATES.some((item) => item.id === 'sequence-device-approval')).toBe(true);
    expect(PLANTUML_TEMPLATES.some((item) => item.id === 'sequence-checkout')).toBe(true);
  });
});
