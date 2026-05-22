import { describe, expect, it } from 'vitest';

import { buildHttpResponseStepCapture } from './flow-step-capture';
import {
  evaluateValidationRule,
  resolveValidationActualValue,
  sanitizeValidationRulesForReferenceStepType,
  validationSourcesForReferenceStepType,
} from './flow-step-validation';

describe('flow-step-validation', () => {
  it('maps E2E reference steps to element sources', () => {
    expect(validationSourcesForReferenceStepType('E2E')).toContain('e2e_element_text');
    expect(validationSourcesForReferenceStepType('E2E')).toContain('e2e_page_url');
    expect(validationSourcesForReferenceStepType('E2E')).not.toContain('response_status');
  });

  it('maps request reference steps to response sources', () => {
    expect(validationSourcesForReferenceStepType('REQUEST')).toContain('response_status');
    expect(validationSourcesForReferenceStepType('REQUEST')).not.toContain('e2e_element_text');
  });

  it('sanitizes invalid rules when reference type changes', () => {
    const rules = sanitizeValidationRulesForReferenceStepType('E2E', [
      {
        source: 'response_status',
        expression: '',
        operator: 'equals',
        expected: '200',
      },
    ]);
    expect(rules[0]?.source).toBe('e2e_element_text');
  });

  it('evaluates page URL rules from E2E capture', () => {
    const capture = {
      kind: 'e2e_element' as const,
      capturedAt: '2026-01-01T00:00:00.000Z',
      action: 'CLICK',
      selector: 'button.submit',
      pageUrl: 'https://example.com/dashboard',
      elementText: '',
      elementHtml: '',
      elementExists: true,
    };
    const actual = resolveValidationActualValue(capture, {
      source: 'e2e_page_url',
      expression: '',
      operator: 'contains',
      expected: '/dashboard',
    });
    expect(
      evaluateValidationRule(
        { source: 'e2e_page_url', expression: '', operator: 'contains', expected: '/dashboard' },
        actual,
      ),
    ).toBe(true);
  });

  it('matches page URL without scheme, www, or trailing slash', () => {
    const rule = {
      source: 'e2e_page_url' as const,
      expression: '',
      operator: 'equals' as const,
      expected: 'magenta.at/mein-magenta-login',
    };
    expect(
      evaluateValidationRule(rule, 'https://www.magenta.at/mein-magenta-login/'),
    ).toBe(true);
    expect(
      evaluateValidationRule(rule, 'http://magenta.at/mein-magenta-login'),
    ).toBe(true);
    expect(
      evaluateValidationRule(rule, 'https://magenta.at/other-path'),
    ).toBe(false);
  });

  it('matches page URL when expected includes scheme and www', () => {
    expect(
      evaluateValidationRule(
        {
          source: 'e2e_page_url',
          expression: '',
          operator: 'equals',
          expected: 'https://www.magenta.at/mein-magenta-login/',
        },
        'http://magenta.at/mein-magenta-login',
      ),
    ).toBe(true);
  });

  it('still fails when normalized paths differ', () => {
    expect(
      evaluateValidationRule(
        {
          source: 'e2e_page_url',
          expression: '',
          operator: 'equals',
          expected: 'magenta.at/mein-magenta-kabel/',
        },
        'https://www.magenta.at/mein-magenta-login/',
      ),
    ).toBe(false);
  });

  it('evaluates HTTP status rules from cached capture', () => {
    const capture = buildHttpResponseStepCapture({
      status: { code: 200, text: 'OK' },
      body: { text: '{"ok":true}' },
      headers: [{ key: 'Content-Type', value: 'application/json' }],
    });
    const actual = resolveValidationActualValue(capture, {
      source: 'response_status',
      expression: '',
      operator: 'equals',
      expected: '200',
    });
    expect(evaluateValidationRule(
      { source: 'response_status', expression: '', operator: 'equals', expected: '200' },
      actual,
    )).toBe(true);
  });
});
