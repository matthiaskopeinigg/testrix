import { describe, expect, it } from 'vitest';

import { createFlowStep } from '@shared/testing';

import {
  assignValidationLinkLanes,
  buildFlowValidationLinkGraphic,
  buildFlowValidationLinkPath,
  collectFlowValidationReferenceLinks,
  validationLinkRailX,
} from './flow-step-validation-tree-links';

describe('flow-step-validation-tree-links', () => {
  it('collects validation links when ref step exists in the tree', () => {
    const request = createFlowStep('REQUEST', 'Get health');
    request.id = 'step-req';
    const validation = createFlowStep('VALIDATION', 'Check status');
    validation.id = 'step-val';
    validation.config = { refStepId: 'step-req', rules: [] };

    expect(collectFlowValidationReferenceLinks([request, validation])).toEqual([
      { validationId: 'step-val', refId: 'step-req' },
    ]);
  });

  it('assigns unique lanes per validation link', () => {
    const order = new Map([
      ['val-a', 2],
      ['val-b', 4],
    ]);
    const lanes = assignValidationLinkLanes(
      [
        { validationId: 'val-b', refId: 'ref-1' },
        { validationId: 'val-a', refId: 'ref-2' },
      ],
      order,
    );
    expect(lanes.get('val-a')).toBe(0);
    expect(lanes.get('val-b')).toBe(1);
  });

  it('staggers rail positions by lane in the left gutter', () => {
    expect(validationLinkRailX(0)).toBe(4);
    expect(validationLinkRailX(1)).toBe(10);
  });

  it('builds a rounded connector from validation back to the reference row', () => {
    const path = buildFlowValidationLinkPath({ x: 40, y: 20 }, { x: 40, y: 80 }, 26);
    expect(path).toContain('M 40 80');
    expect(path).toContain('H 40');
    expect(path).toContain('Q');
  });

  it('includes endpoint metadata in the link graphic', () => {
    const graphic = buildFlowValidationLinkGraphic(
      'step-val',
      { x: 40, y: 20 },
      { x: 40, y: 80 },
      { lane: 0, highlighted: true },
    );
    expect(graphic.refDot).toEqual({ x: 40, y: 20 });
    expect(graphic.validationDot).toEqual({ x: 40, y: 80 });
    expect(graphic.highlighted).toBe(true);
  });
});
