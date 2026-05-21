import { describe, expect, it } from 'vitest';

import { highlightDynamicVariableTemplate } from './dynamic-variable-highlight';
import {
  formatDynamicVariablePlaceholderHint,
  formatDynamicVariableTooltip,
} from './dynamic-variable-tooltip';
import {
  DYNAMIC_VARIABLES,
  findDynamicVariableSuggestions,
  resolveDynamicVariables,
} from './dynamic-variables';

describe('dynamicVariables', () => {
  const fixedNow = new Date('2024-06-01T12:00:00.000Z');
  const ctx = {
    now: fixedNow,
    random: () => 0.123456789,
    randomUuid: () => '11111111-2222-4333-8444-555555555555',
  };

  it('resolves uuid, timestamp, and isoTimestamp', () => {
    expect(resolveDynamicVariables('$uuid', ctx)).toBe('11111111-2222-4333-8444-555555555555');
    expect(resolveDynamicVariables('$timestamp', ctx)).toBe(String(fixedNow.getTime()));
    expect(resolveDynamicVariables('$isoTimestamp', ctx)).toBe(fixedNow.toISOString());
  });

  it('resolves randomInt with default and explicit digit count', () => {
    expect(resolveDynamicVariables('$randomInt', ctx)).toHaveLength(6);
    expect(resolveDynamicVariables('$randomInt()', ctx)).toHaveLength(6);
    expect(resolveDynamicVariables('$randomInt(6)', ctx)).toHaveLength(6);
    expect(resolveDynamicVariables('id-$randomInt(3)-end', ctx)).toMatch(/^id-\d{3}-end$/);
  });

  it('resolves randomLong and randomString', () => {
    expect(resolveDynamicVariables('$randomLong', ctx)).toHaveLength(15);
    expect(resolveDynamicVariables('$randomString', ctx)).toHaveLength(8);
    expect(resolveDynamicVariables('$randomString(4)', ctx)).toHaveLength(4);
  });

  it('leaves unknown tokens unchanged', () => {
    expect(resolveDynamicVariables('Bearer $unknown', ctx)).toBe('Bearer $unknown');
  });

  it('resolves multiple tokens in one value', () => {
    const resolved = resolveDynamicVariables('pre-$uuid-post-$timestamp', ctx);
    expect(resolved).toContain('11111111-2222-4333-8444-555555555555');
    expect(resolved).toContain(String(fixedNow.getTime()));
  });

  it('finds suggestions at caret after dollar sign', () => {
    const text = 'Bearer $uu';
    const result = findDynamicVariableSuggestions(text, text.length);
    expect(result).not.toBeNull();
    expect(result?.context.replaceStart).toBe(7);
    expect(result?.context.prefix).toBe('uu');
    expect(result?.items.some((item) => item.id === 'uuid')).toBe(true);
  });

  it('returns null when caret is outside a token', () => {
    expect(findDynamicVariableSuggestions('plain text', 5)).toBeNull();
  });
});

describe('highlightDynamicVariableTemplate', () => {
  it('wraps tokens and parenthetical parameters', () => {
    const html = highlightDynamicVariableTemplate('id-$randomInt(6)-end');
    expect(html).toContain('class="tx-var-token"');
    expect(html).toContain('data-var-id="randomInt"');
    expect(html).toContain('$randomInt</span>');
    expect(html).toContain('<span class="tx-var-param"');
    expect(html).toContain('(6)</span>');
    expect(html).toContain('id-');
    expect(html).toContain('-end');
  });

  it('highlights empty argument parentheses', () => {
    const html = highlightDynamicVariableTemplate('$randomString()');
    expect(html).toContain('<span class="tx-var-param">()</span>');
  });

  it('highlights bare tokens without parameters', () => {
    const html = highlightDynamicVariableTemplate('Bearer $uuid');
    expect(html).toContain('data-var-id="uuid"');
    expect(html).not.toContain('tx-var-param');
  });
});

describe('dynamicVariableTooltip', () => {
  it('formats token and parameter descriptions', () => {
    expect(formatDynamicVariableTooltip('uuid', DYNAMIC_VARIABLES)).toContain('Random UUID');
    expect(formatDynamicVariableTooltip('randomInt', DYNAMIC_VARIABLES, 'param')).toContain('parameter');
  });

  it('formats empty-field placeholder hint', () => {
    const hint = formatDynamicVariablePlaceholderHint(DYNAMIC_VARIABLES);
    expect(hint).toContain('$uuid');
    expect(hint).toContain('Type $');
  });
});
