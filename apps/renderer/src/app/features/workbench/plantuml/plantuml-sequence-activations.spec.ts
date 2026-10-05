import { describe, expect, it, beforeEach } from 'vitest';

import { resetPlantumlIdCounter, seqMsg, type SequenceStep } from './plantuml-generator';
import { ensureSequenceActivations } from './plantuml-sequence-activations';
import { parsePlantumlSequence } from './plantuml-sequence-parse';

const NESTED_SEQUENCE_SOURCE = [
  '@startuml',
  'title Checkout Flow',
  'actor User as user',
  'participant "Storefront" as store',
  'participant "Payments" as pay',
  'participant "Mailer" as mail',
  'user -> store : start checkout',
  'activate store',
  'store -> pay : charge',
  'activate pay',
  'pay --> store : receipt',
  'deactivate pay',
  'store -> mail : send',
  'activate mail',
  'mail --> store : queued',
  'deactivate mail',
  'store --> user : done',
  'deactivate store',
  '@enduml',
].join('\n');

describe('ensureSequenceActivations', () => {
  beforeEach(() => {
    resetPlantumlIdCounter();
  });

  it('opens a bar when a participant is called and answers', () => {
    const steps = ensureSequenceActivations([
      seqMsg('a', '->', 'b', 'ask'),
      seqMsg('b', '-->', 'a', 'ok'),
    ]);
    expect(trace(steps)).toEqual([
      'a -> b',
      'activate b',
      'b --> a',
      'deactivate b',
    ]);
  });

  it('keeps a bar that stays open across a reply', () => {
    const steps: SequenceStep[] = [
      seqMsg('user', '->', 'web', 'login'),
      { id: 'on', kind: 'activate', target: 'web' },
      seqMsg('web', '-->', 'user', 'show'),
    ];
    expect(trace(ensureSequenceActivations(steps))).toEqual([
      'user -> web',
      'activate web',
      'web --> user',
    ]);
  });

  it('nests the callee inside the caller', () => {
    const steps = ensureSequenceActivations([
      seqMsg('a', '->', 'b', 'ask'),
      seqMsg('b', '->', 'c', 'ask'),
      seqMsg('c', '-->', 'b', 'ok'),
      seqMsg('b', '-->', 'a', 'ok'),
    ]);
    expect(trace(steps)).toEqual([
      'a -> b',
      'activate b',
      'b -> c',
      'activate c',
      'c --> b',
      'deactivate c',
      'b --> a',
      'deactivate b',
    ]);
  });

  it('does not add a second copy of a bar it already created', () => {
    const once = ensureSequenceActivations([
      seqMsg('gateway', '->', 'auth', 'ready?'),
      seqMsg('auth', '-->', 'gateway', 'yes'),
    ]);
    expect(trace(ensureSequenceActivations(once))).toEqual(trace(once));
  });

  it('fills reply bars without closing the long-lived caller bar', () => {
    const model = parsePlantumlSequence(NESTED_SEQUENCE_SOURCE);
    const marks = model.steps.filter((step) => step.kind === 'activate' || step.kind === 'deactivate');
    const count = (kind: 'activate' | 'deactivate', target: string) =>
      marks.filter((step) => step.kind === kind && step.target === target).length;
    expect(count('activate', 'pay')).toBeGreaterThan(0);
    expect(count('deactivate', 'pay')).toBe(count('activate', 'pay'));
    expect(count('activate', 'store')).toBe(1);
    expect(count('deactivate', 'mail')).toBe(1);
    expect(count('deactivate', 'store')).toBe(1);
    expect(trace(ensureSequenceActivations(model.steps))).toEqual(trace(model.steps));
  });
});

function trace(steps: readonly SequenceStep[]): string[] {
  return steps.map((step) => {
    if (step.kind === 'message')
      return `${step.from} ${step.arrow} ${step.to}`;
    if (step.kind === 'activate' || step.kind === 'deactivate')
      return `${step.kind} ${step.target}`;
    return step.kind;
  });
}
