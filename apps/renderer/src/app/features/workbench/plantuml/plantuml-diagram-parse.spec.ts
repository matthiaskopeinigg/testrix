import { beforeEach, describe, expect, it } from 'vitest';

import { activityIndexAt, activityRestIndex, deleteActivityStep, insertActivitySteps, moveActivityStep, ACTIVITY_ORIGIN, ACTIVITY_PITCH } from './plantuml-activity-edit';
import { parseEmittedDiagram } from './plantuml-diagram-parse';
import {
  generatePlantuml,
  resetPlantumlIdCounter,
  type ActivityModel,
  type ActivityStep,
  type ClassModel,
  type ComponentModel,
  type StateModel,
  type UseCaseModel,
} from './plantuml-generator';

describe('parseEmittedDiagram', () => {
  beforeEach(() => {
    resetPlantumlIdCounter();
  });

  it('round trips a class diagram and keeps positions out of the source', () => {
    const model: ClassModel = {
      kind: 'class',
      title: 'Types',
      classes: [
        { id: 'c1', name: 'User', stereotype: 'entity', members: '+id: string\n+name: string', x: 321, y: 654 },
        { id: 'c2', name: 'Order', stereotype: '', members: '' },
      ],
      relations: [
        { id: 'r1', from: 'Order', to: 'User', kind: 'association', label: 'buyer' },
        { id: 'r2', from: 'Order', to: 'User', kind: 'composition', label: '' },
      ],
    };
    const source = generatePlantuml(model);
    expect(source).not.toContain('321');
    expect(source).not.toContain('654');
    const parsed = parseEmittedDiagram(source, 'Types', 'class');
    expect(parsed?.kind).toBe('class');
    if (parsed?.kind !== 'class')
      return;
    expect(parsed.classes.map((item) => item.name)).toEqual(['User', 'Order']);
    expect(parsed.classes[0]).toMatchObject({ stereotype: 'entity', members: '+id: string\n+name: string' });
    expect(parsed.classes[0]?.x).toBeUndefined();
    expect(parsed.relations.map((item) => ({ from: item.from, to: item.to, kind: item.kind, label: item.label }))).toEqual([
      { from: 'Order', to: 'User', kind: 'association', label: 'buyer' },
      { from: 'Order', to: 'User', kind: 'composition', label: '' },
    ]);
    expect(generatePlantuml({ ...parsed, classes: parsed.classes.map(({ id: _id, ...item }) => ({ ...item, id: 'x' })) })).toContain('class User <<entity>> {');
  });

  it('round trips an activity diagram', () => {
    const model: ActivityModel = {
      kind: 'activity',
      title: 'Flow',
      steps: [
        { id: 'a1', label: '', kind: 'start' },
        { id: 'a2', label: 'Receive request', kind: 'action' },
        { id: 'a3', label: 'Valid?', kind: 'if' },
        { id: 'a4', label: 'Process', kind: 'action' },
        { id: 'a5', label: '', kind: 'endif' },
        { id: 'a6', label: '', kind: 'fork' },
        { id: 'a7', label: 'Pack', kind: 'action' },
        { id: 'a8', label: '', kind: 'endfork' },
        { id: 'a9', label: '', kind: 'stop' },
      ],
    };
    const parsed = parseEmittedDiagram(generatePlantuml(model), 'Flow', 'activity');
    expect(shape(parsed)).toEqual(shape(model));
  });

  it('round trips a use case diagram', () => {
    const model: UseCaseModel = {
      kind: 'usecase',
      title: 'Cases',
      actors: [{ id: 'actor_User', name: 'User' }],
      useCases: [
        { id: 'uc_SignIn', name: 'Sign in' },
        { id: 'uc_Reset', name: 'Reset password' },
      ],
      links: [
        { id: 'l1', from: 'actor_User', to: 'uc_SignIn', kind: 'assoc' },
        { id: 'l2', from: 'uc_Reset', to: 'uc_SignIn', kind: 'include' },
        { id: 'l3', from: 'uc_Reset', to: 'uc_SignIn', kind: 'extend' },
      ],
    };
    const source = generatePlantuml(model);
    const parsed = parseEmittedDiagram(source, 'Cases', 'usecase');
    expect(parsed?.kind).toBe('usecase');
    if (parsed?.kind !== 'usecase')
      return;
    expect(parsed.actors.map((item) => item.name)).toEqual(['User']);
    expect(parsed.useCases.map((item) => item.name)).toEqual(['Sign in', 'Reset password']);
    expect(parsed.links.map((item) => item.kind)).toEqual(['assoc', 'include', 'extend']);
    expect(generatePlantuml(parsed)).toBe(source);
  });

  it('round trips a component diagram', () => {
    const model: ComponentModel = {
      kind: 'component',
      title: 'Parts',
      components: [
        { id: 'cmp_App', name: 'App', stereotype: 'ui' },
        { id: 'cmp_API', name: 'API', stereotype: '' },
      ],
      links: [{ id: 'l1', from: 'cmp_App', to: 'cmp_API', label: 'HTTP' }],
    };
    const source = generatePlantuml(model);
    const parsed = parseEmittedDiagram(source, 'Parts', 'component');
    expect(parsed?.kind).toBe('component');
    if (parsed?.kind !== 'component')
      return;
    expect(parsed.components[0]).toMatchObject({ name: 'App', stereotype: 'ui' });
    expect(parsed.links[0]).toMatchObject({ from: 'cmp_App', to: 'cmp_API', label: 'HTTP' });
    expect(generatePlantuml(parsed)).toBe(source);
  });

  it('round trips a state diagram', () => {
    const model: StateModel = {
      kind: 'state',
      title: 'Lifecycle',
      states: [
        { id: 'st_Idle', name: 'Idle' },
        { id: 'st_Active', name: 'Active' },
      ],
      transitions: [{ id: 't1', from: 'st_Idle', to: 'st_Active', label: 'start' }],
    };
    const source = generatePlantuml(model);
    const parsed = parseEmittedDiagram(source, 'Lifecycle', 'state');
    expect(parsed?.kind).toBe('state');
    if (parsed?.kind !== 'state')
      return;
    expect(parsed.states.map((item) => item.name)).toEqual(['Idle', 'Active']);
    expect(parsed.transitions[0]).toMatchObject({ from: 'st_Idle', to: 'st_Active', label: 'start' });
    expect(generatePlantuml(parsed)).toBe(source);
  });

  it('rejects source outside the emitted subset', () => {
    expect(parseEmittedDiagram('Alice -> Bob : hi', 'Nope', 'class')).toBeNull();
    expect(parseEmittedDiagram('note over A', 'Nope', 'activity')).toBeNull();
  });
});

