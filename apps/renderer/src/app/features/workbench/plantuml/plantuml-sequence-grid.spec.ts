import { describe, expect, it, beforeEach } from 'vitest';

import { resetPlantumlIdCounter, seqMsg, type SequenceModel } from './plantuml-generator';
import {
  frameChromeIds,
  layoutSequence,
  moveFrameBlock,
  moveSequenceStep,
  resizeFrameEdge,
  stepIdBeforeY,
} from './plantuml-sequence-layout';

describe('plantuml sequence grid layout', () => {
  beforeEach(() => {
    resetPlantumlIdCounter();
  });

  it('keeps a message under the participant heads', () => {
    const model: SequenceModel = {
      kind: 'sequence',
      title: 'Ping',
      autonumber: true,
      hideFootbox: false,
      participants: [
        { id: 'a', name: 'User', alias: 'user', role: 'actor' },
        { id: 'b', name: 'Storefront', alias: 'store', color: '#magenta' },
      ],
      steps: [
        seqMsg('user', '->', 'store', 'login'),
      ],
    };
    const layout = layoutSequence(model, 960);
    expect(layout.lanes).toHaveLength(2);
    expect(layout.lanes[1].center).toBeGreaterThan(layout.lanes[0].center);
    expect(layout.messages[0]?.arrowY).toBeGreaterThan(layout.laneTop);
    expect(layout.messages[0]?.numberLabel).toBe('[01]');
    expect(layout.messages[0]?.dashed).toBe(false);
    expect(layout.width).toBeGreaterThan(0);
  });

  it('spaces single-line arrows 29px apart and adds 15px per extra line', () => {
    const model: SequenceModel = {
      kind: 'sequence',
      title: '',
      autonumber: false,
      hideFootbox: true,
      participants: [
        { id: 'a', name: 'A', alias: 'a' },
        { id: 'b', name: 'B', alias: 'b' },
      ],
      steps: [
        seqMsg('a', '->', 'b', 'one'),
        seqMsg('b', '-->', 'a', 'two'),
        seqMsg('a', '->', 'b', 'three\nfour'),
      ],
    };
    const layout = layoutSequence(model, 800);
    const [first, second, third] = layout.messages;
    expect(second.arrowY - first.arrowY).toBe(29);
    expect(third.arrowY - second.arrowY).toBe(44);
    expect(second.dashed).toBe(true);
    expect(first.headAtTo).toBe(true);
  });

  it('opens a wider gap for a long label than for a short one', () => {
    const model: SequenceModel = {
      kind: 'sequence',
      title: 'Gaps',
      autonumber: true,
      hideFootbox: false,
      participants: [
        { id: 'a', name: 'Left', alias: 'a' },
        { id: 'b', name: 'Mid', alias: 'b' },
        { id: 'c', name: 'Right', alias: 'c' },
      ],
      steps: [
        seqMsg('a', '->', 'b', 'ok'),
        seqMsg('b', '->', 'c', 'POST /internal/auth-requests create backchannel auth request'),
      ],
    };
    const layout = layoutSequence(model, 400);
    const [left, mid, right] = layout.lanes;
    const shortGap = mid.center - left.center;
    const longGap = right.center - mid.center;
    expect(longGap).toBeGreaterThan(shortGap);
  });

  it('places a dragged message before the row under the pointer', () => {
    expect(stepIdBeforeY([{ y: 140, id: 'b' }, { y: 100, id: 'a' }], 90)).toBe('a');
    expect(stepIdBeforeY([{ y: 100, id: 'a' }, { y: 140, id: 'b' }], 120)).toBe('b');
    expect(stepIdBeforeY([{ y: 100, id: 'a' }, { y: 140, id: 'b' }], 200)).toBeNull();
  });

  it('deletes a frame by removing its header and matching end', () => {
    expect(frameChromeIds([
      { id: 'a', kind: 'alt' },
      { id: 'm', kind: 'message' },
      { id: 'inner', kind: 'loop' },
      { id: 'e1', kind: 'end' },
      { id: 'e2', kind: 'end' },
    ], 'a')).toEqual(['a', 'e2']);
  });

  it('moves an alt block, including its contents, before an earlier message', () => {
    const steps = [
      { id: 'm0', kind: 'message' },
      { id: 'a', kind: 'alt' },
      { id: 'm1', kind: 'message' },
      { id: 'e', kind: 'end' },
      { id: 'm2', kind: 'message' },
    ];
    expect(ids(moveFrameBlock(steps, 'a', 'm0'))).toEqual(['a', 'm1', 'e', 'm0', 'm2']);
    expect(moveFrameBlock(steps, 'a', 'm1')).toBe(steps);
  });

  it('resizes the bottom edge so the following message sits inside the alt', () => {
    const steps = [
      { id: 'a', kind: 'alt' },
      { id: 'mA', kind: 'message' },
      { id: 'e', kind: 'end' },
      { id: 'mB', kind: 'message' },
    ];
    expect(ids(resizeFrameEdge(steps, 'a', 'end', null))).toEqual(['a', 'mA', 'mB', 'e']);
  });

  it('keeps a nested alt intact when the outer bottom edge is dragged through it', () => {
    const steps = [
      { id: 'a', kind: 'alt' },
      { id: 'mA', kind: 'message' },
      { id: 'inner', kind: 'alt' },
      { id: 'mB', kind: 'message' },
      { id: 'e1', kind: 'end' },
      { id: 'e2', kind: 'end' },
    ];
    const next = resizeFrameEdge(steps, 'a', 'end', 'mB');
    const inner = next.findIndex((step) => step.id === 'inner');
    const innerEnd = next.findIndex((step) => step.id === 'e1');
    const outerEnd = next.findIndex((step) => step.id === 'e2');
    expect(outerEnd < inner || outerEnd > innerEnd).toBe(true);
    expect(innerEnd).toBe(inner + 2);
  });

  it('resizes the top edge upward so the message above joins the alt', () => {
    const steps = [
      { id: 'mA', kind: 'message' },
      { id: 'a', kind: 'alt' },
      { id: 'mB', kind: 'message' },
      { id: 'e', kind: 'end' },
    ];
    expect(ids(resizeFrameEdge(steps, 'a', 'start', 'mA'))).toEqual(['a', 'mA', 'mB', 'e']);
  });

  it('treats a typed \\n as a line break on the title, name, and message', () => {
    const plain = layoutSequence(breakModel('Ping', 'User', 'one'), 800);
    const broken = layoutSequence(breakModel('Ping\\nPong', 'Us\\ner', 'one\\ntwo'), 800);
    expect(broken.laneTop - plain.laneTop).toBe(16);
    expect(broken.headBand - plain.headBand).toBe(16);
    expect(broken.messages[0]?.label).toBe('one\ntwo');
    expect((broken.messages[0]?.arrowY ?? 0) - (plain.messages[0]?.arrowY ?? 0)).toBe(47);
    expect(broken.dividers[0]?.label).toBe('First\npart');
    expect(broken.dividers[0]?.height).toBe(38);
    expect(broken.notes[0]?.text).toBe('line\ntwo');
    expect(broken.frames[0]?.label).toBe('yes\nno');
  });

  it('moves an arrow or a section without changing order when it is already there', () => {
    const steps = [
      { id: 'section', kind: 'divider' },
      { id: 'arrow', kind: 'message' },
      { id: 'next', kind: 'message' },
    ];
    expect(ids(moveSequenceStep(steps, 'arrow', 'section'))).toEqual(['arrow', 'section', 'next']);
    expect(ids(moveSequenceStep(steps, 'section', null))).toEqual(['arrow', 'next', 'section']);
    expect(moveSequenceStep(steps, 'arrow', 'next')).toBe(steps);
  });
});

function ids(steps: readonly { id: string }[]): string[] {
  return steps.map((step) => step.id);
}

function breakModel(title: string, name: string, label: string): SequenceModel {
  return {
    kind: 'sequence',
    title,
    autonumber: false,
    hideFootbox: true,
    participants: [
      { id: 'a', name, alias: 'a' },
      { id: 'b', name: 'B', alias: 'b' },
    ],
    steps: [
      { id: 'd', kind: 'divider', label: 'First\\npart' },
      { id: 'n', kind: 'note', over: 'a', text: 'line\\ntwo' },
      { id: 'alt', kind: 'alt', label: 'yes\\nno' },
      seqMsg('a', '->', 'b', label),
      { id: 'e', kind: 'end' },
    ],
  };
}
