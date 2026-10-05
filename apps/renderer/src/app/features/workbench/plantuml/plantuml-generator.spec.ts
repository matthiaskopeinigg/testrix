import { describe, expect, it, beforeEach } from 'vitest';

import {
  elseInsertBefore,
  detectBuilderKind,
  emptyModel,
  generatePlantuml,
  repairSequenceElse,
  resetPlantumlIdCounter,
  sequenceFromText,
  toFreeform,
} from './plantuml-generator';
import { PLANTUML_TEMPLATES, templatesForKind } from './plantuml-templates';

describe('generatePlantuml', () => {
  beforeEach(() => {
    resetPlantumlIdCounter();
  });

  it('emits a sequence diagram without skin settings', () => {
    const source = generatePlantuml(emptyModel('sequence', 'Demo'));
    expect(source).toContain('@startuml');
    expect(source).toContain('title Demo');
    expect(source).toContain('autonumber');
    expect(source).not.toContain('hide footbox');
    expect(source).toContain('participant "Client" as Client #magenta');
    expect(source).toContain('Client -> Server : request');
    expect(source).not.toContain('skinparam');
    expect(source).toContain('@enduml');
  });

  it('keeps a skinned sequence with an actor classified as a sequence', () => {
    const source = [
      '@startuml',
      'skinparam ActorBorderColor #5F6368',
      'skinparam ActivityBackgroundColor #2A2F3A',
      'actor "User" as Actor1',
      'participant "Gate" as Participant6',
      'Actor1 -> Participant6 : login',
      '@enduml',
    ].join('\n');
    expect(detectBuilderKind(source)).toBe('sequence');
  });

  it('writes a note across many lifelines as the two ends of the span', () => {
    const source = generatePlantuml({
      kind: 'sequence',
      title: 'Notes',
      autonumber: false,
      hideFootbox: true,
      participants: [
        { id: 'p1', name: 'Left', alias: 'Left' },
        { id: 'p2', name: 'Mid', alias: 'Mid' },
        { id: 'p3', name: 'Right', alias: 'Right' },
      ],
      steps: [
        { kind: 'note', id: 'n1', over: 'Right, Mid, Left', text: 'covers the row' },
      ],
    });
    expect(source).toContain('note over Left, Right');
    expect(source).not.toContain('note over Right, Mid, Left');
  });

  it('keeps an else inside its alt so PlantUML can create the group', () => {
    const source = generatePlantuml({
      kind: 'sequence',
      title: 'AA',
      autonumber: false,
      hideFootbox: true,
      participants: [
        { id: 'p1', name: 'TGate', alias: 'Participant6' },
        { id: 'p2', name: 'TFA', alias: 'Participant5' },
      ],
      steps: [
        {
          kind: 'message',
          id: 'm1',
          from: 'Participant6',
          to: 'Participant5',
          label: 'isTFAactive?',
          arrow: '->',
        },
        { kind: 'else', id: 'm2', label: 'a' },
        { kind: 'alt', id: 'm3', label: 'TFA active' },
        {
          kind: 'message',
          id: 'm4',
          from: 'Participant5',
          to: 'Participant6',
          label: 'yes',
          arrow: '->',
        },
        { kind: 'end', id: 'm5' },
      ],
    });
    const altAt = source.indexOf('alt TFA active');
    const elseAt = source.indexOf('else a');
    expect(altAt).toBeGreaterThan(-1);
    expect(elseAt).toBeGreaterThan(altAt);
    expect(source.indexOf('else a')).toBeLessThan(source.indexOf('Participant5 -> Participant6 : yes'));
  });

  it('inserts an else after the alt opener when the drop lands on the header', () => {
    const steps = [
      { id: 'alt', kind: 'alt' },
      { id: 'msg', kind: 'message' },
      { id: 'end', kind: 'end' },
    ];
    expect(elseInsertBefore(steps, 'alt')).toBe('msg');
    expect(elseInsertBefore(steps, 'msg')).toBe('msg');
    expect(elseInsertBefore(steps, 'end')).toBe('end');
    const moved = repairSequenceElse([
      { id: 'else', kind: 'else' },
      { id: 'alt', kind: 'alt' },
      { id: 'end', kind: 'end' },
    ]);
    expect(moved.map((step) => step.id)).toEqual(['alt', 'else', 'end']);
  });

  it('emits class members and relations', () => {
    const source = generatePlantuml({
      kind: 'class',
      title: 'Types',
      classes: [{ id: 'c1', name: 'User', stereotype: 'entity', members: '+id: string\n+name: string' }],
      relations: [{ id: 'r1', from: 'Order', to: 'User', kind: 'association', label: 'buyer' }],
    });
    expect(source).toContain('class User <<entity>> {');
    expect(source).toContain('+id: string');
    expect(source).toContain('Order --> User : buyer');
  });

  it('builds activity control flow', () => {
    const source = generatePlantuml(emptyModel('activity'));
    expect(source).toContain('start');
    expect(source).toContain('if (Valid?) then (yes)');
    expect(source).toContain('endif');
    expect(source).toContain('stop');
  });

  it('wraps freeform source when @startuml is missing', () => {
    const source = generatePlantuml({
      kind: 'freeform',
      title: 'Raw',
      source: 'A -> B : hi',
    });
    expect(source).toContain('@startuml');
    expect(source).toContain('A -> B : hi');
  });
});