describe('activity grid edits', () => {
  const steps: ActivityStep[] = [
    { id: 's', label: '', kind: 'start' },
    { id: 'a', label: 'Act', kind: 'action' },
  ];

  it('inserts an if and places endif before the next stop', () => {
    const flow: ActivityStep[] = [
      { id: 's', label: '', kind: 'start' },
      { id: 'a', label: 'Act', kind: 'action' },
      { id: 'e', label: '', kind: 'stop' },
    ];
    const next = insertActivitySteps(flow, 1, 'if');
    expect(next.map((step) => step.kind)).toEqual(['start', 'if', 'action', 'endif', 'stop']);
    const action = next.findIndex((step) => step.kind === 'action');
    const nested = insertActivitySteps(next, action, 'if');
    expect(nested.map((step) => step.kind)).toEqual(['start', 'if', 'if', 'action', 'endif', 'endif', 'stop']);
  });

  it('inserts a fork together with its end fork', () => {
    const next = insertActivitySteps(steps, 2, 'fork');
    expect(next.map((step) => step.kind)).toEqual(['start', 'action', 'fork', 'endfork']);
  });

  it('deletes an if and the matching endif', () => {
    const withIf = insertActivitySteps(steps, 1, 'if');
    const decision = withIf.find((step) => step.kind === 'if');
    const next = deleteActivityStep(withIf, decision?.id ?? '');
    expect(next.map((step) => step.kind)).toEqual(['start', 'action']);
  });

  it('reorders a step by dragging it before another', () => {
    const next = moveActivityStep(steps, 'a', 's');
    expect(next.map((step) => step.id)).toEqual(['a', 's']);
  });

  it('lands a dragged step in the gap under the pointer', () => {
    const flow = [
      { id: 'a', label: '', kind: 'start' as const },
      { id: 'b', label: 'B', kind: 'action' as const },
      { id: 'c', label: 'C', kind: 'action' as const },
    ];
    const center = ACTIVITY_ORIGIN + 1.5 * ACTIVITY_PITCH;
    const slot = activityIndexAt(center, flow.length);
    const index = activityRestIndex(flow.length, 0, slot);
    const before = flow.filter((step) => step.id !== 'a')[index];
    expect(moveActivityStep(flow, 'a', before?.id ?? null).map((step) => step.id)).toEqual(['b', 'a', 'c']);
    expect(activityRestIndex(3, 2, 0)).toBe(0);
    expect(activityRestIndex(3, 1, 3)).toBe(2);
  });
});

function shape(model: { kind: string; steps?: readonly ActivityStep[] } | null): string[] {
  if (!model || model.kind !== 'activity' || !model.steps)
    return [];
  return model.steps.map((step) => `${step.kind}:${step.label}`);
}
