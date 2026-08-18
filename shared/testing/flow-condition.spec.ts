import { describe, expect, it } from 'vitest';

import {
  evaluateFlowCondition,
  parseForEachSource,
  shouldRunSkipUnless,
  type FlowCondition,
} from './flow-condition';

const identity = (raw: string) => raw;

describe('evaluateFlowCondition', () => {
  it('ANDs clauses and resolves placeholders', () => {
    const condition: FlowCondition = {
      clauses: [
        { left: '{{status}}', operator: 'equals', right: '200' },
        { left: '{{ok}}', operator: 'equals', right: 'true' },
      ],
    };
    const resolve = (raw: string) =>
      raw === '{{status}}' ? '200' : raw === '{{ok}}' ? 'true' : raw;
    expect(evaluateFlowCondition(condition, resolve)).toBe(true);
    expect(
      evaluateFlowCondition(condition, (raw) => (raw === '{{ok}}' ? 'false' : resolve(raw))),
    ).toBe(false);
  });

  it('returns false for empty clauses', () => {
    expect(evaluateFlowCondition({ clauses: [] }, identity)).toBe(false);
  });
});

describe('shouldRunSkipUnless', () => {
  it('runs when skip-unless is empty', () => {
    expect(shouldRunSkipUnless(undefined, identity)).toBe(true);
    expect(shouldRunSkipUnless({ clauses: [{ left: '', operator: 'equals', right: '' }] }, identity)).toBe(
      true,
    );
  });

  it('skips when the condition does not match', () => {
    expect(
      shouldRunSkipUnless({ clauses: [{ left: 'no', operator: 'equals', right: 'yes' }] }, identity),
    ).toBe(false);
  });
});

describe('parseForEachSource', () => {
  it('parses JSON arrays and comma lists', () => {
    expect(parseForEachSource('["a","b"]')).toEqual(['a', 'b']);
    expect(parseForEachSource('a, b')).toEqual(['a', 'b']);
  });
});