describe('sequenceFromText', () => {
  beforeEach(() => {
    resetPlantumlIdCounter();
  });

  it('parses arrow lines into participants and steps', () => {
    const model = sequenceFromText('Client -> API: login\nAPI --> Client: token');
    expect(model.participants.map((item) => item.alias)).toEqual(['Client', 'API']);
    expect(model.steps).toHaveLength(2);
    expect(model.steps[0]?.kind).toBe('message');
    if (model.steps[0]?.kind === 'message')
      expect(model.steps[0].label).toBe('login');
    if (model.steps[1]?.kind === 'message')
      expect(model.steps[1].arrow).toBe('-->');
    const source = generatePlantuml(model);
    expect(source).toContain('Client -> API : login');
  });

  it('parses verb phrases', () => {
    const model = sequenceFromText('Gateway calls Auth\nAuth returns Gateway');
    expect(model.steps[0]?.kind).toBe('message');
    if (model.steps[0]?.kind === 'message') {
      expect(model.steps[0].from).toBe('Gateway');
      expect(model.steps[0].to).toBe('Auth');
    }
    if (model.steps[1]?.kind === 'message')
      expect(model.steps[1].arrow).toBe('-->');
  });
});

describe('templates', () => {
  beforeEach(() => {
    resetPlantumlIdCounter();
  });

  it('covers every visual kind', () => {
    const kinds = new Set(PLANTUML_TEMPLATES.map((item) => item.kind));
    expect([...kinds].sort()).toEqual(['activity', 'class', 'sequence']);
  });

  it('ships complex sequence starters as builder models only', () => {
    const ids = [
      'sequence-device-approval',
      'sequence-token-polling',
      'sequence-checkout',
    ];
    const banned = ['ciba', 'oneweb', 't-key', 't-gate', 'oneapp'];
    for (const id of ids) {
      const model = PLANTUML_TEMPLATES.find((item) => item.id === id)?.create();
      expect(model?.kind).toBe('sequence');
      if (model?.kind !== 'sequence')
        continue;
      expect(model.participants.length).toBeGreaterThan(2);
      expect(model.steps.length).toBeGreaterThan(4);
      const source = generatePlantuml(model);
      expect(source).toContain('@startuml');
      const lower = source.toLowerCase();
      for (const term of banned)
        expect(lower).not.toContain(term);
    }
  });

  it('excludes banned product strings from generic template sources', () => {
    const banned = ['ciba', 'oneweb', 't-key', 't-gate', 'oneapp'];
    for (const template of PLANTUML_TEMPLATES) {
      const source = generatePlantuml(template.create()).toLowerCase();
      for (const term of banned)
        expect(source).not.toContain(term);
    }
  });

  it('produces valid source for each starter', () => {
    for (const template of PLANTUML_TEMPLATES) {
      const source = generatePlantuml(template.create());
      expect(source.startsWith('@startuml')).toBe(true);
      expect(source.endsWith('@enduml')).toBe(true);
    }
  });

  it('filters templates by kind', () => {
    expect(templatesForKind('sequence').every((item) => item.kind === 'sequence')).toBe(true);
  });

  it('converts a model to editable freeform source', () => {
    const free = toFreeform(emptyModel('sequence', 'X'));
    expect(free.kind).toBe('freeform');
    expect(free.source).toContain('title X');
  });
});
