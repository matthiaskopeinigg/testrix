import { describe, expect, it } from 'vitest';

import { e2eUrlMatchesExpectation, resolveE2eUrlExpectation } from '@shared/testing';

import { e2eSelectorFieldLabel, layoutForE2eAction } from './flow-e2e-action-fields';

describe('layoutForE2eAction', () => {
  it('shows page URL and timeout for navigate', () => {
    expect(layoutForE2eAction('NAVIGATE_TO')).toEqual({
      selector: false,
      selectorPick: false,
      pageUrl: true,
      text: false,
      expectedText: false,
      expectedUrl: false,
      screenshotFileName: false,
      timeout: true,
    });
  });

  it('shows selector, pick, and timeout for click', () => {
    expect(layoutForE2eAction('CLICK')).toEqual({
      selector: true,
      selectorPick: true,
      pageUrl: false,
      text: false,
      expectedText: false,
      expectedUrl: false,
      screenshotFileName: false,
      timeout: true,
    });
  });

  it('shows selector, pick, text, and timeout for type text', () => {
    expect(layoutForE2eAction('TYPE_TEXT')).toEqual({
      selector: true,
      selectorPick: true,
      pageUrl: false,
      text: true,
      expectedText: false,
      expectedUrl: false,
      screenshotFileName: false,
      timeout: true,
    });
  });

  it('shows expected text for assert element', () => {
    expect(layoutForE2eAction('ASSERT_ELEMENT').expectedText).toBe(true);
    expect(layoutForE2eAction('ASSERT_ELEMENT').selector).toBe(true);
  });

  it('shows expected URL for assert and wait-for-url actions', () => {
    expect(layoutForE2eAction('ASSERT_URL').expectedUrl).toBe(true);
    expect(layoutForE2eAction('WAIT_FOR_URL').expectedUrl).toBe(true);
  });

  it('reads assert/wait URL from the editor value field, not the CSS selector', () => {
    expect(resolveE2eUrlExpectation('', 'https://example.com/app')).toBe('https://example.com/app');
    expect(e2eUrlMatchesExpectation('https://www.example.com/app/', 'https://example.com/app')).toBe(
      true,
    );
    expect(e2eUrlMatchesExpectation('https://example.com/app', '')).toBe(false);
  });

  it('labels screenshot selector as optional', () => {
    expect(e2eSelectorFieldLabel('SCREENSHOT')).toBe('Element (optional)');
    expect(e2eSelectorFieldLabel('CLICK')).toBe('CSS selector');
  });
});
