import { describe, expect, it, beforeEach } from 'vitest';

import { generatePlantuml, resetPlantumlIdCounter } from './plantuml-generator';
import { layoutSequence } from './plantuml-sequence-layout';
import { parsePlantumlSequence } from './plantuml-sequence-parse';

const NESTED_SEQUENCE_SOURCE = [
  '@startuml',
  'title Checkout Flow',
  'autonumber',
  'actor User as user',
  'participant "Storefront" as store #magenta',
  'participant "Payments" as pay #LightGreen',
  'participant "Mailer" as mail',
  '== Start ==',
  'user -> store : start checkout',
  'activate store',
  'note over store',
  'Confirm cart',
  'end note',
  '== Charge ==',
  'store -> pay : charge',
  'activate pay',
  'alt payment ok',
  'pay --> store : receipt',
  'group Send receipt',
  'store -> mail : send',
  'activate mail',
  'mail --> store : queued',
  'deactivate mail',
  'end',
  'store -> store : mark paid\\n(order id)',
  'else declined',
  'pay --> store : error',
  'end',
  'loop until confirmed',
  'store -> store : poll status',
  'end',
  'deactivate pay',
  'deactivate store',
  '@enduml',
].join('\n');

describe('parsePlantumlSequence', () => {
  beforeEach(() => {
    resetPlantumlIdCounter();
  });

  it('loads a nested sequence diagram', () => {
    const model = parsePlantumlSequence(NESTED_SEQUENCE_SOURCE);
    expect(model.title).toBe('Checkout Flow');
    expect(model.autonumber).toBe(true);
    expect(model.hideFootbox).toBe(false);
    expect(model.participants).toHaveLength(4);
    expect(model.participants[0]).toMatchObject({ name: 'User', alias: 'user', role: 'actor' });
    expect(model.participants.find((item) => item.alias === 'store')?.color).toBe('#magenta');
    expect(model.participants.find((item) => item.alias === 'pay')?.color).toBe('#LightGreen');
    expect(model.participants.find((item) => item.alias === 'mail')?.color).toBeUndefined();

    const dividers = model.steps.filter((step) => step.kind === 'divider').map((step) => step.kind === 'divider' ? step.label : '');
    expect(dividers).toEqual(['Start', 'Charge']);
    expect(model.steps.filter((step) => step.kind === 'note')).toHaveLength(1);
    expect(model.steps.filter((step) => step.kind === 'message')).toHaveLength(8);
    expect(model.steps.filter((step) => step.kind === 'alt')).toHaveLength(1);
    expect(model.steps.filter((step) => step.kind === 'loop')).toHaveLength(1);
    expect(model.steps.filter((step) => step.kind === 'group')).toHaveLength(1);
    const opens = model.steps.filter((step) => step.kind === 'alt' || step.kind === 'loop' || step.kind === 'group').length;
    const ends = model.steps.filter((step) => step.kind === 'end').length;
    expect(ends).toBe(opens);

    const self = model.steps.find((step) => step.kind === 'message' && step.from === 'store' && step.to === 'store' && step.label.includes('mark paid'));
    expect(self?.kind).toBe('message');
    if (self?.kind === 'message')
      expect(self.label).toContain('\n');

    const source = generatePlantuml(model);
    expect(source).toContain('== Start ==');
    expect(source).toContain('mark paid\\n(order id)');
    expect(source).not.toContain('hide footbox');
  });

  it('keeps a typed \\n on titles, names, sections, frames, and messages', () => {
    const model = parsePlantumlSequence([
      '@startuml',
      'title Hello\\nthere',
      'participant "App\\nOne" as app',
      '== First\\npart ==',
      'alt yes\\nno',
      'else maybe\\nnot',
      'app -> app : ping\\npong',
      'note over app',
      'line one',
      'line\\ntwo',
      'end note',
      'end',
      '@enduml',
    ].join('\n'));
    expect(model.title).toBe('Hello\nthere');
    expect(model.participants[0]?.name).toBe('App\nOne');
    const divider = model.steps.find((step) => step.kind === 'divider');
    const alt = model.steps.find((step) => step.kind === 'alt');
    const branch = model.steps.find((step) => step.kind === 'else');
    const note = model.steps.find((step) => step.kind === 'note');
    const message = model.steps.find((step) => step.kind === 'message');
    expect(divider?.kind === 'divider' ? divider.label : '').toBe('First\npart');
    expect(alt?.kind === 'alt' ? alt.label : '').toBe('yes\nno');
    expect(branch?.kind === 'else' ? branch.label : '').toBe('maybe\nnot');
    expect(note?.kind === 'note' ? note.text : '').toBe('line one\nline\ntwo');
    expect(message?.kind === 'message' ? message.label : '').toBe('ping\npong');
    const source = generatePlantuml(model);
    expect(source).toContain('title Hello\\nthere');
    expect(source).toContain('"App\\nOne"');
    expect(source).toContain('== First\\npart ==');
    expect(source).toContain('alt yes\\nno');
    expect(source).toContain('else maybe\\nnot');
    expect(source).toContain('ping\\npong');
  });
});

describe('layoutSequence', () => {
  beforeEach(() => {
    resetPlantumlIdCounter();
  });

  it('stacks a nested diagram under the title with closed frames', () => {
    const model = parsePlantumlSequence(NESTED_SEQUENCE_SOURCE);
    const layout = layoutSequence(model, 1400);
    expect(layout.laneTop).toBeGreaterThan(0);
    expect(layout.dividers[0]?.y).toBeGreaterThan(layout.laneTop);
    expect(layout.messages[0]?.numberLabel).toBe('[01]');
    expect(layout.messages.at(-1)?.numberLabel).toBe('[08]');
    expect(layout.messages.some((row) => row.self)).toBe(true);
    expect(layout.frames).toHaveLength(3);
    const outer = layout.frames.find((frame) => frame.label === 'payment ok');
    const inner = layout.frames.find((frame) => frame.label === 'Send receipt');
    expect(outer).toBeTruthy();
    expect(inner).toBeTruthy();
    if (outer && inner) {
      expect(inner.y).toBeGreaterThan(outer.y);
      expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
      expect(inner.depth).toBeGreaterThan(outer.depth);
    }
    expect(layout.activations.length).toBeGreaterThan(0);
    expect(layout.activations.every((bar) => bar.height > 0)).toBe(true);
    expect(layout.laneHeight).toBeGreaterThan(layout.dividers.at(-1)?.y ?? 0);
  });
});
